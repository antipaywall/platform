import { describe, expect, it } from 'vitest';
import { countryCode, funnelSteps, isNavigation, isProduction, looksLikeBot, pageViewFor, referrerHost, trackablePath, utmSource, visitorHash } from '../src/lib/analytics';

const CHROME = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

describe('looksLikeBot', () => {
  it.each([
    null, '', 'curl/8.4.0', 'Googlebot/2.1 (+http://www.google.com/bot.html)',
    'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
    'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/120.0.0.0 Safari/537.36',
    'python-requests/2.31.0', 'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)', 'Twitterbot/1.0',
    'Wget/1.21.4 (linux-gnu) and some padding', 'node-fetch/1.0 (+https://github.com/bitinn/node-fetch)', 'Go-http-client/2.0 with padding here',
    'Java/17.0.2 with some padding text', 'Mozilla/5.0 (compatible; UptimeRobot/2.0; http://www.uptimerobot.com/)',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Playwright/1.40',
    'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ChatGPT-User/1.0; +https://openai.com/bot)',
    'LinkedInBot/1.0 (compatible; Mozilla/5.0; Apache-HttpClient +http://www.linkedin.com)', 'Discordbot/2.0; +https://discordapp.com',
    'TelegramBot (like TwitterBot) padding text', 'WhatsApp/2.23.20.0 A with padding text', 'Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)',
    'Mozilla/5.0 (compatible; Pingdom.com_bot_version_1.4_(http://www.pingdom.com/))', 'Mozilla/5.0 zgrab/0.x with padding text here',
    'vercel-screenshot/1.0 with padding text', 'axios/1.6.2 with some padding text', 'okhttp/4.12.0 with some padding text',
  ])('treats %s as a bot', (ua) => {
    expect(looksLikeBot(ua)).toBe(true);
  });
  it('treats ordinary browsers as people', () => {
    expect(looksLikeBot(CHROME)).toBe(false);
    expect(looksLikeBot('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1')).toBe(false);
  });
  it('treats people reading inside a social app as people', () => {
    for (const ua of [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Twitter for iPhone/10.50',
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0.0.0 Mobile Safari/537.36 [LinkedInApp]/4.1.940',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/470.0]',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
      'Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0',
    ]) expect(looksLikeBot(ua)).toBe(false);
  });
});

describe('trackablePath', () => {
  it('keeps the public pages and drops a trailing slash', () => {
    expect(trackablePath('/')).toBe('/');
    expect(trackablePath('/join/')).toBe('/join');
    expect(trackablePath('/ideas/brand-kit')).toBe('/ideas/brand-kit');
    expect(trackablePath('/privacy')).toBe('/privacy');
  });
  it.each(['/api/pledge', '/auth/callback', '/admin', '/favicon.svg', '/wp-login.php', '/ideas/a/b', '/Join', '/ideas/Has_Caps', '/.env', '/join?x=1'])(
    'does not count %s',
    (p) => {
      expect(trackablePath(p)).toBeNull();
    },
  );
});

describe('referrerHost', () => {
  it('keeps only the host, without www', () => {
    expect(referrerHost('https://www.reddit.com/r/SideProject/comments/abc?x=1', 'www.antipaywall.org')).toBe('reddit.com');
    expect(referrerHost('https://news.ycombinator.com/item?id=1', 'www.antipaywall.org')).toBe('news.ycombinator.com');
  });
  it('ignores our own pages, missing and broken referrers, and non-web schemes', () => {
    expect(referrerHost('https://antipaywall.org/ideas', 'www.antipaywall.org')).toBeNull();
    expect(referrerHost('https://www.antipaywall.org/', 'antipaywall.org')).toBeNull();
    expect(referrerHost(null, 'www.antipaywall.org')).toBeNull();
    expect(referrerHost('not a url', 'www.antipaywall.org')).toBeNull();
    expect(referrerHost('android-app://com.example', 'www.antipaywall.org')).toBeNull();
  });
});

