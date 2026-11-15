// The Antipaywall MCP: what coding agents can do here. Search for free alternatives, look a paid
// tool up by its website, keep the list of tools you pay for, look up gaps and their demand, post
// an idea, say "me too", suggest an improvement, follow, find an issue to contribute to, and get
// the checklist for making a project ready to open-source. Builders only, with the same checks and
// limits as the site. Nothing here calls an AI model. The design is in docs/mcp.md.
//
// A small, stateless JSON-RPC handler for MCP's Streamable HTTP transport: each POST is answered
// with JSON, which suits the site's serverless functions.

import type { SupabaseClient } from '@supabase/supabase-js';
import { site } from '../../config/site';
import { OSR_GUIDE_PATH, osrChecklist } from './checklist';
import { catalogSlugFor, countAsk, getAsked, isStale, lookupTool, type AskedTool } from '../askedTools';
import type { Person } from '../db';
import { parseIdea } from '../forms';
import { demandFor } from '../gaps';
import { pushNewIdea } from '../ideasSync';
import { findMatches } from '../match';
import { addMyTool, listMyTools, removeMyTool } from '../myTools';
import { storeIdea } from '../postIdea';
import { getProductPage, SOLID_STARS } from '../products';
import { takeSlot } from '../ratelimit';
import { parseDomain } from '../siteReader';

export const PROTOCOL_VERSION = '2025-06-18';
const MAX_WRITES_PER_HOUR = 30;
/** New websites one person, and the site as a whole, may have looked up in an hour: the same as the site's own lookup. */
const MAX_LOOKUPS_PER_HOUR = 10;
const MAX_ALL_LOOKUPS_PER_HOUR = 150;

type Ctx = { person: Person; db: SupabaseClient; origin: string };
type Tool = { name: string; description: string; inputSchema: object; write?: boolean; run: (args: any, ctx: Ctx) => Promise<unknown> };

const str = (d: string, max = 200) => ({ type: 'string', description: d, maxLength: max });
const url = (ctx: Ctx, path: string) => `${ctx.origin}${path}`;
const count = (v: unknown, max: number, fallback: number) => Math.min(max, Math.max(1, Math.trunc(Number(v)) || fallback));

/** What a lookup found, as an agent reads it. */
const asLookup = (t: AskedTool, ctx: Ctx) => ({
  name: t.name,
  website: t.domain,
  says_it_is: t.tagline || t.description || null,
  price: t.price ? `from about $${(t.price.cents / 100).toFixed(t.price.cents % 100 ? 2 : 0)} a ${t.price.period}` : null,
  // A gap: nothing found that many people rely on.
  is_a_gap: t.bestStars < SOLID_STARS,
  projects: t.repos.map((r) => ({ repo: r.fullName, url: r.url, stars: r.stars, license: r.license, description: r.description })),
  people_who_asked: t.asks,
  page: url(ctx, `/find/${t.domain}`),
  how: t.readOk
    ? 'Found by reading the tool\'s own website and searching GitHub with its words. No AI was used, so the list can miss or include something off.'
    : 'The website could not be read, so only its name is known.',
});

/**
 * The saved answer for a website, looking it up first when nobody has, or when the answer is old.
 * A new lookup costs a page read and a handful of GitHub searches, so it has the site's limits.
 */
async function lookedUp(ctx: Ctx, domain: string): Promise<AskedTool | 'limited' | 'hidden'> {
  const known = await getAsked(ctx.db, domain);
  if (known?.status === 'hidden') return 'hidden';
  if (known && !isStale(known)) return known;
  const limited =
    (await takeSlot(ctx.db, 'find', `u:${ctx.person.id}`, MAX_LOOKUPS_PER_HOUR)) === 'limited' || (await takeSlot(ctx.db, 'find-all', 'all', MAX_ALL_LOOKUPS_PER_HOUR)) === 'limited';
  if (limited) return known ?? 'limited';
  try {
    return (await lookupTool(ctx.db, domain, { token: import.meta.env.GITHUB_TOKEN })).tool;
  } catch (e) {
    if (known) return known;
    throw e;
  }
}

