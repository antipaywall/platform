import { describe, expect, it } from 'vitest';
import { catalogMatch, isStale } from '../src/lib/askedTools';
import { isPrivateAddress } from '../src/lib/siteFetch';
import { domainLabel, parseDomain, rankSiteHits, readPrice, readSite, siteQueries } from '../src/lib/siteReader';

const page = (head: string, body = '') => `<!doctype html><html><head>${head}</head><body>${body}</body></html>`;
const annot = page(
  `<title>Visual feedback for the new way of building | Annot</title>
   <meta name="description" content="Pin comments on any website, web app, prototype or landing page and send them straight to your coding agent.">
   <meta property="og:title" content="Visual feedback for the new way of building | Annot">`,
  `<h1>Visual feedback for the new way of building</h1><script>var price = "$999 / month"</script>
   <h2>Everything your current review process was missing.</h2>
   <p>Free $0 / Monthly</p><p>Freelance $9 / Monthly</p><p>Agency $59 / Monthly</p>`,
);

describe('a pasted website', () => {
  it('becomes a bare host', () => {
    expect(parseDomain('annot.io')).toBe('annot.io');
    expect(parseDomain(' https://www.Annot.io/pricing?x=1 ')).toBe('annot.io');
    expect(parseDomain('http://app.example.co.uk:8080/a')).toBe('app.example.co.uk');
  });
  it('is refused when it is not a public website', () => {
    for (const bad of ['', 'annot', 'visual feedback tool', 'localhost', 'http://localhost:3000', '127.0.0.1', '169.254.169.254', 'printer.local', 'db.internal', 'user@evil.com@10.0.0.1', '[::1]', 'a..b.com']) {
      expect(parseDomain(bad), bad).toBeNull();
    }
  });
  it('is not confused with a file or project name, or a host shared by many tools', () => {
    for (const not of ['next.js', 'main.py', 'README.md', 'github.com', 'https://github.com/calcom/cal.com']) expect(parseDomain(not), not).toBeNull();
  });
  it('names the tool from its address', () => {
    expect(domainLabel('annot.io')).toBe('annot');
    expect(domainLabel('app.foo.co.uk')).toBe('foo');
  });
});

describe('reading a homepage', () => {
  const facts = readSite(annot, 'annot.io');
  it('finds the name, what it says it does, and the lowest paid price', () => {
    expect(facts.name).toBe('Annot');
    expect(facts.tagline).toBe('Visual feedback for the new way of building');
    expect(facts.description).toMatch(/^Pin comments on any website/);
    expect(facts.price).toEqual({ cents: 900, period: 'month' });
  });
  it('keeps the words that say what it does and drops the slogans', () => {
    expect(facts.words).toEqual(expect.arrayContaining(['visual', 'feedback', 'comments', 'website']));
    for (const slogan of ['new', 'way', 'building', 'annot', 'everything']) expect(facts.words).not.toContain(slogan);
  });
  it('leads with the phrase in the title', () => {
    expect(facts.phrases[0]).toBe('visual feedback');
    expect(facts.phrases).toContain('pin comments');
  });
  it('never joins the end of one clause to the start of the next', () => {
    const f = readSite(page('<title>Collect, Manage and Share Testimonials | Senja</title>'), 'senja.io');
    expect(f.phrases).toEqual(['share testimonials']);
  });
  it('keeps a name that is also an address, but not a plain .com', () => {
    expect(readSite(page('<title>Marker.io: The Website Feedback Tool for Any Team</title>'), 'marker.io').name).toBe('Marker.io');
    expect(readSite(page('<meta property="og:site_name" content="Calendly.com"><title>Scheduling</title>'), 'calendly.com').name).toBe('Calendly');
  });
  it('spells the name the way the site does', () => {
    expect(readSite(page('<title>BugHerd Makes it Easy to Get Website Feedback</title>'), 'bugherd.com').name).toBe('BugHerd');
  });
  it('falls back to the address when the page says nothing', () => {
    expect(readSite('', 'annot.io')).toMatchObject({ name: 'Annot', tagline: '', words: [], phrases: [], price: null });
  });
  it('cannot be made to run markup from a page', () => {
    const f = readSite(page('<title>&lt;script&gt;alert(1)&lt;/script&gt; Tool | Evil</title><meta name="description" content="<img src=x onerror=alert(1)>">'), 'evil.io');
    expect(f.description).not.toMatch(/<img/);
  });
});

