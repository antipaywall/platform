// What search engines and answer engines read: schema.org data, and the short plain answers at
// the top of a page that they quote. Every sentence here is built from facts the page also
// shows, so the answer and the page never disagree.

import { site } from '../config/site';
import { shortCount } from './format';

const ORG_ID = `${site.origin}/#org`;
const SITE_ID = `${site.origin}/#site`;
export const ABOUT_SITE = 'Find the free, open-source version of the software you pay for. If it does not exist yet, help build it.';

const abs = (path: string) => new URL(path, site.origin).href;

/** Who runs the site and the site itself, on every page, so other data can point at them. */
export function siteGraph(): Record<string, unknown>[] {
  return [
    {
      '@type': 'Organization',
      '@id': ORG_ID,
      name: site.name,
      url: abs('/'),
      logo: { '@type': 'ImageObject', url: abs('/icon-512.png'), width: 512, height: 512 },
      description: ABOUT_SITE,
      sameAs: [site.repo.replace(/\/[^/]+$/, '')],
    },
    {
      '@type': 'WebSite',
      '@id': SITE_ID,
      name: site.name,
      url: abs('/'),
      description: ABOUT_SITE,
      publisher: { '@id': ORG_ID },
      inLanguage: 'en',
      potentialAction: { '@type': 'SearchAction', target: { '@type': 'EntryPoint', urlTemplate: `${abs('/search')}?q={search_term_string}` }, 'query-input': 'required name=search_term_string' },
    },
  ];
}

/**
 * One script's worth of structured data: the site's own entries plus the page's. Each page item
 * may carry its own @context; it is dropped, since the graph has one.
 */
export function ldGraph(page: unknown): string {
  const items = (Array.isArray(page) ? page : page ? [page] : []).filter(Boolean).map((x) => {
    const { ['@context']: _drop, ...rest } = x as Record<string, unknown>;
    return rest;
  });
  // Escaped so text from a repo description can never close the script tag.
  return JSON.stringify({ '@context': 'https://schema.org', '@graph': [...siteGraph(), ...items] }).replace(/</g, '\\u003c');
}

/** The trail a page shows above its title, as schema.org data. Each step is [name, path]. */
export function breadcrumbs(steps: [string, string][]): Record<string, unknown> {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: steps.map(([name, path], i) => ({ '@type': 'ListItem', position: i + 1, name, item: abs(path) })),
  };
}

export type QA = { q: string; a: string };

/** Questions and answers as schema.org data. Only for questions the page shows, word for word. */
export function faqData(qa: QA[]): Record<string, unknown> | null {
  if (!qa.length) return null;
  return { '@type': 'FAQPage', mainEntity: qa.map((x) => ({ '@type': 'Question', name: x.q, acceptedAnswer: { '@type': 'Answer', text: x.a } })) };
}

/** Cuts text to a length at a word, with an ellipsis when anything was cut. */
export function trimAtWord(text: string, max: number): string {
  const s = text.replace(/\s+/g, ' ').trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  const at = cut.lastIndexOf(' ');
  return `${(at > max * 0.6 ? cut.slice(0, at) : cut).replace(/[\s,;:.–-]+$/, '')}…`;
}

/** "A, B and C". */
export function listWords(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

type ToolProject = { name: string; stars: number; license: string | null };
type Tool = { name: string; price: string | null };

const starWords = (n: number) => `${shortCount(n)} GitHub ${n === 1 ? 'star' : 'stars'}`;
const licenseWords = (l: string | null) => (!l ? 'no license found' : l === 'Own license' ? 'its own license' : `${l} license`);

/**
 * The answer at the top of a tool's page: which free projects do the job, in the page's own
 * order. Null when there are none, since the page says that itself.
 */
export function toolAnswer(tool: Tool, projects: ToolProject[]): string | null {
  if (!projects.length) return null;
  const [first, ...rest] = projects;
  const lead = `${first.name} (${starWords(first.stars)}, ${licenseWords(first.license)})`;
  if (!rest.length) return `The free, open-source alternative to ${tool.name} is ${lead}.`;
  const more = rest.slice(0, 3).map((p) => p.name);
  const others = rest.length > 3 ? `, ${more.join(', ')} and ${rest.length - 3} more` : ` and ${listWords(more)}`;
  return `The top free, open-source alternatives to ${tool.name} are ${lead}${others}.`;
}

/** The questions people ask about a paid tool, answered from what the page lists. */
export function toolQuestions(tool: Tool, projects: ToolProject[], missing: string[]): QA[] {
  const qa: QA[] = [];
  const n = projects.length;
  if (n) {
    const top = [...projects].sort((a, b) => b.stars - a.stars)[0];
    qa.push({
      q: `Is there a free alternative to ${tool.name}?`,
      a: `Yes. ${n === 1 ? 'One free, open-source project does' : `${n} free, open-source projects do`} the same job as ${tool.name}, listed above with their stars, license and how recently they were updated.`,
    });
    qa.push({
      q: `What is the most popular open-source alternative to ${tool.name}?`,
      a: `By GitHub stars, it is ${top.name}, with ${starWords(top.stars)} (${licenseWords(top.license)}).`,
    });
  } else {
    qa.push({
      q: `Is there a free alternative to ${tool.name}?`,
      a: `Not yet. No open-source project tracked here does the same job as ${tool.name}. That makes it a gap anyone can propose as a hackathon brief.`,
    });
  }
  if (tool.price) qa.push({ q: `How much does ${tool.name} cost?`, a: `${tool.name} costs ${tool.price} at list price. Prices change, so check its own site.` });
  if (n) {
    qa.push({
      q: `Can I host a free ${tool.name} alternative myself?`,
      a: `Each project listed publishes its source code on GitHub, so you can read it, run it yourself and change it, within the terms of its license. Check the license column first: a project with no license found does not give you those rights.`,
    });
  }
  if (missing.length) {
    qa.push({
      q: `What do the free ${tool.name} alternatives still not do?`,
      a: `People here say they still want: ${listWords(missing.slice(0, 3))}.`,
    });
  }
  return qa;
}

/** One factual paragraph about a project, so its page says more than its GitHub description. */
export function projectSummary(p: {
  name: string; stars: number; license: string; contributors: number | null; pushedAgo: string | null; started: string | null; replaces: string[];
}): string {
  const what = p.replaces.length ? `a free, open-source alternative to ${listWords(p.replaces.slice(0, 3))}` : 'a free, open-source project on GitHub';
  const parts = [`${p.name} is ${what}, with ${starWords(p.stars)}.`];
  parts.push(p.license === 'No license' ? 'No license was found for it.' : p.license === 'Own license' ? 'It uses its own license.' : `It is released under the ${p.license} license.`);
  const people = p.contributors != null && p.contributors > 0 ? `${shortCount(p.contributors)} ${p.contributors === 1 ? 'person has' : 'people have'} contributed` : null;
  const when = [p.started ? `started in ${p.started}` : null, p.pushedAgo && p.pushedAgo !== 'never' ? `last changed ${p.pushedAgo}` : null].filter(Boolean).join(', ');
  if (people && when) parts.push(`${people}; it was ${when}.`);
  else if (people) parts.push(`${people}.`);
  else if (when) parts.push(`It was ${when}.`);
  return parts.join(' ');
}

/** A category name as an address: "Project management" → "project-management". */
export const categorySlug = (name: string) => name.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
