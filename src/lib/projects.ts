// Project profiles: one public GitHub repo, as the sync last saw it, plus what Antipaywall knows
// about it that GitHub doesn't: the paid products it replaces, the wishes it partly meets,
// similar projects, and who uses it.

import type { SupabaseClient } from '@supabase/supabase-js';
import { demandKey, signalsOf } from './signals';
import { pointsFromSnapshots } from './sync/stars';

/** Topics too broad to say two projects do the same thing. */
const GENERIC_TOPICS = new Set(['ai', 'llm', 'llms', 'openai', 'chatgpt', 'gpt', 'python', 'javascript', 'typescript', 'go', 'golang', 'rust', 'java', 'php', 'ruby', 'react', 'nextjs', 'vue', 'nodejs', 'docker', 'self-hosted', 'selfhosted', 'open-source', 'opensource', 'hacktoberfest', 'awesome', 'awesome-list', 'artificial-intelligence', 'machine-learning', 'deep-learning', 'agent', 'agents', 'ai-agent', 'ai-agents', 'claude', 'claude-code', 'mcp', 'cli', 'api', 'web', 'webapp', 'linux', 'windows', 'macos', 'android', 'ios', 'free', 'tool', 'tools']);

export type ProjectPage = {
  project: {
    id: string; fullName: string; owner: string; name: string; url: string; description: string | null; homepage: string | null;
    topics: string[]; licenseSpdx: string | null; licenseName: string | null; stars: number; forks: number; openIssues: number;
    helpWanted: number; goodFirst: number; contributors: number | null; pushedAt: string | null; createdOnGithub: string | null;
    latestReleaseTag: string | null; latestReleaseAt: string | null; starPoints: [string, number][]; indexable: boolean; syncedAt: string;
  };
  products: { id: string; slug: string; name: string }[];
  gaps: { slug: string; title: string }[];
  similar: { fullName: string; description: string | null; stars: number; license: string | null; pushedAt: string | null; replaces: string[] }[];
  issues: { number: number; title: string; url: string; labels: string[]; comments: number }[];
  users: number;
  mineUse: boolean;
  following: boolean;
};