describe('prices', () => {
  it('reads a monthly price before a yearly one, and ignores free and unlabelled amounts', () => {
    expect(readPrice('Free $0 / month. Pro $29 per month. Team $290/year. Raised $5,000,000.')).toEqual({ cents: 2900, period: 'month' });
    expect(readPrice('Billed $120 annually')).toEqual({ cents: 12000, period: 'year' });
    expect(readPrice('Save $50 today')).toBeNull();
  });
});

describe('searching GitHub with the site\'s own words', () => {
  const facts = { name: 'Annot', words: ['visual', 'feedback', 'comments', 'agent', 'pin', 'website'], phrases: ['visual feedback', 'pin comments'] };
  it('asks for self-declared alternatives, then its phrases as text and as topics', () => {
    const qs = siteQueries(facts, 'annot.io');
    expect(qs).toHaveLength(5);
    expect(qs[0]).toContain('"Annot alternative"');
    expect(qs[1]).toContain('topic:annot-alternative');
    expect(qs).toEqual(expect.arrayContaining([expect.stringContaining('"visual feedback"'), expect.stringContaining('topic:visual-feedback')]));
  });
  const hit = (fullName: string, description: string, stars: number, topics: string[] = []) => ({ fullName, url: `https://github.com/${fullName}`, description, stars, license: 'MIT', topics });
  it('keeps projects that do the job and drops ones that only share a phrase', () => {
    const ranked = rankSiteHits(
      [
        hit('a/password-meter', 'Gives visual feedback on password strength', 9000),
        hit('b/agentation', 'The visual feedback tool for agents.', 5000),
        hit('c/pinpoint', 'Pin comments on any website and send feedback', 12),
        hit('d/awesome-feedback', 'visual feedback comments website list', 7000, ['awesome-list']),
        hit('e/annot-clone', 'Open-source Annot alternative', 3),
      ],
      facts,
    ).map((h) => h.fullName);
    expect(ranked).toEqual(expect.arrayContaining(['b/agentation', 'c/pinpoint', 'e/annot-clone']));
    expect(ranked).not.toContain('a/password-meter');
    expect(ranked).not.toContain('d/awesome-feedback');
    expect(ranked.indexOf('b/agentation')).toBeLessThan(ranked.indexOf('c/pinpoint'));
  });
});

describe('fetching safely', () => {
  it('treats every non-public address as private', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:10.0.0.1', 'not-an-ip']) expect(isPrivateAddress(ip), ip).toBe(true);
    for (const ip of ['8.8.8.8', '104.16.0.1', '2606:4700::1111']) expect(isPrivateAddress(ip), ip).toBe(false);
  });
});

describe('tools we already track', () => {
  const products = [{ slug: 'calendly', name: 'Calendly', aliases: [] }, { slug: 'cal-com', name: 'Cal.com', aliases: null }, { slug: 'notion', name: 'Notion', aliases: ['Notion AI'] }];
  it('are recognised by their address', () => {
    expect(catalogMatch(products, 'calendly.com')?.slug).toBe('calendly');
    expect(catalogMatch(products, 'cal.com')?.slug).toBe('cal-com');
    expect(catalogMatch(products, 'annot.io')).toBeNull();
  });
});

describe('a saved answer', () => {
  const now = new Date('2026-11-15T12:00:00Z');
  const ago = (hours: number) => new Date(now.getTime() - hours * 3600_000).toISOString();
  it('is looked up again after two weeks, or sooner when the first try found nothing', () => {
    const repos = [{ fullName: 'a/b', url: '', description: '', stars: 1, license: null }];
    expect(isStale({ fetchedAt: ago(24), repos, readOk: true }, now)).toBe(false);
    expect(isStale({ fetchedAt: ago(24 * 15), repos, readOk: true }, now)).toBe(true);
    expect(isStale({ fetchedAt: ago(2), repos: [], readOk: true }, now)).toBe(true);
    expect(isStale({ fetchedAt: ago(0.5), repos: [], readOk: true }, now)).toBe(false);
  });
});
