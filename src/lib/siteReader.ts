// Reading a paid tool's own website to learn what it is, with no AI model: its name, what it
// says it does, what it costs, and the words and two-word phrases it uses for itself. Those
// words then drive a GitHub search for open-source projects doing the same job.
// Pure functions, tested on their own. Fetching lives in siteFetch.ts.

import { normalizeQuery, queryWords } from './match';

const DOMAIN = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/;
// Endings that are not public websites, and endings that are file types or project names
// ("next.js", "main.py") far more often than websites.
const NOT_PUBLIC = new Set(['local', 'localhost', 'internal', 'test', 'example', 'invalid', 'lan', 'home', 'corp', 'onion']);
const FILE_ENDINGS = new Set(['js', 'ts', 'py', 'md', 'rs', 'sh', 'css', 'html', 'json', 'yml', 'yaml', 'txt', 'pdf', 'png', 'jpg', 'zip', 'exe', 'rb', 'php', 'cpp', 'jsx', 'tsx']);
// Places where the address names a host, not one tool: a lookup there would describe the host.
const SHARED_HOSTS = new Set(['github.com', 'gitlab.com', 'google.com', 'apple.com', 'microsoft.com', 'youtube.com', 'x.com', 'twitter.com', 'facebook.com', 'linkedin.com', 'reddit.com', 'antipaywall.org']);

