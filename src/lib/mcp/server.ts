// The Antipaywall MCP: what coding agents can do here. Search for free alternatives, look up gaps
// and their demand, post an idea, say "me too", suggest an improvement, follow. Builders only, with
// the same checks and limits as the site. Nothing here calls an AI model.
//
// A small, stateless JSON-RPC handler for MCP's Streamable HTTP transport: each POST is answered
// with JSON, which suits the site's serverless functions.

import type { SupabaseClient } from '@supabase/supabase-js';
import { site } from '../../config/site';
import type { Person } from '../db';
import { parseIdea } from '../forms';
import { demandFor } from '../gaps';
import { pushNewIdea } from '../ideasSync';
import { findMatches } from '../match';
import { storeIdea } from '../postIdea';
import { getProductPage } from '../products';
import { takeSlot } from '../ratelimit';

export const PROTOCOL_VERSION = '2025-06-18';
const MAX_WRITES_PER_HOUR = 30;

type Ctx = { person: Person; db: SupabaseClient; origin: string };
type Tool = { name: string; description: string; inputSchema: object; write?: boolean; run: (args: any, ctx: Ctx) => Promise<unknown> };

const str = (d: string, max = 200) => ({ type: 'string', description: d, maxLength: max });
const url = (ctx: Ctx, path: string) => `${ctx.origin}${path}`;

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
        serverInfo: { name: 'antipaywall', title: 'Antipaywall', version: '1.0.0' },
        instructions: 'Antipaywall finds free, open-source versions of paid tools and collects what people want built. Search before suggesting someone pays for a tool; if nothing exists, offer to post it as an idea.',
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