describe('utmSource and countryCode', () => {
  it('accepts simple tags and refuses anything else', () => {
    expect(utmSource('HackerNews')).toBe('hackernews');
    expect(utmSource('x.com')).toBe('x.com');
    expect(utmSource('<script>')).toBeNull();
    expect(utmSource('a'.repeat(41))).toBeNull();
    expect(utmSource(null)).toBeNull();
  });
  it('accepts two letters only', () => {
    expect(countryCode('us')).toBe('US');
    expect(countryCode('USA')).toBeNull();
    expect(countryCode('XX')).toBeNull();
    expect(countryCode(undefined)).toBeNull();
  });
});

describe('visitorHash', () => {
  const key = 'k'.repeat(40);
  const ip = '203.0.113.77';
  it('is the same for the same visitor on the same day', () => {
    expect(visitorHash(key, '2026-11-12', ip, CHROME)).toBe(visitorHash(key, '2026-11-12', ip, CHROME));
  });
  it('changes with the day, the address, the browser and the key', () => {
    const a = visitorHash(key, '2026-11-12', ip, CHROME);
    expect(visitorHash(key, '2026-11-13', ip, CHROME)).not.toBe(a);
    expect(visitorHash(key, '2026-11-12', '203.0.113.78', CHROME)).not.toBe(a);
    expect(visitorHash(key, '2026-11-12', ip, CHROME + ' x')).not.toBe(a);
    expect(visitorHash('other-key', '2026-11-12', ip, CHROME)).not.toBe(a);
  });
  it('is 16 hex characters and contains no part of the address', () => {
    const h = visitorHash(key, '2026-11-12', ip, CHROME);
    expect(h).toMatch(/^[0-9a-f]{16}$/);
    for (const part of [ip, '203', '113', '77', '203.0']) {
      if (part.length > 2) expect(h.includes(part)).toBe(false);
    }
    expect(h).not.toContain('.');
  });
});

