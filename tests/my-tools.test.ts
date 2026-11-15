import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { addMyTool, listMyTools, removeMyTool, resolveTool } from '../src/lib/myTools';

// A small stand-in for the three tables "my tools" reads and writes.
function fakeDb(seed: { products: { id: string; slug: string; name: string; aliases?: string[] }[]; paid?: any[]; signals?: any[]; asked?: any[] }) {
  const tables: Record<string, any[]> = { products: seed.products, paid_tools: seed.paid ?? [], signals: seed.signals ?? [], asked_tools: seed.asked ?? [] };
  const from = (table: string) => {
    const filters: ((r: any) => boolean)[] = [];
    let op: 'select' | 'insert' | 'update' | 'delete' = 'select';
    let payload: any = null;
    const rows = () => tables[table].filter((r) => filters.every((f) => f(r)));
    const run = () => {
      if (op === 'insert') { tables[table].push({ id: `s${tables[table].length + 1}`, ...payload }); return { data: null, error: null }; }
      if (op === 'update') { for (const r of rows()) Object.assign(r, payload); return { data: null, error: null }; }
      if (op === 'delete') { const gone = rows(); tables[table] = tables[table].filter((r) => !gone.includes(r)); return { data: gone, error: null }; }
      return { data: rows(), error: null };
    };
    const q: any = {
      select: () => q,
      insert: (v: any) => { op = 'insert'; payload = v; return q; },
      update: (v: any) => { op = 'update'; payload = v; return q; },
      delete: () => { op = 'delete'; return q; },
      eq: (k: string, v: unknown) => { filters.push((r) => r[k] === v); return q; },
      neq: (k: string, v: unknown) => { filters.push((r) => r[k] !== v); return q; },
      in: (k: string, v: unknown[]) => { filters.push((r) => v.includes(r[k])); return q; },
      contains: (k: string, v: unknown[]) => { filters.push((r) => v.every((x) => (r[k] ?? []).includes(x))); return q; },
      order: () => q,
      limit: () => q,
      maybeSingle: async () => ({ data: run().data?.[0] ?? null, error: null }),
      then: (ok: (v: any) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve(run()).then(ok, bad),
    };
    return q;
  };
  return { db: { from } as any, tables };
}
const asked = (domain: string, name: string, extra: object = {}) => ({ domain, name, tagline: '', description: '', price_cents: null, price_period: null, words: [], phrases: [], repos: [], best_stars: 0, askers: [], status: 'new', read_ok: true, fetched_at: new Date().toISOString(), ...extra });
const products = [{ id: 'c1', slug: 'calendly', name: 'Calendly' }, { id: 'l1', slug: 'loom', name: 'Loom' }];

describe('the tools someone pays for', () => {
  it('are a catalog tool by its slug or its website, or a looked-up tool by its website', async () => {
    const { db } = fakeDb({ products });
    expect(await resolveTool(db, 'Calendly')).toEqual({ kind: 'catalog', slug: 'calendly' });
    expect(await resolveTool(db, 'https://calendly.com/pricing')).toEqual({ kind: 'catalog', slug: 'calendly' });
    expect(await resolveTool(db, 'annot.io')).toEqual({ kind: 'asked', domain: 'annot.io' });
    for (const bad of ['', 'not a tool', 'localhost', 'nope']) expect(await resolveTool(db, bad), bad).toBeNull();
  });
  it('are added once, in their own table', async () => {
    const { db, tables } = fakeDb({ products });
    expect(await addMyTool(db, 'p1', 'calendly')).toEqual({ ok: true, tool: { kind: 'catalog', slug: 'calendly', name: 'Calendly' }, already: false });
    expect(await addMyTool(db, 'p1', 'calendly.com')).toMatchObject({ ok: true, already: true });
    expect(tables.paid_tools).toEqual([expect.objectContaining({ person_id: 'p1', product_id: 'c1' })]);
    expect(tables.signals).toEqual([]);
  });
  it('never touch signals, so "I would pay if it worked" is never inflated', () => {
    expect(readFileSync('src/lib/myTools.ts', 'utf8')).not.toMatch(/from\('signals'\)|pay_cents/);
    const sql = readFileSync('supabase/migrations/0021_paid_tools.sql', 'utf8').replace(/--.*$/gm, '');
    expect(sql).toMatch(/create table public\.paid_tools/);
    expect(sql).not.toMatch(/signals/);
  });
  it('count a person among those who asked about a looked-up tool, and refuse one nobody has looked up', async () => {
    const { db, tables } = fakeDb({ products, asked: [asked('annot.io', 'Annot', { askers: ['v:someone'] }), asked('spam.io', 'Spam', { status: 'hidden' })] });
    expect(await addMyTool(db, 'p1', 'annot.io')).toEqual({ ok: true, tool: { kind: 'asked', domain: 'annot.io', name: 'Annot' }, already: false });
    expect(await addMyTool(db, 'p1', 'https://www.annot.io')).toMatchObject({ already: true });
    expect(tables.asked_tools[0].askers).toEqual(['v:someone', 'u:p1']);
    expect(await addMyTool(db, 'p1', 'unknown-tool.io')).toEqual({ ok: false, reason: 'not_looked_up' });
    expect(await addMyTool(db, 'p1', 'spam.io')).toEqual({ ok: false, reason: 'unknown' });
    expect(await addMyTool(db, 'p1', 'not a tool')).toEqual({ ok: false, reason: 'unknown' });
  });
  it('are listed, and removed, for that person only', async () => {
    const { db, tables } = fakeDb({
      products,
      paid: [{ person_id: 'p1', product_id: 'c1' }, { person_id: 'p2', product_id: 'c1' }],
      signals: [{ id: 's3', subject_kind: 'product', subject_id: 'l1', kind: 'pay', user_id: 'p1', pay_cents: 500 }],
      asked: [asked('annot.io', 'Annot', { askers: ['u:p1', 'u:p2'] })],
    });
    expect(await listMyTools(db, 'p1')).toEqual([{ kind: 'catalog', slug: 'calendly', name: 'Calendly' }, { kind: 'asked', domain: 'annot.io', name: 'Annot' }]);
    expect(await removeMyTool(db, 'p1', 'calendly')).toBe(true);
    expect(await removeMyTool(db, 'p1', 'calendly')).toBe(false);
    expect(await removeMyTool(db, 'p1', 'annot.io')).toBe(true);
    // The other person's entries and the would-pay signal are untouched.
    expect(tables.paid_tools).toEqual([{ person_id: 'p2', product_id: 'c1' }]);
    expect(tables.signals.map((s) => s.id)).toEqual(['s3']);
    expect(tables.asked_tools[0].askers).toEqual(['u:p2']);
    expect(await listMyTools(db, 'p1')).toEqual([]);
  });
});
