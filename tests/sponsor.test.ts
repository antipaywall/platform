import { describe, expect, it } from 'vitest';
import { parseSponsor } from '../src/lib/forms';

const base = { name: 'Acme', amount: '1000', kind: 'pool', status: 'pledged' };
const s = (over: Record<string, unknown> = {}) => parseSponsor({ ...base, ...over });

describe('parseSponsor', () => {
  it('accepts a minimal sponsor and defaults to not listed', () => {
    expect(s()).toEqual({
      ok: true,
      sponsor: { name: 'Acme', url: null, logoUrl: null, amountCents: 100000, kind: 'pool', status: 'pledged', note: '', listed: false },
    });
  });
  it('lists only when the box is ticked', () => {
    expect(s({ listed: 'on' })).toMatchObject({ sponsor: { listed: true } });
    expect(s({ listed: 'yes' })).toMatchObject({ sponsor: { listed: false } });
  });
  it.each(['http://acme.example/logo.png', 'javascript:alert(1)', 'data:image/svg+xml,<svg onload=alert(1)>', '//acme.example/x.png', 'acme', 'https://localhost'])(
    'refuses %s as a logo or a link',
    (u) => {
      expect(s({ logoUrl: u }).ok).toBe(false);
      expect(s({ url: u }).ok).toBe(false);
    },
  );
  it('keeps https links and logos', () => {
    expect(s({ url: 'https://acme.example', logoUrl: 'https://acme.example/logo.svg' })).toMatchObject({
      sponsor: { url: 'https://acme.example/', logoUrl: 'https://acme.example/logo.svg' },
    });
  });
  it.each(['', '0', '0.99', '-5', 'lots', '1e6'])('refuses the amount %s', (a) => {
    expect(s({ amount: a }).ok).toBe(false);
  });
  it('only knows pool or bounty, pledged or paid', () => {
    expect(s({ kind: 'gift' }).ok).toBe(false);
    expect(s({ status: 'promised' }).ok).toBe(false);
    expect(s({ kind: 'bounty', status: 'paid' })).toMatchObject({ sponsor: { kind: 'bounty', status: 'paid' } });
  });
  it('needs a name of 1 to 80 characters and a note of at most 200', () => {
    expect(s({ name: ' ' }).ok).toBe(false);
    expect(s({ name: 'x'.repeat(81) }).ok).toBe(false);
    expect(s({ note: 'x'.repeat(201) }).ok).toBe(false);
  });
  it('reports every problem with one message code', () => {
    expect(s({ name: '' })).toEqual({ ok: false, error: 'bad_sponsor' });
  });
});
