import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { hashKey, newKey, personForKey } from '../src/lib/mcp/keys';
import { handleRpc, TOOLS } from '../src/lib/mcp/server';

describe('MCP keys', () => {
  it('are long random strings with a recognisable start, stored only as a hash', () => {
    const k = newKey();
    expect(k.plain).toMatch(/^apw_[A-Za-z0-9_-]{43}$/);
    expect(k.hash).toBe(createHash('sha256').update(k.plain).digest('hex'));
    expect(newKey().plain).not.toBe(k.plain);
  });
  // A stand-in for the database's mcp_keys and people rows.
  const db = (rows: { key_hash: string; revoked_at: string | null; people: object | null }[]) =>
    ({
      from: () => {
        const q: any = { f: {} };
        q.select = () => q;
        q.eq = (k: string, v: unknown) => { q.f[k] = v; return q; };
        q.is = () => q;
        q.update = () => ({ eq: () => Promise.resolve({}) });
        q.maybeSingle = async () => ({ data: rows.find((r) => r.key_hash === q.f.key_hash && !r.revoked_at) ?? null });
        return q;
      },
    }) as any;
  it('finds the builder behind a key', async () => {
    const k = newKey();
    expect(await personForKey(db([{ key_hash: k.hash, revoked_at: null, people: { id: 'p1', handle: 'maya', is_builder: true } }]), `Bearer ${k.plain}`)).toMatchObject({ id: 'p1' });
  });
  it('refuses a missing, unknown or revoked key, and a key whose builder is gone', async () => {
    const k = newKey();
    expect(await personForKey(db([]), null)).toBeNull();
    expect(await personForKey(db([]), `Bearer ${k.plain}`)).toBeNull();
    expect(await personForKey(db([{ key_hash: k.hash, revoked_at: '2026-11-13', people: { id: 'p1' } }]), `Bearer ${k.plain}`)).toBeNull();
    expect(await personForKey(db([{ key_hash: k.hash, revoked_at: null, people: null }]), `Bearer ${k.plain}`)).toBeNull();
  });
});

describe('the MCP protocol', () => {
  const ctx = { person: { id: 'p1' } as any, db: {} as any, origin: 'https://www.antipaywall.org' };
  it('introduces itself', async () => {
    const r: any = await handleRpc({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } }, ctx);
    expect(r.result.serverInfo.name).toBe('antipaywall');
    expect(r.result.capabilities.tools).toBeDefined();
  });
  it('lists its tools', async () => {
    const r: any = await handleRpc({ jsonrpc: '2.0', id: 2, method: 'tools/list' }, ctx);
    expect(r.result.tools.map((t: any) => t.name)).toEqual(TOOLS.map((t) => t.name));
    expect(TOOLS.map((t) => t.name)).toEqual(['search', 'alternatives_to', 'get_gap', 'top_gaps', 'post_idea', 'me_too', 'suggest_improvement', 'follow']);
  });
  it('answers notifications with nothing', async () => {
    expect(await handleRpc({ jsonrpc: '2.0', method: 'notifications/initialized' }, ctx)).toBeNull();
  });
  it('says so for an unknown method or tool', async () => {
    const r: any = await handleRpc({ jsonrpc: '2.0', id: 3, method: 'nope' }, ctx);
    expect(r.error.code).toBe(-32601);
    const t: any = await handleRpc({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'nope', arguments: {} } }, ctx);
    expect(t.result.isError).toBe(true);
  });
});
