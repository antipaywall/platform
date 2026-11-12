import { createHmac } from 'node:crypto';

// First-party page-view counting with no cookies and no personal data.
// What is kept per view: the day, the page path, a two-letter country, the site
// that linked here (host only), a campaign tag if the link carried one, and a
// daily visitor hash. The IP address and the browser name are used to compute
// that hash and are then discarded.
//
// A view is recorded only when all of these hold:
//   - the request reached the live site (not a local or preview copy) and the
//     hosting provider reported a country for it;
//   - it is not from a signed-in organizer;
//   - it is a browser opening a public page: a GET that asks for HTML, says which
//     languages the reader prefers, and, where the browser says what the request
//     is for, says it is a page being navigated to;
//   - it is not a crawler, script, link previewer or uptime check;
//   - it is not a page being fetched ahead of time.

/** Pages worth counting. Anything else (scans, typos, private or internal routes) is not recorded at all. */
const PAGE = /^\/(?:|join(?:\/(?:build|panel|organize))?|fund|pool|sponsor|builders|rules|faq|privacy|terms|about|ideas(?:\/[a-z0-9-]{1,70})?)$/;

/** The path as it is stored, or null if this request should not be counted. Never includes a query string. */
export function trackablePath(pathname: string): string | null {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  return PAGE.test(path) ? path : null;
}

const BOT = new RegExp(
  [
    // Words crawlers and tools use to describe themselves.
    'bot', 'crawl', 'spider', 'slurp', 'scrape', 'scan', 'fetch', 'preview', 'monitor', 'uptime', 'probe', 'checker', 'feed', 'validator', 'archiv',
    // Browsers driven by a program.
    'headless', 'phantomjs', 'puppeteer', 'playwright', 'selenium', 'webdriver', 'cypress', 'lighthouse', 'pagespeed', 'gtmetrix', 'chrome-lighthouse',
    // Command-line tools and HTTP libraries.
    'curl', 'wget', 'httpie', 'libwww', 'python', 'aiohttp', 'httpx', 'urllib', 'scrapy', 'node', 'undici', 'axios', 'got \\(', 'deno', 'bun\\/',
    'go-http', 'java', 'okhttp', 'apache-http', 'httpclient', 'ruby', 'faraday', 'perl', 'php', 'guzzle', 'dart', 'rust', 'reqwest', 'postman', 'insomnia',
    // Link previewers. Apps people browse in (X, LinkedIn, Telegram and so on) are deliberately
    // not listed by name: their preview fetchers call themselves bots, and their readers are people.
    'facebookexternalhit', 'facebookcatalog', 'meta-external', 'whatsapp', 'slack-imgproxy', 'embedly', 'iframely', 'quora link', 'vkshare', 'bitly',
    // Uptime monitors.
    'pingdom', 'statuscake', 'site24x7', 'betterstack', 'better uptime', 'datadog', 'newrelic', 'nagios', 'zabbix', 'checkly', 'hetrix', 'kuma', 'vercel',
    // Named crawlers that do not call themselves bots.
    'google-inspectiontool', 'googleother', 'google-extended', 'mediapartners', 'bingpreview', 'yandex', 'ahrefs', 'semrush', 'mj12', 'chatgpt-user', 'oai-search', 'claude-user', 'claude-web', 'anthropic', 'perplexity-user', 'ia_archiver', 'censys', 'shodan', 'zgrab', 'masscan', 'nmap', 'nuclei', 'expanse', 'internetmeasurement',
  ].join('|'),
  'i',
);

/** True for crawlers, link previewers, scripts and anything that sends no browser name. */
export function looksLikeBot(userAgent: string | null | undefined): boolean {
  return !userAgent || userAgent.length < 20 || BOT.test(userAgent);
}