export const TOOLS: Tool[] = [
  {
    name: 'search',
    description: 'Search Antipaywall for free, open-source alternatives to a paid tool, or for something people want built. Use it when someone asks "is there a free or open-source version of X?"',
    inputSchema: { type: 'object', properties: { query: str('A paid tool, or what it should do') }, required: ['query'] },
    run: async ({ query }, ctx) => {
      const m = await findMatches(ctx.db, String(query ?? ''), 8);
      return {
        paid_tools: m.products.map((p) => ({ name: p.name, page: url(ctx, `/free-alternatives/${p.slug}`), slug: p.slug })),
        wanted: m.gaps.map((g) => ({ title: g.title, page: url(ctx, `/ideas/${g.slug}`), slug: g.slug })),
        projects: m.projects.map((p) => ({ repo: p.fullName, stars: p.stars, description: p.description, page: url(ctx, `/projects/${p.fullName}`) })),
        nothing_found: !m.products.length && !m.gaps.length && !m.projects.length,
      };
    },
  },
  {
    name: 'alternatives_to',
    description: 'The free, open-source projects that replace one paid tool, most used first, with what people say is still missing.',
    inputSchema: { type: 'object', properties: { slug: str('The paid tool, as returned by search (e.g. "calendly")', 60) }, required: ['slug'] },
    run: async ({ slug }, ctx) => {
      const p = await getProductPage(ctx.db, String(slug ?? '').toLowerCase(), { userId: null, personId: null, visitor: undefined });
      if (!p) return { error: 'No paid tool with that slug. Use search first.' };
      return {
        paid_tool: p.product.name,
        page: url(ctx, `/free-alternatives/${p.product.slug}`),
        projects: p.projects.slice(0, 15).map((x) => ({ repo: x.fullName, url: x.url, stars: x.stars, license: x.license, people_using: x.users, description: x.description })),
        still_missing: p.missing.map((g) => ({ title: g.title, want: g.want, page: url(ctx, `/ideas/${g.slug}`) })),
        demand: p.demand,
      };
    },
  },
  {
    name: 'get_gap',
    description: 'One thing people want built: what it is, how many want it, what they would pay (a signal, never money), and who is building it.',
    inputSchema: { type: 'object', properties: { slug: str('The gap, as returned by search or top_gaps', 90) }, required: ['slug'] },
    run: async ({ slug }, ctx) => {
      const { data } = await ctx.db.from('ideas').select('id, slug, title, pitch, problem, build, missing, build_status, gap_claims(person_id)').eq('slug', String(slug ?? '')).eq('status', 'listed').maybeSingle();
      if (!data) return { error: 'No gap with that slug.' };
      const d = (await demandFor(ctx.db, [data.id])).get(data.id);
      return {
        title: data.title, pitch: data.pitch, problem: data.problem, what_to_build: data.build, missing_today: data.missing,
        status: data.build_status, builders_on_it: ((data as any).gap_claims ?? []).length,
        want: d?.want ?? 0, would_pay: d?.pay ?? 0, would_pay_total_monthly_usd: (d?.payMonthCents ?? 0) / 100, will_test: d?.test ?? 0,
        note: 'Would-pay is a signal of demand, never money.',
        page: url(ctx, `/ideas/${data.slug}`),
      };
    },
  },
  {
    name: 'top_gaps',
    description: 'The things people most want built that nobody has built yet, most wanted first.',
    inputSchema: { type: 'object', properties: { limit: { type: 'integer', minimum: 1, maximum: 25 } } },
    run: async ({ limit }, ctx) => {
      const { data } = await ctx.db.from('ideas').select('id, slug, title').eq('status', 'listed').is('merged_into', null).eq('build_status', 'wanted').limit(500);
      const demand = await demandFor(ctx.db, (data ?? []).map((i) => i.id));
      return (data ?? [])
        .map((i) => ({ title: i.title, want: demand.get(i.id)?.want ?? 0, would_pay: demand.get(i.id)?.pay ?? 0, page: url(ctx, `/ideas/${i.slug}`), slug: i.slug }))
        .sort((a, b) => b.want - a.want)
        .slice(0, Math.min(25, Math.max(1, Number(limit) || 10)));
    },
  },
  {
    name: 'post_idea',
    description:
      'Post something people want that does not exist yet. It first checks for matching ideas and paid tools; if any come back, show them to the person and only post with confirm_new: true when none of them fit.',
    write: true,
    inputSchema: {
      type: 'object',
      properties: { title: str('The idea, in a short line', 80), pitch: str('What it should do, in a sentence or two', 280), missing: str('What existing options are missing', 600), confirm_new: { type: 'boolean' } },
      required: ['title'],
    },
    run: async (args, ctx) => {
      const parsed = parseIdea({ title: args.title, pitch: args.pitch ?? '', missing: args.missing ?? '' });
      if (!parsed.ok) return { error: parsed.error };
      if (!args.confirm_new) {
        const m = await findMatches(ctx.db, parsed.title, 5);
        if (m.gaps.length || m.products.length) {
          return {
            posted: false,
            matches: { wanted: m.gaps.map((g) => ({ title: g.title, slug: g.slug })), paid_tools: m.products.map((p) => ({ name: p.name, slug: p.slug })) },
            next: 'If one of these is what they meant, use me_too on it instead. Otherwise call post_idea again with confirm_new: true.',
          };
        }
      }
      const mine = await ctx.db.from('ideas').select('id', { count: 'exact', head: true }).eq('author_id', ctx.person.id).eq('status', 'listed');
      if ((mine.count ?? 0) >= site.ideas.maxPerPerson) return { error: 'You have posted the most ideas one person can.' };
      const { slug, code } = await storeIdea(ctx.db, parsed, ctx.person.id);
      if (!slug) return { error: code };
      await pushNewIdea(ctx.db, slug, { login: ctx.person.username!, githubId: ctx.person.github_id }).catch(() => false);
      return { posted: code === 'idea_posted', already_existed: code === 'idea_exists', page: url(ctx, `/ideas/${slug}`), slug };
    },
  },
  {
    name: 'me_too',
    description: 'Say "I want this too" on a gap. Counts once per person.',
    write: true,
    inputSchema: { type: 'object', properties: { slug: str('The gap', 90) }, required: ['slug'] },
    run: async ({ slug }, ctx) => {
      const { data } = await ctx.db.from('ideas').select('id').eq('slug', String(slug ?? '')).eq('status', 'listed').maybeSingle();
      if (!data) return { error: 'No gap with that slug.' };
      // The builder's id stands in for a browser here, so it counts once with their signed-in hearts.
      await ctx.db.from('idea_hearts').upsert({ idea_id: data.id, visitor: ctx.person.id, user_id: ctx.person.id }, { ignoreDuplicates: true });
      return { ok: true, page: url(ctx, `/ideas/${slug}`) };
    },
  },
  {
    name: 'suggest_improvement',
    description: 'Suggest an improvement to a gap. It opens a page where the person edits the idea; the change goes to whoever started it as a pull request.',
    inputSchema: { type: 'object', properties: { slug: str('The gap', 90) }, required: ['slug'] },
    run: async ({ slug }, ctx) => ({ open_this: url(ctx, `/ideas/${String(slug ?? '')}/suggest`), note: 'Suggestions are written by the person, on the page, and sent as a pull request in their name.' }),
  },
  {
    name: 'follow',
    description: 'Follow a gap, to hear when it changes or someone starts building it.',
    write: true,
    inputSchema: { type: 'object', properties: { slug: str('The gap', 90) }, required: ['slug'] },
    run: async ({ slug }, ctx) => {
      const { data } = await ctx.db.from('ideas').select('id').eq('slug', String(slug ?? '')).eq('status', 'listed').maybeSingle();
      if (!data) return { error: 'No gap with that slug.' };
      await ctx.db.from('follows').upsert({ follower_id: ctx.person.id, subject_kind: 'gap', subject_id: data.id }, { ignoreDuplicates: true });
      return { ok: true };
    },
  },
  {
    name: 'lookup_tool',
    description:
      'Look up a paid tool by its website when search does not know it. Antipaywall reads what the tool says it does and searches GitHub for open-source projects doing the same job, then remembers the answer. Use it when someone names a tool they pay for and gives, or you know, its website.',
    inputSchema: { type: 'object', properties: { website: str('The tool\'s website, e.g. "annot.io"', 200) }, required: ['website'] },
    run: async ({ website }, ctx) => {
      const domain = parseDomain(String(website ?? ''));
      if (!domain) return { error: 'That is not a tool\'s website. Give the address someone would type to visit it, like "annot.io".' };
      const slug = await catalogSlugFor(ctx.db, domain);
      if (slug) return { tracked: true, slug, page: url(ctx, `/free-alternatives/${slug}`), next: 'Antipaywall already tracks this tool. Call alternatives_to with this slug.' };
      const tool = await lookedUp(ctx, domain);
      if (tool === 'hidden') return { error: 'That website can\'t be looked up.' };
      if (tool === 'limited') return { error: 'Too many lookups in the last hour. Try again later.' };
      await countAsk(ctx.db, domain, `u:${ctx.person.id}`);
      return {
        ...asLookup(tool, ctx),
        next: tool.bestStars < SOLID_STARS ? 'Nobody has built a solid free version. If the person wants one, offer post_idea.' : 'If none of these replaces it for the person, offer post_idea and say what is missing.',
      };
    },
  },
  {
    name: 'my_tools',
    description:
      'The paid tools this person pays for today. List them, add one, or remove one. Adding a tool tells Antipaywall it is worth replacing; it is not a payment and costs nothing. Give a tool as returned by search (a slug like "calendly") or as its website ("annot.io").',
    inputSchema: {
      type: 'object',
      properties: { action: { type: 'string', enum: ['list', 'add', 'remove'] }, tool: str('For add and remove: the tool\'s slug or website', 200) },
      required: ['action'],
    },
    run: async ({ action, tool }, ctx) => {
      const shown = async () =>
        (await listMyTools(ctx.db, ctx.person.id)).map((t) =>
          t.kind === 'catalog' ? { name: t.name, slug: t.slug, page: url(ctx, `/free-alternatives/${t.slug}`) } : { name: t.name, website: t.domain, page: url(ctx, `/find/${t.domain}`) },
        );
      if (action === 'list') return { tools: await shown() };
      if (action !== 'add' && action !== 'remove') return { error: 'action must be list, add or remove.' };
      if (typeof tool !== 'string' || !tool.trim()) return { error: 'Say which tool: its slug or its website.' };
      if ((await takeSlot(ctx.db, 'mcp_write', ctx.person.id, MAX_WRITES_PER_HOUR)) === 'limited') return { error: 'Too many changes in the last hour. Try again later.' };
      if (action === 'remove') return { removed: await removeMyTool(ctx.db, ctx.person.id, tool), tools: await shown() };
      let added = await addMyTool(ctx.db, ctx.person.id, tool);
      // A website nobody has asked about yet is looked up first, then added.
      if (!added.ok && added.reason === 'not_looked_up') {
        const domain = parseDomain(tool);
        const found = domain ? await lookedUp(ctx, domain) : 'hidden';
        if (found === 'limited') return { error: 'Too many lookups in the last hour. Try again later.' };
        if (found !== 'hidden') added = await addMyTool(ctx.db, ctx.person.id, tool);
      }
      if (!added.ok) {
        return {
          error: {
            unknown: 'No paid tool by that name or website. Use search, or give its website.',
            not_looked_up: 'That website can\'t be looked up.',
            too_many: 'That is the most tools one person can list.',
            failed: 'That did not save. Try again in a minute.',
          }[added.reason],
        };
      }
      return { added: !added.already, already_listed: added.already, tool: added.tool.name, tools: await shown() };
    },
  },
  {
    name: 'help_wanted',
    description:
      'Open issues that open-source projects have marked "help wanted" or "good first issue", for someone looking for something to contribute to. Narrow it by a paid tool (projects replacing it), or by a topic or language as projects tag themselves on GitHub (e.g. "typescript", "self-hosted").',
    inputSchema: {
      type: 'object',
      properties: {
        paid_tool: str('A paid tool\'s slug, as returned by search: issues in the projects that replace it', 60),
        topic: str('A GitHub topic or language the project is tagged with', 50),
        first_timers: { type: 'boolean', description: 'Only issues marked as good for a first contribution' },
        limit: { type: 'integer', minimum: 1, maximum: 25 },
      },
    },
    run: async ({ paid_tool, topic, first_timers, limit }, ctx) => {
      const n = count(limit, 25, 10);
      let projects: { id: string; full_name: string; stars: number }[] = [];
      if (typeof paid_tool === 'string' && paid_tool.trim()) {
        const { data: p } = await ctx.db.from('products').select('id').eq('slug', paid_tool.trim().toLowerCase()).maybeSingle();
        if (!p) return { error: 'No paid tool with that slug. Use search first.' };
        const { data } = await ctx.db.from('project_products').select('projects!inner(id, full_name, stars, listed)').eq('product_id', p.id).eq('projects.listed', true).limit(200);
        projects = ((data ?? []) as any[]).map((r) => r.projects).filter(Boolean);
      } else {
        let q = ctx.db.from('projects').select('id, full_name, stars').eq('listed', true).or('help_wanted.gt.0,good_first.gt.0');
        const tag = typeof topic === 'string' ? topic.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9+#.-]/g, '') : '';
        if (tag) q = q.contains('topics', [tag]);
        const { data, error } = await q.order('stars', { ascending: false }).limit(150);
        if (error) throw new Error(error.message);
        projects = (data ?? []) as typeof projects;
      }
      projects = projects.sort((a, b) => b.stars - a.stars).slice(0, 150);
      if (!projects.length) return { issues: [], note: 'No tracked project matches that. Try a broader topic, or none at all.' };
      const byId = new Map(projects.map((p) => [p.id, p]));
      const { data, error } = await ctx.db.from('help_issues').select('project_id, title, url, labels, comments, updated_at').in('project_id', projects.map((p) => p.id)).order('updated_at', { ascending: false }).limit(300);
      if (error) throw new Error(error.message);
      const first = (labels: string[]) => labels.some((l) => /good.first|first.timer|beginner|starter|easy/i.test(l));
      // At most two from any one project, so one busy project doesn't fill the list.
      const perProject = new Map<string, number>();
      const issues = ((data ?? []) as { project_id: string; title: string; url: string; labels: string[] | null; comments: number; updated_at: string | null }[])
        // An issue nobody has touched in two years is rarely still wanted.
        .filter((i) => !i.updated_at || Date.now() - Date.parse(i.updated_at) < 730 * 24 * 3600 * 1000)
        .filter((i) => !first_timers || first(i.labels ?? []))
        .filter((i) => {
          const seen = perProject.get(i.project_id) ?? 0;
          perProject.set(i.project_id, seen + 1);
          return seen < 2;
        })
        .slice(0, n)
        .map((i) => {
          const p = byId.get(i.project_id)!;
          return { title: i.title, url: i.url, repo: p.full_name, stars: p.stars, labels: i.labels ?? [], comments: i.comments, good_first_issue: first(i.labels ?? []), updated: i.updated_at?.slice(0, 10) ?? null, project_page: url(ctx, `/projects/${p.full_name}`) };
        });
      return { issues, note: 'Read the project\'s contributing guide and say on the issue that you are taking it before starting.' };
    },
  },
  {
    name: 'open_source_ready',
    description:
      'The Open Source Ready checklist: what to do before making a project public, and in its first month. Returns the steps and where the full guide and the skill live. The skill checks most steps against the code on the person\'s own machine; nothing from their project is sent to Antipaywall.',
    inputSchema: { type: 'object', properties: { for: { type: 'string', enum: ['all', 'users', 'contributors', 'company'], description: 'Only the steps for this kind of project. Leave out for every step.' } } },
    run: async (args, ctx) => ({ ...osrChecklist(typeof args?.for === 'string' ? args.for : null), guide: url(ctx, OSR_GUIDE_PATH) }),
  },
];

