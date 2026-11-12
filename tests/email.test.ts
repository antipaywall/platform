import { describe, expect, it, vi } from 'vitest';
import { deliver, FROM, oneClickUrl, ORGANIZER, organizerNotice, resendBody, sendEmail, unsubscribeUrl, welcomeEmail } from '../src/lib/email';

const TOKEN = '3f1c2b9a-0d4e-4c1a-9b7e-2a6d5e4f3c21';

describe('welcomeEmail', () => {
  const mail = welcomeEmail('ada@example.com', TOKEN);
  it('carries the unsubscribe page link in the text and the HTML, and the one-click address for the header', () => {
    const url = unsubscribeUrl(TOKEN);
    expect(url).toBe(`https://www.antipaywall.org/unsubscribe?t=${TOKEN}`);
    expect(mail.text).toContain(url);
    expect(mail.html).toContain(url);
    expect(mail.oneClickUrl).toBe(`https://www.antipaywall.org/api/list-unsubscribe?t=${TOKEN}`);
    expect(oneClickUrl(TOKEN)).toBe(mail.oneClickUrl);
  });
  it('says there are no dates, and promises nothing else', () => {
    expect(mail.text).toContain('dates have not been announced');
    expect(mail.text).not.toMatch(/\d{4}|november|december/i);
  });
});

describe('organizerNotice', () => {
  it('goes to the organizer and shows what was sent as plain text', () => {
    const mail = organizerNotice('A sponsor inquiry', [['Company', '<b>Acme</b> & co'], ['Message', '']]);
    expect(mail.to).toBe(ORGANIZER);
    expect(mail.subject).toBe('Antipaywall: A sponsor inquiry');
    expect(mail.text).toContain('Company: <b>Acme</b> & co');
    expect(mail.text).toContain('Message: (blank)');
    expect(mail.html).toContain('&lt;b&gt;Acme&lt;/b&gt; &amp; co');
    expect(mail.html).not.toContain('<b>');
    expect(mail.oneClickUrl).toBeUndefined();
  });
});

describe('resendBody', () => {
  it('sends from and replies to our own address, with one-click unsubscribe headers when there is a link', () => {
    const body = resendBody(welcomeEmail('ada@example.com', TOKEN));
    expect(body.from).toBe(FROM);
    expect(body.reply_to).toBe(ORGANIZER);
    expect(body.to).toEqual(['ada@example.com']);
    expect(body.headers).toEqual({
      'List-Unsubscribe': `<https://www.antipaywall.org/api/list-unsubscribe?t=${TOKEN}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    });
  });
  it('adds no unsubscribe header to a notice for the organizer', () => {
    expect('headers' in resendBody(organizerNotice('x', []))).toBe(false);
  });
});

describe('sendEmail', () => {
  const mail = welcomeEmail('ada@example.com', TOKEN);

  it('sends nothing and says so when there is no key', async () => {
    const fetchImpl = vi.fn();
    expect(await sendEmail(mail, { key: '', fetchImpl: fetchImpl as unknown as typeof fetch })).toEqual({ sent: false, reason: 'no_key' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('posts one JSON request to Resend with the key as a bearer token', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ id: 'abc' }), { status: 200 }));
    const result = await sendEmail(mail, { key: 're_test', fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(result).toEqual({ sent: true, id: 'abc' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer re_test');
    expect(JSON.parse(String(init.body))).toMatchObject({ to: ['ada@example.com'], subject: mail.subject });
  });

  it('reports a refusal without throwing', async () => {
    const fetchImpl = (async () => new Response('{"message":"bad"}', { status: 422 })) as unknown as typeof fetch;
    expect(await sendEmail(mail, { key: 're_test', fetchImpl })).toEqual({ sent: false, reason: 'refused' });
  });

  it('reports a network failure without throwing', async () => {
    const fetchImpl = (async () => { throw new Error('offline'); }) as unknown as typeof fetch;
    expect(await sendEmail(mail, { key: 're_test', fetchImpl })).toEqual({ sent: false, reason: 'unreachable' });
  });
});

describe('deliver: the hourly cap on outgoing email', () => {
  const mail = welcomeEmail('ada@example.com', TOKEN);
  const dbThatAnswers = (data: unknown, error: unknown = null) => {
    const rpc = vi.fn(async () => ({ data, error }));
    return { db: { rpc } as any, rpc };
  };
  const ok = (async () => new Response(JSON.stringify({ id: 'abc' }), { status: 200 })) as unknown as typeof fetch;

  it('takes one slot from the site-wide allowance and then sends', async () => {
    const { db, rpc } = dbThatAnswers(true);
    expect(await deliver(db, mail, { key: 're_test', fetchImpl: ok })).toEqual({ sent: true, id: 'abc' });
    expect(rpc).toHaveBeenCalledWith('take_slot', { p_kind: 'email', p_key: 'all', p_max: 60 });
  });
  it('sends nothing once the allowance is used up', async () => {
    const fetchImpl = vi.fn();
    const { db } = dbThatAnswers(false);
    expect(await deliver(db, mail, { key: 're_test', fetchImpl: fetchImpl as unknown as typeof fetch })).toEqual({ sent: false, reason: 'capped' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it('sends nothing when the allowance cannot be checked', async () => {
    const fetchImpl = vi.fn();
    const { db } = dbThatAnswers(null, { message: 'down' });
    expect(await deliver(db, mail, { key: 're_test', fetchImpl: fetchImpl as unknown as typeof fetch })).toEqual({ sent: false, reason: 'capped' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it('uses no slot when there is no key to send with', async () => {
    const { db, rpc } = dbThatAnswers(true);
    expect(await deliver(db, mail, { key: '' })).toEqual({ sent: false, reason: 'no_key' });
    expect(rpc).not.toHaveBeenCalled();
  });
});
