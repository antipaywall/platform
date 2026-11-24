import { describe, expect, it, vi } from 'vitest';
import { FROM, ORGANIZER } from '../src/lib/email';
import { checkMailing, mailingEmail, sendMailing, testAddress, testedSinceEdit, testEmail, textToHtml, type Mailing } from '../src/lib/mailings';
import { MAIL_STARTERS } from '../src/data/mailStarters';

const m: Mailing = {
  id: '0b6c1a52-6f7e-4b7a-9d0e-2a1f3c4d5e6f', subject: 'Hello builders', body: 'First line.\n\nSee https://www.antipaywall.org/wall.', audience: 'builders',
  createdAt: '2026-11-23T10:00:00Z', updatedAt: '2026-11-23T10:00:00Z', testedAt: null, sentAt: null,
};

describe('checkMailing', () => {
  it('needs a subject, a body and a known audience', () => {
    expect(checkMailing({ subject: 'Hi', body: 'Text', audience: 'builders' })).toBeNull();
    expect(checkMailing({ subject: 'Hi', body: 'Text', audience: 'list' })).toBeNull();
    expect(checkMailing({ subject: ' ', body: 'Text', audience: 'list' })).not.toBeNull();
    expect(checkMailing({ subject: 'Hi', body: '', audience: 'list' })).not.toBeNull();
    expect(checkMailing({ subject: 'Hi', body: 'Text', audience: 'everyone' })).not.toBeNull();
    expect(checkMailing({ subject: 'x'.repeat(151), body: 'Text', audience: 'list' })).not.toBeNull();
  });
});

describe('testedSinceEdit', () => {
  it('is true only when a test went out after the last change', () => {
    expect(testedSinceEdit({ testedAt: null, updatedAt: m.updatedAt })).toBe(false);
    expect(testedSinceEdit({ testedAt: '2026-11-23T09:59:59Z', updatedAt: m.updatedAt })).toBe(false);
    expect(testedSinceEdit({ testedAt: '2026-11-23T10:00:01Z', updatedAt: m.updatedAt })).toBe(true);
  });
});

describe('mailingEmail', () => {
  const mail = mailingEmail(m, 'ada@example.com', 'tok-1');
  it('carries the reader\'s own unsubscribe link, the reason, and the one-click header address', () => {
    expect(mail.to).toBe('ada@example.com');
    expect(mail.text).toContain('https://www.antipaywall.org/unsubscribe?t=tok-1');
    expect(mail.text).toContain('joined as a builder');
    expect(mail.html).toContain('https://www.antipaywall.org/unsubscribe?t=tok-1');
    expect(mail.oneClickUrl).toBe('https://www.antipaywall.org/api/list-unsubscribe?t=tok-1');
  });
  it('says "joined the email list" to the whole list', () => {
    expect(mailingEmail({ ...m, audience: 'list' }, 'a@b.co', 't').text).toContain('joined the email list');
  });
});

describe('textToHtml', () => {
  it('escapes everything and links only https addresses, leaving the closing full stop out', () => {
    const html = textToHtml('<b>hi</b> & see https://www.antipaywall.org/wall.\n\nhttp://plain.example and javascript:alert(1)');
    expect(html).toContain('&lt;b&gt;hi&lt;/b&gt; &amp;');
    expect(html).toContain('<a href="https://www.antipaywall.org/wall" style="color:#111">https://www.antipaywall.org/wall</a>.');
    expect(html).not.toContain('href="http://');
    expect(html).not.toContain('href="javascript');
    expect(html.match(/<p /g)?.length).toBe(2);
  });
});

describe('testAddress', () => {
  it('is the MAIL_TEST_TO setting when it is one address, and nothing otherwise', () => {
    expect(testAddress(' tester@example.com ')).toBe('tester@example.com');
    for (const v of [undefined, '', 'nope', 'a@b', 'a@b.co, c@d.co']) expect(testAddress(v), String(v)).toBeNull();
  });
});

describe('testEmail', () => {
  it('goes only to the test address, marked as a test, with no one-click header', () => {
    const t = testEmail(m, 'tester@example.com');
    expect(t.to).toBe('tester@example.com');
    expect(t.subject).toBe('[Test] Hello builders');
    expect(t.oneClickUrl).toBeUndefined();
  });
});

