import { describe, expect, it } from 'vitest';
import { ensureVisitorId, visitorId } from '../src/lib/visitor';

// The smallest stand-in for Astro's cookie jar.
function jar(initial?: string) {
  const store = new Map<string, { value: string; options?: any }>();
  if (initial !== undefined) store.set('apw_visitor', { value: initial });
  return {
    get: (name: string) => store.get(name),
    set: (name: string, value: string, options: any) => void store.set(name, { value, options }),
    store,
  } as any;
}

describe('visitor id', () => {
  it('is absent until a heart is given', () => {
    expect(visitorId(jar())).toBeUndefined();
  });
  it('ignores anything that is not a uuid', () => {
    expect(visitorId(jar("x' or 1=1"))).toBeUndefined();
    expect(visitorId(jar('123'))).toBeUndefined();
  });
  it('is created once, hidden from page scripts, and then reused', () => {
    const cookies = jar();
    const id = ensureVisitorId(cookies, true);
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(cookies.store.get('apw_visitor').options).toMatchObject({ httpOnly: true, sameSite: 'lax', secure: true, path: '/' });
    expect(ensureVisitorId(cookies, true)).toBe(id);
  });
});
