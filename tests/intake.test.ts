import { describe, expect, it } from 'vitest';
import { trackablePath } from '../src/lib/analytics';
import { csvCell, parseEmail, parseOrganize, parsePanel, parseSponsorInquiry, parseSubscribe, toCsv } from '../src/lib/intake';

describe('parseEmail', () => {
  it('lowercases and trims a plain address', () => {
    expect(parseEmail('  Ada@Example.COM ')).toBe('ada@example.com');
  });
  it.each(['', 'ada', 'ada@', '@example.com', 'ada@example', 'a b@example.com', 'ada@@example.com', `${'x'.repeat(250)}@e.co`, null, 12])('refuses %s', (v) => {
    expect(parseEmail(v)).toBeNull();
  });
});

describe('parseSubscribe', () => {
  it('accepts an address', () => {
    expect(parseSubscribe({ email: 'Ada@Example.com' })).toEqual({ ok: true, spam: false, email: 'ada@example.com' });
  });
  it('reports a bad address by code', () => {
    expect(parseSubscribe({ email: 'nope' })).toEqual({ ok: false, error: 'bad_email' });
  });
  it('treats a filled-in trap field as a script, whatever else was sent', () => {
    expect(parseSubscribe({ email: 'ada@example.com', trap: 'http://spam.example' })).toEqual({ ok: true, spam: true });
    expect(parseSubscribe({ email: 'nope', trap: 'x' })).toEqual({ ok: true, spam: true });
  });
  it('ignores a trap field that is only spaces', () => {
    expect(parseSubscribe({ email: 'ada@example.com', trap: '   ' })).toMatchObject({ spam: false });
  });
});

describe('parsePanel', () => {
  it('needs a reason, and allows no ties', () => {
    expect(parsePanel({ why: '  ', ties: '' })).toEqual({ ok: false, error: 'need_why' });
    expect(parsePanel({ why: ' I review code for a living. ' })).toEqual({ ok: true, why: 'I review code for a living.', ties: '' });
  });
  it('caps both answers at 500 characters', () => {
    expect(parsePanel({ why: 'x'.repeat(500), ties: 'y'.repeat(500) }).ok).toBe(true);
    expect(parsePanel({ why: 'x'.repeat(501) })).toEqual({ ok: false, error: 'bad_note' });
    expect(parsePanel({ why: 'ok', ties: 'y'.repeat(501) })).toEqual({ ok: false, error: 'bad_note' });
  });
  it('keeps markup as plain text', () => {
    expect(parsePanel({ why: '<script>alert(1)</script>' })).toMatchObject({ why: '<script>alert(1)</script>' });
  });
});

describe('parseOrganize', () => {
  it('needs a note of 1 to 500 characters', () => {
    expect(parseOrganize({ note: '' })).toEqual({ ok: false, error: 'need_note' });
    expect(parseOrganize({ note: 'x'.repeat(501) })).toEqual({ ok: false, error: 'bad_note' });
    expect(parseOrganize({ note: ' Outreach,\r\nten hours a week. ' })).toEqual({ ok: true, note: 'Outreach,\nten hours a week.' });
  });
});

describe('parseSponsorInquiry', () => {
  const base = { company: 'Acme', contact: 'Ada Lovelace', email: 'Ada@Acme.com' };
  it('accepts the minimum and defaults to "unsure" with no amount', () => {
    expect(parseSponsorInquiry(base)).toEqual({
      ok: true, spam: false, company: 'Acme', contact: 'Ada Lovelace', email: 'ada@acme.com', amountUsd: null, kind: 'unsure', message: '',
    });
  });
  it('reads a whole-dollar amount with a $ or commas', () => {
    expect(parseSponsorInquiry({ ...base, amount: '$2,500', kind: 'bounty' })).toMatchObject({ amountUsd: 2500, kind: 'bounty' });
  });
  it.each(['0', '-5', '12.50', 'lots', '1e6', '99999999'])('refuses the amount %s', (amount) => {
    expect(parseSponsorInquiry({ ...base, amount })).toEqual({ ok: false, error: 'bad_inquiry' });
  });
  it('falls back to "unsure" for a kind it does not know', () => {
    expect(parseSponsorInquiry({ ...base, kind: 'admin' })).toMatchObject({ kind: 'unsure' });
  });
  it('needs a company, a name and a real address', () => {
    expect(parseSponsorInquiry({ ...base, company: ' ' })).toEqual({ ok: false, error: 'bad_inquiry' });
    expect(parseSponsorInquiry({ ...base, contact: 'x'.repeat(121) })).toEqual({ ok: false, error: 'bad_inquiry' });
    expect(parseSponsorInquiry({ ...base, email: 'nope' })).toEqual({ ok: false, error: 'bad_email' });
  });
  it('caps the message at 1,000 characters', () => {
    expect(parseSponsorInquiry({ ...base, message: 'x'.repeat(1000) }).ok).toBe(true);
    expect(parseSponsorInquiry({ ...base, message: 'x'.repeat(1001) })).toEqual({ ok: false, error: 'bad_inquiry' });
  });
  it('folds line breaks out of one-line fields', () => {
    expect(parseSponsorInquiry({ ...base, company: 'Acme\nInc' })).toMatchObject({ company: 'Acme Inc' });
  });
  it('treats a filled-in trap field as a script', () => {
    expect(parseSponsorInquiry({ ...base, trap: 'x' })).toEqual({ ok: true, spam: true });
  });
});

describe('csvCell', () => {
  it('quotes every cell and doubles quotes inside it', () => {
    expect(csvCell('plain')).toBe('"plain"');
    expect(csvCell('say "hi", ok')).toBe('"say ""hi"", ok"');
    expect(csvCell(null)).toBe('""');
    expect(csvCell(42)).toBe('"42"');
  });
  it.each(['=HYPERLINK("http://evil.example")', '+1+1', '-2+3', '@SUM(A1)', '\tcmd', '\rcmd'])('stops %j running as a formula', (v) => {
    expect(csvCell(v).startsWith(`"'`)).toBe(true);
  });
  it('leaves an ordinary address alone', () => {
    expect(csvCell('ada@example.com')).toBe('"ada@example.com"');
  });
});

describe('toCsv', () => {
  it('writes a header and rows, one per line', () => {
    expect(toCsv(['email', 'status'], [['a@b.co', 'subscribed'], ['=x@b.co', 'unsubscribed']])).toBe(
      `"email","status"\r\n"a@b.co","subscribed"\r\n"'=x@b.co","unsubscribed"\r\n`,
    );
  });
});

describe('the join pages are counted, and only them', () => {
  it.each(['/join', '/join/build', '/join/panel', '/join/organize'])('counts %s', (p) => {
    expect(trackablePath(p)).toBe(p);
  });
  it.each(['/help', '/join/other', '/unsubscribe', '/admin', '/api/subscribe'])('does not count %s', (p) => {
    expect(trackablePath(p)).toBeNull();
  });
});

