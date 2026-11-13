// One idea, one Markdown file in the public antipaywall/ideas repo: front matter for the facts,
// plain sections for the words. The site, the Antipaywall GitHub App and people editing on GitHub
// all read and write this same shape.

import { parse, stringify } from 'yaml';

export const IDEA_STATUSES = ['wanted', 'building', 'exists', 'adopt'] as const;
export type IdeaStatus = (typeof IDEA_STATUSES)[number];

const SECTIONS = {
  problem: 'The problem',
  build: 'What it should do',
  missing: 'What existing options are missing',
  strong: 'A strong entry',
  questions: 'Open questions',
} as const;
export type SectionKey = keyof typeof SECTIONS;

export type IdeaFile = {
  slug: string;
  title: string;
  /** One line under the title. */
  pitch?: string;
  status: IdeaStatus;
  /** The GitHub login of whoever started it; null for ideas Antipaywall posted. */
  startedBy: string | null;
  replaces: string[];
  like: string[];
  mergedInto: string | null;
  created: string | null;
  sections: Partial<Record<SectionKey, string>>;
};

export const ideaPath = (slug: string) => `ideas/${slug}.md`;
const slugOf = (path: string) => path.replace(/^ideas\//, '').replace(/\.md$/, '');

export function renderIdeaFile(i: IdeaFile): string {
  const front: Record<string, unknown> = { title: i.title };
  if (i.pitch) front.pitch = i.pitch;
  front.status = i.status;
  if (i.startedBy) front.started_by = i.startedBy;
  if (i.replaces.length) front.replaces = i.replaces;
  if (i.like.length) front.like = i.like;
  if (i.mergedInto) front.merged_into = i.mergedInto;
  if (i.created) front.created = i.created;
  const body = (Object.keys(SECTIONS) as SectionKey[])
    .filter((k) => i.sections[k]?.trim())
    .map((k) => `## ${SECTIONS[k]}\n\n${i.sections[k]!.trim()}\n`)
    .join('\n');
  return `---\n${stringify(front, { lineWidth: 0 })}---\n\n${body}`;
}

export function parseIdeaFile(text: string, path: string): IdeaFile {
  const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(text.replace(/\r\n/g, '\n'));
  if (!m) throw new Error(`${path}: no front matter`);
  const front = (parse(m[1]) ?? {}) as Record<string, unknown>;
  const title = typeof front.title === 'string' ? front.title.trim() : '';
  if (!title) throw new Error(`${path}: title is missing`);
  const status = (front.status ?? 'wanted') as IdeaStatus;
  if (!IDEA_STATUSES.includes(status)) throw new Error(`${path}: status must be one of ${IDEA_STATUSES.join(', ')}`);
  const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
  const sections: Partial<Record<SectionKey, string>> = {};
  const byHeading = new Map(Object.entries(SECTIONS).map(([k, h]) => [h.toLowerCase(), k as SectionKey]));
  for (const part of m[2].split(/^## /m).slice(1)) {
    const [heading, ...rest] = part.split('\n');
    const key = byHeading.get(heading.trim().toLowerCase());
    const text = rest.join('\n').trim();
    if (key && text) sections[key] = text;
  }
  const created = front.created instanceof Date ? front.created.toISOString().slice(0, 10) : typeof front.created === 'string' ? front.created : null;
  return {
    slug: slugOf(path),
    title,
    ...(typeof front.pitch === 'string' && front.pitch.trim() ? { pitch: front.pitch.trim() } : {}),
    status,
    startedBy: typeof front.started_by === 'string' ? front.started_by : null,
    replaces: list(front.replaces),
    like: list(front.like),
    mergedInto: typeof front.merged_into === 'string' ? front.merged_into : null,
    created,
    sections,
  };
}