/** A database stand-in with only what sendMailing reads and writes. */
function fakeDb(opts: { subs: { id: string; email: string; token: string; person_id: string | null }[]; builders: string[]; sent?: string[] }) {
  const saved: any[] = [];
  const updates: any[] = [];
  const db = {
    from(table: string) {
      const q: any = {
        select: () => q, is: () => q, order: () => q, limit: () => q, eq: () => q,
        in: (_c: string, ids: string[]) => Promise.resolve({ data: ids.filter((i) => opts.builders.includes(i)).map((id) => ({ id })), error: null }),
        upsert: (rows: any[]) => { saved.push(...rows); return Promise.resolve({ error: null }); },
        update: (row: any) => { updates.push([table, row]); return q; },
        then: (res: any) => res(table === 'subscribers' ? { data: opts.subs, error: null } : table === 'mailing_sends' ? { data: (opts.sent ?? []).map((subscriber_id) => ({ subscriber_id })), error: null } : { data: null, error: null }),
      };
      return q;
    },
  };
  return { db: db as any, saved, updates };
}

describe('sendMailing', () => {
  const subs = [
    { id: 's1', email: 'one@example.com', token: 't1', person_id: 'p1' },
    { id: 's2', email: 'two@example.com', token: 't2', person_id: 'p2' },
    { id: 's3', email: 'three@example.com', token: 't3', person_id: null },
    { id: 's4', email: 'ONE@example.com', token: 't4', person_id: 'p4' },
  ];
  it('sends builders one copy each in one batch, skips anyone who already had it, and records each copy', async () => {
    const { db, saved, updates } = fakeDb({ subs, builders: ['p1', 'p2', 'p4'], sent: ['s2'] });
    const fetchImpl = vi.fn(async (_url: string, init: any) => new Response(JSON.stringify({ data: JSON.parse(init.body).map((_: unknown, i: number) => ({ id: `r${i}` })) }), { status: 200 }));
    const out = await sendMailing(db, m, { key: 'k', fetchImpl: fetchImpl as any });
    expect(out).toEqual({ sent: 1, remaining: 0, error: null });
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails/batch');
    expect(init.headers['idempotency-key']).toMatch(/^mailing-0b6c1a52-[\w-]+$/);
    const body = JSON.parse(init.body);
    // s2 already had it; s3 is not a builder; s4 is the same address as s1.
    expect(body.map((e: any) => e.to[0])).toEqual(['one@example.com']);
    expect(body[0].from).toBe(FROM);
    expect(body[0].reply_to).toBe(ORGANIZER);
    expect(body[0].headers['List-Unsubscribe']).toBe('<https://www.antipaywall.org/api/list-unsubscribe?t=t1>');
    expect(saved).toEqual([{ mailing_id: m.id, subscriber_id: 's1', resend_id: 'r0' }]);
    expect(updates.some(([t, r]) => t === 'mailings' && r.sent_at)).toBe(true);
  });
  it('sends the whole list when that is the audience', async () => {
    const { db } = fakeDb({ subs, builders: [] });
    const fetchImpl = vi.fn(async (_u: string, init: any) => new Response(JSON.stringify({ data: JSON.parse(init.body).map(() => ({ id: 'x' })) })));
    const out = await sendMailing(db, { ...m, audience: 'list' }, { key: 'k', fetchImpl: fetchImpl as any });
    expect(out.sent).toBe(3);
  });
  it('records nothing and says so when Resend refuses', async () => {
    const { db, saved, updates } = fakeDb({ subs, builders: ['p1'] });
    const out = await sendMailing(db, m, { key: 'k', fetchImpl: (async () => new Response('{}', { status: 422 })) as any });
    expect(out).toEqual({ sent: 0, remaining: 1, error: 'refused' });
    expect(saved).toEqual([]);
    expect(updates).toEqual([]);
  });
  it('sends nothing without a key', async () => {
    const { db } = fakeDb({ subs, builders: ['p1'] });
    const fetchImpl = vi.fn();
    expect(await sendMailing(db, m, { key: '', fetchImpl: fetchImpl as any })).toEqual({ sent: 0, remaining: 1, error: 'no_key' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('the platform starter', () => {
  it('goes to builders, names no dates, and points at pages that exist', () => {
    const d = MAIL_STARTERS.platform;
    expect(d.audience).toBe('builders');
    expect(d.body).not.toMatch(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/i);
    for (const [, path] of d.body.matchAll(/https:\/\/www\.antipaywall\.org(\/[\w/-]*)?/g)) {
      const p = path ?? '/';
      const file = p === '/' ? 'src/pages/index.astro' : `src/pages${p}`;
      const fs = require('node:fs');
      expect(fs.existsSync(`${file}.astro`) || fs.existsSync(`${file}/index.astro`) || fs.existsSync(file), p).toBe(true);
    }
  });
});