type Rpc = { jsonrpc: '2.0'; id?: string | number | null; method: string; params?: any };

const ok = (id: Rpc['id'], result: unknown) => ({ jsonrpc: '2.0', id, result });
const fail = (id: Rpc['id'], code: number, message: string) => ({ jsonrpc: '2.0', id, error: { code, message } });

/** Answers one JSON-RPC message. Notifications (no id) get null. */
export async function handleRpc(msg: Rpc, ctx: Ctx): Promise<object | null> {
  if (msg.id === undefined || msg.id === null) return null;
  switch (msg.method) {
    case 'initialize':
      return ok(msg.id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'antipaywall', title: 'Antipaywall', version: '1.1.0' },
        instructions:
          'Antipaywall finds free, open-source versions of paid tools and collects what people want built. Search before suggesting someone pays for a tool. If search does not know the tool, look it up by its website with lookup_tool. If nothing solid exists, offer to post it as an idea. When someone mentions a tool they pay for, offer to add it to my_tools. For someone who wants to contribute to open source, use help_wanted; for someone about to publish a project, use open_source_ready.',
      });
    case 'ping':
      return ok(msg.id, {});
    case 'tools/list':
      return ok(msg.id, { tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) });
    case 'tools/call': {
      const tool = TOOLS.find((t) => t.name === msg.params?.name);
      if (!tool) return ok(msg.id, { content: [{ type: 'text', text: `No tool called ${msg.params?.name}.` }], isError: true });
      if (tool.write && (await takeSlot(ctx.db, 'mcp_write', ctx.person.id, MAX_WRITES_PER_HOUR)) === 'limited') {
        return ok(msg.id, { content: [{ type: 'text', text: 'Too many changes in the last hour. Try again later.' }], isError: true });
      }
      try {
        const out = await tool.run(msg.params?.arguments ?? {}, ctx);
        const isError = Boolean(out && typeof out === 'object' && 'error' in (out as object));
        return ok(msg.id, { content: [{ type: 'text', text: JSON.stringify(out, null, 1) }], structuredContent: Array.isArray(out) ? { items: out } : out, isError });
      } catch {
        return ok(msg.id, { content: [{ type: 'text', text: 'Something went wrong on Antipaywall. Try again in a minute.' }], isError: true });
      }
    }
    default:
      return fail(msg.id, -32601, `Unknown method ${msg.method}`);
  }
}