/** The site someone pasted, as a bare lowercase host ("annot.io"), or null when it is not a public website. */
export function parseDomain(input: string): string | null {
  let s = input.trim().toLowerCase();
  if (!s || s.length > 300 || /\s/.test(s)) return null;
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, '').replace(/^[^/@]*@/, '');
  s = s.split(/[/?#]/)[0].replace(/:\d+$/, '').replace(/^www\./, '').replace(/\.$/, '');
  if (s.length > 100 || !DOMAIN.test(s)) return null;
  const ending = s.slice(s.lastIndexOf('.') + 1);
  if (NOT_PUBLIC.has(ending) || FILE_ENDINGS.has(ending) || SHARED_HOSTS.has(s)) return null;
  return s;
}

/** The part of a host that names the tool: "annot" for annot.io, "foo" for app.foo.co.uk. */
export function domainLabel(domain: string): string {
  const parts = domain.split('.');
  const twoPart = parts.length >= 3 && parts[parts.length - 1].length === 2 && ['co', 'com', 'org', 'net', 'ac', 'gov'].includes(parts[parts.length - 2]);
  return parts[parts.length - (twoPart ? 3 : 2)] ?? parts[0];
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘', hellip: '…' };
const decode = (s: string) =>
  s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Math.min(Number(n), 0x10ffff)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(Math.min(parseInt(n, 16), 0x10ffff)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);
// Every pattern below is linear in the page's length. A page is someone else's input, and a
// pattern that rescans the rest of the page at each failed start (an unclosed "<title", a "<"
// with no ">") would let one crafted page hold the server for seconds.
const clean = (s: string, max: number) => decode(s.replace(/<[^<>]*>/g, ' ')).replace(/\s+/g, ' ').trim().slice(0, max);
/** True when the character after a tag name ends the name: "<meta " or "<meta>", not "<metadata". */
const ends = (c: string | undefined) => c === undefined || !/[a-z0-9-]/i.test(c);

function metaTags(html: string): Map<string, string> {
  const out = new Map<string, string>();
  // A tag runs to its own ">" and never past the next "<"; a tag longer than 4,000 characters is not real metadata.
  for (const tag of html.match(/<meta\b[^<>]{0,4000}>/gi) ?? []) {
    const attrs = new Map<string, string>();
    for (const m of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs.set(m[1].toLowerCase(), m[2] ?? m[3] ?? '');
    const key = (attrs.get('property') ?? attrs.get('name') ?? '').toLowerCase();
    const content = attrs.get('content');
    if (key && content && !out.has(key)) out.set(key, clean(content, 400));
  }
  return out;
}

/** The text inside each <tag>…</tag>, found by walking the page once. An unclosed tag ends the walk. */
function tagTexts(html: string, tag: string, max: number): string[] {
  const lower = html.toLowerCase();
  const out: string[] = [];
  let at = 0;
  while (out.length < max) {
    const open = lower.indexOf(`<${tag}`, at);
    if (open < 0) break;
    if (!ends(lower[open + tag.length + 1])) { at = open + 1; continue; }
    const gt = lower.indexOf('>', open);
    const close = gt < 0 ? -1 : lower.indexOf(`</${tag}`, gt);
    if (close < 0) break;
    const text = clean(html.slice(gt + 1, close), 200);
    if (text) out.push(text);
    at = close + tag.length + 2;
  }
  return out;
}

/** The page without one kind of block (<script>…</script> and so on), in one pass. An unclosed block runs to the end. */
function withoutBlocks(html: string, tag: string): string {
  const lower = html.toLowerCase();
  let out = '';
  let at = 0;
  for (;;) {
    const open = lower.indexOf(`<${tag}`, at);
    if (open < 0) return out + html.slice(at);
    if (!ends(lower[open + tag.length + 1])) { out += html.slice(at, open + 1); at = open + 1; continue; }
    out += html.slice(at, open) + ' ';
    const close = lower.indexOf(`</${tag}`, open);
    if (close < 0) return out;
    const gt = lower.indexOf('>', close);
    at = gt < 0 ? lower.length : gt + 1;
  }
}

/** The page as a reader sees it: no scripts, styles or markup. */
export function visibleText(html: string): string {
  const stripped = ['script', 'style', 'noscript', 'svg', 'template'].reduce(withoutBlocks, html.slice(0, 900_000));
  return clean(stripped, 200_000);
}

export type SitePrice = { cents: number; period: 'month' | 'year' };

/** The lowest paid price a page shows with a period next to it ("$9 / month"). Null when it shows none. */
export function readPrice(text: string): SitePrice | null {
  const found: SitePrice[] = [];
  for (const m of text.matchAll(/\$\s?(\d{1,3}(?:,\d{3})*|\d{1,5})(?:\.(\d{2}))?(?!\d)([^$]{0,28})/g)) {
    const dollars = Number(m[1].replace(/,/g, ''));
    const cents = dollars * 100 + Number(m[2] ?? 0);
    if (cents < 100 || cents > 1_000_000) continue;
    const after = m[3].toLowerCase();
    if (/\b(mo|month|monthly)\b/.test(after) || /^\s*\/\s*m\b/.test(after)) found.push({ cents, period: 'month' });
    else if (/\b(yr|year|yearly|annual|annually)\b/.test(after)) found.push({ cents, period: 'year' });
  }
  const pick = (period: 'month' | 'year') => found.filter((f) => f.period === period).sort((a, b) => a.cents - b.cents)[0];
  return pick('month') ?? pick('year') ?? null;
}

// Words every product page uses, which say nothing about what the product does.
const MARKETING = new Set(
  ('new way ways build building built builds better best easy easier simple simply fast faster quick quickly powerful modern smart team teams all one every everything ' +
    'our work works working make makes made more most just now today try start started pricing price plan plans customer customers people say says thing things ask ' +
    'platform solution solutions world first next level ultimate complete great amazing love loved trusted trust leading number us we they them their its it\'s were ' +
    'who why when where will would should could can\'t don\'t not no yes also only into over under up down out off than then there here about any each other ' +
    'help helps helping let lets use uses used using see learn read watch join sign login log account demo book contact home blog docs support company careers ' +
    'welcome introducing meet hello hi official site page top rated 10x award winning pages product products feature features benefits minutes seconds hours days time save saves ' +
    'send straight directly current missing was has had been being them these those across between through without within while per month monthly year yearly').split(' '),
);

export type SiteFacts = {
  name: string;
  tagline: string;
  description: string;
  price: SitePrice | null;
  /** The words the site uses for what it does, the most telling first. */
  words: string[];
  /** Two-word phrases it uses ("visual feedback"), the most prominent first. */
  phrases: string[];
};

const letters = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** What a homepage says about the tool behind it. Works on whatever is there; an empty page gives just the name. */
export function readSite(html: string, domain: string): SiteFacts {
  const page = html.slice(0, 900_000);
  const meta = metaTags(page);
  const label = domainLabel(domain);
  const title = (tagTexts(page, 'title', 1)[0] ?? meta.get('og:title') ?? '').slice(0, 200);
  const segments = title.split(/\s+[|–—·•-]\s+|\s*\|\s*|:\s+/).map((s) => s.trim()).filter(Boolean);
  const h1 = tagTexts(page, 'h1', 2);
  const h2 = tagTexts(page, 'h2', 8);

  // The name: what the site calls itself, else the part of the title that matches its address.
  const named = [meta.get('og:site_name'), meta.get('application-name')].find((v) => v && v.length <= 40 && v.split(' ').length <= 4);
  const titled = segments.find((s) => letters(s) === letters(label)) ?? segments.find((s) => letters(s).startsWith(letters(label)) && s.split(' ').length <= 3);
  // "Calendly.com" is the address, not the name; "Marker.io" is both, and stays.
  // Failing both, the address as the site itself spells it ("BugHerd"), else with a capital.
  const spelled = new RegExp(`(?:^|[^\\p{L}\\p{N}])(${label.replace(/[^a-z0-9]/g, '')})(?![\\p{L}\\p{N}])`, 'iu').exec(`${title} ${meta.get('description') ?? ''}`)?.[1];
  const name = (named ?? titled ?? spelled ?? capital(label)).replace(/\.(com|org|net)$/i, '').slice(0, 60);

  const rest = segments.filter((s) => s !== titled && letters(s) !== letters(name));
  const tagline = (rest.sort((a, b) => b.length - a.length)[0] ?? h1[0] ?? '').slice(0, 160);
  const description = (meta.get('description') ?? meta.get('og:description') ?? meta.get('twitter:description') ?? h2[0] ?? '').slice(0, 320);

  // Each place the site describes itself, weighted by how prominent it is. The same sentence
  // repeated (title and heading) counts once.
  const sources: [string, number][] = [];
  const seen = new Set<string>();
  const add = (text: string | undefined, weight: number) => {
    const key = letters(text ?? '');
    if (!text || !key || seen.has(key)) return;
    seen.add(key);
    sources.push([text, weight]);
  };
  // The title and the description are written to say what the product is; headings are often slogans.
  for (const s of rest) add(s, 3);
  add(description, 3);
  add(meta.get('og:description'), 2);
  for (const s of h1) add(s, 2);
  for (const s of h2) add(s, 1);

  const nameWords = new Set(queryWords(`${name} ${label}`));
  const telling = (w: string) => w.length > 2 && !MARKETING.has(w) && !nameWords.has(w) && !/^\d+$/.test(w);
  const wordScore = new Map<string, number>();
  const phraseScore = new Map<string, number>();
  const inTitle = new Set<string>();
  const titleTexts = new Set(rest);
  for (const [text, weight] of sources) {
    // Split on punctuation first, so a phrase never joins the end of one clause to the start of the next.
    for (const clause of text.toLowerCase().split(/[.,;:!?()|/–—"“”]+/)) {
      const tokens = normalizeQuery(clause).split(' ').filter(Boolean);
      const kept = new Set(queryWords(clause));
      const ok = tokens.map((t) => kept.has(t) && telling(t));
      tokens.forEach((t, i) => {
        if (!ok[i]) return;
        wordScore.set(t, (wordScore.get(t) ?? 0) + weight);
        if (!ok[i + 1] || tokens[i + 1] === t) return;
        const phrase = `${t} ${tokens[i + 1]}`;
        phraseScore.set(phrase, (phraseScore.get(phrase) ?? 0) + weight);
        if (titleTexts.has(text)) inTitle.add(phrase);
      });
    }
  }
  const top = (m: Map<string, number>, n: number) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k);

  // A phrase made of the site's most-used words says more than one that merely appears.
  for (const [p, score] of phraseScore) phraseScore.set(p, score * p.split(' ').reduce((sum, w) => sum + (wordScore.get(w) ?? 0), 0));

  // The phrase in the page's title leads: it is the one the site chose to be found by.
  const ranked = top(phraseScore, 12);
  const lead = ranked.find((p) => inTitle.has(p));
  const phrases = (lead ? [lead, ...ranked.filter((p) => p !== lead)] : ranked).slice(0, 4);

  return { name, tagline, description, price: readPrice(visibleText(page)), words: top(wordScore, 12), phrases };
}

const SCOPE = 'fork:false archived:false';

/**
 * The GitHub searches for a tool read from its website, at most five: projects that call themselves
 * its alternative, then its two most prominent phrases as text and as topics. Topics made from a
 * product's own phrase ("visual-feedback") are where look-alike projects gather.
 */
export function siteQueries(facts: Pick<SiteFacts, 'name' | 'words' | 'phrases'>, domain: string): string[] {
  const out: string[] = [];
  const label = domainLabel(domain);
  const name = facts.name.replace(/"/g, '');
  out.push(`"${name} alternative" in:name,description,readme ${SCOPE}`, `topic:${label}-alternative ${SCOPE}`);
  const phrases = facts.phrases.length ? facts.phrases.slice(0, 2) : facts.words.length >= 2 ? [facts.words.slice(0, 2).join(' ')] : [];
  for (const p of phrases) out.push(`"${p}" in:name,description,topics ${SCOPE}`);
  for (const p of phrases) {
    const topic = p.replace(/[^a-z0-9 ]/g, '').trim().replace(/\s+/g, '-');
    if (topic) out.push(`topic:${topic} ${SCOPE}`);
  }
  return [...new Set(out)].slice(0, 5);
}

export type SiteHit = { fullName: string; url: string; description: string; stars: number; license: string | null; topics?: string[] };

const stem = (w: string) => w.slice(0, Math.max(4, w.length - 2));

/**
 * The projects that really do the tool's job, from everything the searches returned. One shared
 * phrase is not enough ("visual feedback" also describes a password meter): a project must use
 * three of the tool's own words, or call itself its alternative. Closest and most used first.
 */
export function rankSiteHits<T extends SiteHit>(hits: T[], facts: Pick<SiteFacts, 'name' | 'words' | 'phrases'>, limit = 8): T[] {
  const stems = facts.words.map(stem);
  const need = Math.min(3, stems.length);
  const alt = `${facts.name.toLowerCase()} alternative`;
  const seen = new Set<string>();
  return hits
    .filter((h) => !seen.has(h.fullName.toLowerCase()) && seen.add(h.fullName.toLowerCase()))
    .filter((h) => !(h.topics ?? []).some((t) => t === 'awesome' || t === 'awesome-list') && !/^awesome[-_]/i.test(h.fullName.split('/')[1] ?? ''))
    .map((h) => {
      const text = `${h.fullName.replace(/[/_.-]/g, ' ')} ${h.description} ${(h.topics ?? []).join(' ').replace(/-/g, ' ')}`.toLowerCase();
      const tokens = text.split(/[^\p{L}\p{N}+#]+/u);
      const found = stems.filter((s) => tokens.some((t) => t.startsWith(s))).length;
      const phrases = facts.phrases.filter((p) => text.includes(p)).length;
      const says = text.includes(alt) || (h.topics ?? []).includes(`${facts.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-alternative`);
      // A long description full of the right words must not outrank a project many people use.
      return { h, found, says, rank: Math.min(found, 5) + phrases * 2 + (says ? 6 : 0) + Math.log10(h.stars + 1) * 2.5 };
    })
    .filter((x) => x.says || (need > 0 && x.found >= need))
    .sort((a, b) => b.rank - a.rank)
    .slice(0, limit)
    .map((x) => x.h);
}