// What a browser sends when a person opens a page.
const BROWSER = { accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', 'accept-language': 'en-US,en;q=0.9', 'sec-fetch-dest': 'document', 'sec-fetch-mode': 'navigate' };

describe('isProduction', () => {
  it('is true only for the live deployment', () => {
    expect(isProduction('production')).toBe(true);
    for (const v of [undefined, '', 'preview', 'development', 'Production']) expect(isProduction(v)).toBe(false);
  });
});

describe('isNavigation', () => {
  const nav = (h: Record<string, string>) => isNavigation(new Headers(h));
  it('accepts a browser opening a page, with or without the newer fetch headers', () => {
    expect(nav(BROWSER)).toBe(true);
    expect(nav({ accept: BROWSER.accept, 'accept-language': 'de' })).toBe(true);
  });
  it('needs a request for HTML', () => {
    expect(nav({ ...BROWSER, accept: '*/*' })).toBe(false);
    expect(nav({ ...BROWSER, accept: 'application/json' })).toBe(false);
    expect(nav({ 'accept-language': 'en' })).toBe(false);
  });
  it('needs a language preference, which scripts rarely send', () => {
    expect(nav({ accept: BROWSER.accept })).toBe(false);
    expect(nav({ accept: BROWSER.accept, 'accept-language': '  ' })).toBe(false);
  });
  it('refuses anything the browser says is not a page being navigated to', () => {
    expect(nav({ ...BROWSER, 'sec-fetch-dest': 'empty' })).toBe(false);
    expect(nav({ ...BROWSER, 'sec-fetch-dest': 'iframe' })).toBe(false);
    expect(nav({ ...BROWSER, 'sec-fetch-mode': 'cors' })).toBe(false);
    expect(nav({ ...BROWSER, 'sec-fetch-mode': 'no-cors' })).toBe(false);
  });
});

describe('pageViewFor', () => {
  const make = (over: Partial<Parameters<typeof pageViewFor>[0]> = {}, headers: Record<string, string> = {}) =>
    pageViewFor({
      method: 'GET',
      url: new URL('https://www.antipaywall.org/ideas?utm_source=hn&email=someone@example.com'),
      headers: new Headers({ 'user-agent': CHROME, 'x-vercel-ip-country': 'DE', referer: 'https://news.ycombinator.com/item?id=9', ...BROWSER, ...headers }),
      ip: '203.0.113.77',
      key: 'k'.repeat(40),
      now: new Date('2026-11-12T23:59:59Z'),
      production: true,
      organizer: false,
      ...over,
    });
  it('records the day, path, country, referrer host, tag and a hash, and nothing else', () => {
    const v = make()!;
    expect(v).toEqual({ day: '2026-11-12', path: '/ideas', country: 'DE', referrer_host: 'news.ycombinator.com', utm_source: 'hn', visitor: v.visitor });
    expect(JSON.stringify(v)).not.toContain('203.0.113.77');
    expect(JSON.stringify(v)).not.toContain('someone@example.com');
    expect(JSON.stringify(v)).not.toContain('Chrome');
  });
  it('records nothing for posts, bots, prefetches, untracked paths, or when there is no key', () => {
    expect(make({ method: 'POST' })).toBeNull();
    expect(make({}, { 'user-agent': 'Googlebot/2.1 (+http://www.google.com/bot.html)' })).toBeNull();
    expect(make({}, { 'sec-purpose': 'prefetch;prerender' })).toBeNull();
    expect(make({ url: new URL('https://www.antipaywall.org/admin') })).toBeNull();
    expect(make({ key: '' })).toBeNull();
    expect(make({}, { purpose: 'prefetch' })).toBeNull();
  });
  it('records nothing away from the live site', () => {
    expect(make({ production: false })).toBeNull();
  });
  it('records nothing without a country from the hosting provider', () => {
    const h = new Headers({ 'user-agent': CHROME, ...BROWSER });
    expect(make({ headers: h })).toBeNull();
    expect(make({}, { 'x-vercel-ip-country': 'XX' })).toBeNull();
  });
  it('records nothing for a signed-in organizer', () => {
    expect(make({ organizer: true })).toBeNull();
  });
  it('records nothing for a request that is not a page navigation', () => {
    expect(make({}, { accept: '*/*' })).toBeNull();
    expect(make({}, { 'sec-fetch-dest': 'empty', 'sec-fetch-mode': 'cors' })).toBeNull();
    const noLanguage = new Headers({ 'user-agent': CHROME, 'x-vercel-ip-country': 'DE', accept: BROWSER.accept });
    expect(make({ headers: noLanguage })).toBeNull();
  });
});

describe('funnelSteps', () => {
  it('gives each step its share of the step it follows from, to one decimal', () => {
    const steps = funnelSteps({ visitors: 2000, signed_in: 300, passed: 240, joined: 180, posted: 45, pledged: 30 });
    expect(steps.map((s) => [s.label, s.count, s.of, s.percent])).toEqual([
      ['Visitors', 2000, null, null],
      ['Signed in', 300, 'visitors', 15],
      ['Passed the builder checks', 240, 'signed in', 80],
      ['Joined as a builder', 180, 'passed the checks', 75],
      ['Posted an idea', 45, 'signed in', 15],
      ['Pledged', 30, 'signed in', 10],
    ]);
    expect(funnelSteps({ visitors: 3, signed_in: 1, passed: 0, joined: 0, posted: 0, pledged: 0 })[1].percent).toBe(33.3);
  });
  it('shows no percentage when the step before is empty', () => {
    const steps = funnelSteps({ visitors: 0, signed_in: 0, passed: 0, joined: 0, posted: 0, pledged: 0 });
    expect(steps.every((s) => s.percent === null)).toBe(true);
  });
});
