import { describe, expect, it } from 'vitest';
import { demandKey, PAY_CHOICES, parseSignal, toggleSignal } from '../src/lib/signals';

const id = '0b5c1d7e-3f2a-4c8b-9d1e-2a3b4c5d6e7f';
const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};

describe('parseSignal', () => {
  it('accepts "I use a free one" on a product', () => {
    expect(parseSignal(form({ subject_kind: 'product', subject_id: id, kind: 'use', on: '1' }))).toEqual({
      ok: true, subjectKind: 'product', subjectId: id, kind: 'use', on: true, payCents: null, payPeriod: null,
    });
  });
  it('accepts a would-pay of $5 a month', () => {
    expect(parseSignal(form({ subject_kind: 'gap', subject_id: id, kind: 'pay', on: '1', pay: 'month:500' }))).toMatchObject({ ok: true, payCents: 500, payPeriod: 'month' });
  });
  it('treats on=0 as taking the signal back', () => {
    expect(parseSignal(form({ subject_kind: 'project', subject_id: id, kind: 'use', on: '0' }))).toMatchObject({ ok: true, on: false });
  });
  it('rejects a kind it does not know', () => {
    expect(parseSignal(form({ subject_kind: 'product', subject_id: id, kind: 'love', on: '1' }))).toEqual({ ok: false, code: 'save_failed' });
  });
  it('rejects an id that is not a uuid', () => {
    expect(parseSignal(form({ subject_kind: 'product', subject_id: 'calendly', kind: 'use', on: '1' }))).toEqual({ ok: false, code: 'save_failed' });
  });
  it('rejects an amount that is not one of the choices', () => {
    expect(parseSignal(form({ subject_kind: 'gap', subject_id: id, kind: 'pay', on: '1', pay: 'month:777' }))).toEqual({ ok: false, code: 'bad_pay' });
  });
  it('rejects a would-pay with no period', () => {
    expect(parseSignal(form({ subject_kind: 'gap', subject_id: id, kind: 'pay', on: '1', pay: '500' }))).toEqual({ ok: false, code: 'bad_pay' });
  });
  it('lets a would-pay be taken back without an amount', () => {
    expect(parseSignal(form({ subject_kind: 'gap', subject_id: id, kind: 'pay', on: '0' }))).toMatchObject({ ok: true, on: false, payCents: null });
  });
  it('offers monthly and one-time amounts', () => {
    expect(PAY_CHOICES.month).toContain(500);
    expect(PAY_CHOICES.once).toContain(1000);
  });
});

describe('demandKey', () => {
  it('counts a signed-in person by their user id, whatever browser they use', () => {
    expect(demandKey('u1', 'browser-a')).toBe(demandKey('u1', 'browser-b'));
  });
  it('counts someone not signed in by their browser', () => {
    expect(demandKey(null, 'browser-a')).not.toBe(demandKey(null, 'browser-b'));
  });
});

// A stand-in for the database that records what was asked of it.
function fakeDb() {
  const calls: { op: string; table: string; args: unknown }[] = [];
  const builder = (table: string) => {
    const b: any = {
      upsert: (row: unknown, opts: unknown) => { calls.push({ op: 'upsert', table, args: { row, opts } }); return Promise.resolve({ error: null }); },
      insert: (row: unknown) => { calls.push({ op: 'insert', table, args: row }); return Promise.resolve({ error: null }); },
      delete: () => { const q: any = { filters: {} as Record<string, unknown> }; q.eq = (k: string, v: unknown) => { q.filters[k] = v; return q; }; q.is = (k: string, v: unknown) => { q.filters[k] = v; return q; }; q.then = (res: any) => { calls.push({ op: 'delete', table, args: q.filters }); return Promise.resolve({ error: null }).then(res); }; return q; },
    };
    return b;
  };
  return { calls, db: { from: builder } as any };
}

describe('toggleSignal', () => {
  const s = { subjectKind: 'product' as const, subjectId: id, kind: 'use' as const, payCents: null, payPeriod: null };
  it('adds a signal for someone not signed in, keyed by their browser', async () => {
    const { calls, db } = fakeDb();
    await toggleSignal(db, { ...s, on: true }, { userId: null, visitor: 'v1' });
    expect(calls).toHaveLength(2);
    expect(calls[0]).toEqual({ op: 'delete', table: 'signals', args: { subject_kind: 'product', subject_id: id, kind: 'use', visitor: 'v1' } });
    expect(calls[1]).toMatchObject({ op: 'insert', table: 'signals', args: { subject_kind: 'product', subject_id: id, kind: 'use', visitor: 'v1', user_id: null } });
  });
  it('takes it back with the same key', async () => {
    const { calls, db } = fakeDb();
    await toggleSignal(db, { ...s, on: false }, { userId: null, visitor: 'v1' });
    expect(calls).toEqual([{ op: 'delete', table: 'signals', args: { subject_kind: 'product', subject_id: id, kind: 'use', visitor: 'v1' } }]);
  });
  it('keys a signed-in person by their user id, so another browser replaces rather than adds', async () => {
    const { calls, db } = fakeDb();
    await toggleSignal(db, { ...s, on: true }, { userId: 'u1', visitor: 'v2' });
    expect(calls[0]).toMatchObject({ op: 'delete', args: { user_id: 'u1' } });
    expect(calls[1]).toMatchObject({ op: 'insert', args: { user_id: 'u1', visitor: 'v2' } });
  });
});

describe('review fixes: signals', () => {
  const s = { subjectKind: 'product' as const, subjectId: id, kind: 'use' as const, payCents: null, payPeriod: null };
  it('signed out, takes back a signal this browser gave while signed in, so the browser never counts twice', async () => {
    const { calls, db } = fakeDb();
    await toggleSignal(db, { ...s, on: false }, { userId: null, visitor: 'v1' });
    expect(calls).toEqual([{ op: 'delete', table: 'signals', args: { subject_kind: 'product', subject_id: id, kind: 'use', visitor: 'v1' } }]);
  });
});