export async function getProjectPage(
  db: SupabaseClient,
  owner: string,
  repo: string,
  who: { userId: string | null; personId: string | null; visitor: string | undefined },
): Promise<ProjectPage | null> {
  const full = `${owner}/${repo}`;
  const { data: p, error } = await db.from('projects').select('*').ilike('full_name', full.replace(/[%_\\]/g, '\\$&')).eq('listed', true).maybeSingle();
  if (error) throw new Error(error.message);
  if (!p) return null;
  const topics: string[] = p.topics ?? [];
  const [products, gaps, similar, issues, uses, mine, follow, snaps] = await Promise.all([
    db.from('project_products').select('products(id, slug, name)').eq('project_id', p.id),
    db.from('ideas').select('slug, title').eq('status', 'listed').is('merged_into', null).contains('existing_repos', [{ fullName: p.full_name }]).limit(10),
    topics.length
      ? db.from('projects').select('full_name, description, stars, topics, license_spdx, license_name, pushed_at').eq('listed', true).overlaps('topics', topics.filter((t) => !GENERIC_TOPICS.has(t)).length ? topics.filter((t) => !GENERIC_TOPICS.has(t)) : topics).neq('id', p.id).order('stars', { ascending: false }).limit(40)
      : Promise.resolve({ data: [] }),
    db.from('help_issues').select('number, title, url, labels, comments').eq('project_id', p.id).order('updated_at', { ascending: false }).limit(10),
    db.from('signals').select('user_id, visitor').eq('subject_kind', 'project').eq('subject_id', p.id).eq('kind', 'use'),
    signalsOf(db, { userId: who.userId ?? undefined, visitor: who.visitor }, 'project', [p.id]),
    who.personId ? db.from('follows').select('follower_id').eq('follower_id', who.personId).eq('subject_kind', 'project').eq('subject_id', p.id).limit(1) : Promise.resolve({ data: [] }),
    db.from('project_snapshots').select('day, stars').eq('project_id', p.id).order('day', { ascending: false }).limit(1000),
  ]);
  // Similar: first the other free alternatives to the same paid tools, then projects sharing at
  // least two specific topics (not "ai" or "python"), most shared first.
  const productRows = (((products as any).data ?? []) as any[]).map((r) => r.products).filter(Boolean);
  const siblings = productRows.length
    ? ((((await db.from('project_products').select('products(name), projects!inner(id, full_name, description, stars, license_spdx, license_name, pushed_at, listed)').in('product_id', productRows.map((x: any) => x.id)).eq('projects.listed', true).neq('project_id', p.id).limit(60)).data ?? []) as any[]))
    : [];
  const card = (s: any, replaces: string[] = []) => ({ fullName: s.full_name, description: s.description, stars: s.stars, license: s.license_spdx ?? (s.license_name ? 'Own license' : null), pushedAt: s.pushed_at, replaces });
  const byName = new Map<string, ReturnType<typeof card>>();
  for (const r of siblings.sort((a, b) => b.projects.stars - a.projects.stars)) {
    const c = byName.get(r.projects.full_name) ?? card(r.projects);
    if (r.products?.name && !c.replaces.includes(r.products.name)) c.replaces.push(r.products.name);
    byName.set(r.projects.full_name, c);
  }
  const specific = topics.filter((t) => !GENERIC_TOPICS.has(t));
  const need = Math.min(2, specific.length || topics.length);
  const shared = (s: any) => (s.topics ?? []).filter((t: string) => (specific.length ? specific : topics).includes(t)).length;
  const byTopic = (((similar as any).data ?? []) as any[])
    .filter((s) => shared(s) >= need && !byName.has(s.full_name))
    .sort((a, b) => shared(b) - shared(a) || b.stars - a.stars)
    .map((s) => card(s));
  const sim = [...byName.values(), ...byTopic].slice(0, 6);
  const points = pointsFromSnapshots(((snaps as any).data ?? []) as { day: string; stars: number }[]);
  return {
    project: {
      id: p.id, fullName: p.full_name, owner: p.owner, name: p.name, url: p.url, description: p.description,
      homepage: typeof p.homepage === 'string' && /^https?:\/\//.test(p.homepage) ? p.homepage : null,
      topics, licenseSpdx: p.license_spdx, licenseName: p.license_name, stars: p.stars, forks: p.forks, openIssues: p.open_issues,
      helpWanted: p.help_wanted, goodFirst: p.good_first, contributors: p.contributors, pushedAt: p.pushed_at, createdOnGithub: p.created_on_github,
      latestReleaseTag: p.latest_release_tag, latestReleaseAt: p.latest_release_at, starPoints: points, indexable: p.indexable, syncedAt: p.synced_at,
    },
    products: (((products as any).data ?? []) as any[]).map((r) => r.products).filter(Boolean),
    gaps: ((gaps as any).data ?? []) as { slug: string; title: string }[],
    similar: sim,
    issues: ((issues as any).data ?? []) as ProjectPage['issues'],
    users: new Set((((uses as any).data ?? []) as any[]).map((u) => demandKey(u.user_id, u.visitor))).size,
    mineUse: mine.get(p.id)?.has('use') ?? false,
    following: (((follow as any).data ?? []) as unknown[]).length > 0,
  };
}

/** The star points for the README chart, with today's count from the row when history is missing. */
export async function getStarPoints(db: SupabaseClient, owner: string, repo: string): Promise<{ fullName: string; points: [string, number][] } | null> {
  const full = `${owner}/${repo}`;
  const { data } = await db.from('projects').select('id, full_name, stars, synced_at').ilike('full_name', full.replace(/[%_\\]/g, '\\$&')).eq('listed', true).maybeSingle();
  if (!data) return null;
  const snaps = await db.from('project_snapshots').select('day, stars').eq('project_id', data.id).order('day', { ascending: false }).limit(1000);
  const points = pointsFromSnapshots((snaps.data ?? []) as { day: string; stars: number }[]);
  return { fullName: data.full_name, points: points.length ? points : [[String(data.synced_at).slice(0, 10), data.stars]] };
}