/** The host of the site that linked here, without "www.". Null for no referrer, a broken one, or our own site. */
export function referrerHost(referer: string | null | undefined, ownHost: string): string | null {
  if (!referer) return null;
  let host: string;
  try {
    const u = new URL(referer);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    host = u.hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
  if (!host || host.length > 100 || host === ownHost.toLowerCase().replace(/^www\./, '')) return null;
  return host;
}

/** A campaign tag from the link (`utm_source`), limited to simple characters. Null if absent or odd. */
export function utmSource(v: string | null | undefined): string | null {
  const s = (v ?? '').trim().toLowerCase();
  return /^[a-z0-9][a-z0-9_.-]{0,39}$/.test(s) ? s : null;
}

/** A two-letter country code from the hosting provider, or null. */
export function countryCode(v: string | null | undefined): string | null {
  const s = (v ?? '').trim().toUpperCase();
  return /^[A-Z]{2}$/.test(s) && s !== 'XX' ? s : null;
}

/**
 * Identifies a visitor for one day only. The day is part of the input, so the
 * same person gets an unrelated value tomorrow; the result is a keyed hash cut
 * to 16 characters, so the IP address cannot be read back out of it.
 */
export function visitorHash(key: string, day: string, ip: string, userAgent: string): string {
  return createHmac('sha256', key).update(`${day}\n${ip}\n${userAgent}`).digest('hex').slice(0, 16);
}

/**
 * True when the headers describe a person's browser opening a page, as opposed to a script,
 * an image or data request, or a page fetched in the background.
 */
export function isNavigation(headers: Headers): boolean {
  if (!(headers.get('accept') ?? '').toLowerCase().includes('text/html')) return false;
  if (!(headers.get('accept-language') ?? '').trim()) return false;
  const dest = headers.get('sec-fetch-dest');
  if (dest !== null && dest !== 'document') return false;
  const mode = headers.get('sec-fetch-mode');
  if (mode !== null && mode !== 'navigate') return false;
  return true;
}

/** True only on Vercel's production deployment. Local runs and preview deployments are never counted. */
export const isProduction = (vercelEnv: string | undefined) => vercelEnv === 'production';

export type PageView = {
  day: string;
  path: string;
  country: string | null;
  referrer_host: string | null;
  utm_source: string | null;
  visitor: string;
};

/** Builds the row for this request, or null if it should not be counted. Pure: the caller supplies the key, the IP and the clock. */
export function pageViewFor(input: {
  method: string; url: URL; headers: Headers; ip: string; key: string; now: Date;
  /** True only on the live site: Vercel's production environment. */
  production: boolean;
  /** True when the request comes from a signed-in organizer. */
  organizer: boolean;
}): PageView | null {
  if (!input.production || input.organizer) return null;
  if (input.method !== 'GET' || !input.key) return null;
  const h = input.headers;
  // The hosting provider adds a country to every request that arrives through it.
  const country = countryCode(h.get('x-vercel-ip-country'));
  if (!country) return null;
  if (!isNavigation(h)) return null;
  const path = trackablePath(input.url.pathname);
  if (!path) return null;
  const ua = input.headers.get('user-agent');
  if (looksLikeBot(ua)) return null;
  // Browsers fetching a page ahead of time are not a visit.
  if (/prefetch|prerender/i.test(input.headers.get('sec-purpose') ?? input.headers.get('purpose') ?? '')) return null;
  const day = input.now.toISOString().slice(0, 10);
  return {
    day,
    path,
    country,
    referrer_host: referrerHost(input.headers.get('referer'), input.url.hostname),
    utm_source: utmSource(input.url.searchParams.get('utm_source')),
    visitor: visitorHash(input.key, day, input.ip, ua!),
  };
}

export type FunnelCounts = { visitors: number; signed_in: number; passed: number; joined: number; posted: number; pledged: number; on_list?: number };
export type FunnelStep = { label: string; count: number; of: string | null; percent: number | null };

/**
 * The funnel, each step with its share of the step it follows from. The first
 * four steps follow one another. Posting an idea and pledging only need a
 * sign-in, so both are measured against "signed in". Joining the email list
 * needs no account, so it is measured against visitors; it is left out when
 * the list count is not known.
 */
export function funnelSteps(c: FunnelCounts): FunnelStep[] {
  const pct = (n: number, base: number) => (base > 0 ? Math.round((n / base) * 1000) / 10 : null);
  return [
    { label: 'Visitors', count: c.visitors, of: null, percent: null },
    ...(c.on_list === undefined ? [] : [{ label: 'Joined the email list', count: c.on_list, of: 'visitors', percent: pct(c.on_list, c.visitors) }]),
    { label: 'Signed in', count: c.signed_in, of: 'visitors', percent: pct(c.signed_in, c.visitors) },
    { label: 'Passed the builder checks', count: c.passed, of: 'signed in', percent: pct(c.passed, c.signed_in) },
    { label: 'Joined as a builder', count: c.joined, of: 'passed the checks', percent: pct(c.joined, c.passed) },
    { label: 'Posted an idea', count: c.posted, of: 'signed in', percent: pct(c.posted, c.signed_in) },
    { label: 'Pledged', count: c.pledged, of: 'signed in', percent: pct(c.pledged, c.signed_in) },
  ];
}
