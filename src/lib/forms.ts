import { site } from '../config/site';
import { parseEmail } from './intake';

type Ok<T> = { ok: true } & T;
type Bad = { ok: false; error: import('./respond').MessageCode };

const clean = (v: unknown) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : '');

/**
 * Reduces whatever someone typed for an X account to the bare username, or null if it
 * isn't one. Accepts "name", "@name" and a pasted profile link; rejects everything else.
 */
export function parseXHandle(input: unknown): { ok: true; handle: string | null } | Bad {
  let v = clean(input);
  if (!v) return { ok: true, handle: null };
  const link = v.match(/^(?:https?:\/\/)?(?:www\.|mobile\.)?(?:x|twitter)\.com\/@?([^/?#\s]+)\/?(?:[?#].*)?$/i);
  if (link) v = link[1];
  v = v.replace(/^@/, '');
  if (!/^[A-Za-z0-9_]{1,15}$/.test(v)) return { ok: false, error: 'bad_x' };
  return { ok: true, handle: v };
}

export type PledgeKind = 'individual' | 'company';

/** An https address of at most 200 characters, null if blank, or false if it is anything else. */
export function httpsLink(v: unknown): string | null | false {
  const raw = clean(v);
  if (!raw) return null;
  if (raw.length > 200) return false;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  return u.protocol === 'https:' && u.hostname.includes('.') ? u.href : false;
}

/** Why a pledge waits for the organizer before it is listed. Empty means it is listed straight away. */
export type HoldReason = 'company' | 'amount' | 'x_account' | 'name';

/**
 * Validates a pledge. Amounts are whole dollars or dollars and cents; anything else is refused.
 *
 * A pledge is only listed straight away when nothing on it could pass for someone else: it is
 * from an individual, it is not over the hold amount, it carries no X account, and the name
 * shown is the pledger's own GitHub handle. A company name, an X account or any other display
 * name can be typed by anyone, so each of those waits for a person to check it.
 */
/** What the public list shows in place of a name when a pledger asks not to be named. */
export const ANONYMOUS_NAME = 'Anonymous';

/**
 * Validates a pledge. An email address is required so the organizer can reach the pledger
 * when the pool opens; it is never shown. An anonymous pledge shows no name, handle, X
 * account or website in public, so none of those is a reason to hold it.
 */
export function parsePledge(input: { amount?: unknown; displayName?: unknown; kind?: unknown; companyUrl?: unknown; xHandle?: unknown; email?: unknown; anonymous?: unknown; githubHandle: string }): Ok<{ amountCents: number; displayName: string; status: 'listed' | 'held'; holdReasons: HoldReason[]; kind: PledgeKind; companyUrl: string | null; xHandle: string | null; email: string; anonymous: boolean }> | Bad {
  const raw = clean(input.amount).replace(/^\$/, '').replace(/,/g, '');
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(raw)) return { ok: false, error: 'bad_amount' };
  const amountCents = Math.round(parseFloat(raw) * 100);
  if (amountCents < 100) return { ok: false, error: 'bad_amount' };
  const anonymous = input.anonymous === true || input.anonymous === 'on' || input.anonymous === 'true';
  const displayName = anonymous ? ANONYMOUS_NAME : clean(input.displayName);
  if (displayName.length < 1 || displayName.length > 60) return { ok: false, error: 'bad_name' };
  const email = parseEmail(input.email);
  if (!email) return { ok: false, error: 'need_email' };
  const kind: PledgeKind = input.kind === 'company' ? 'company' : 'individual';

  const link = kind === 'company' ? httpsLink(input.companyUrl) : null;
  if (link === false) return { ok: false, error: 'bad_site' };
  const x = parseXHandle(input.xHandle);
  if (!x.ok) return x;

  const sameName = displayName.replace(/^@/, '').toLowerCase() === input.githubHandle.toLowerCase();
  const holdReasons: HoldReason[] = [
    ...(kind === 'company' ? (['company'] as const) : []),
    ...(amountCents > site.pledgeHold.aboveUsd * 100 ? (['amount'] as const) : []),
    ...(x.handle && !anonymous ? (['x_account'] as const) : []),
    ...(sameName || anonymous ? [] : (['name'] as const)),
  ];
  return { ok: true, amountCents, displayName, status: holdReasons.length ? 'held' : 'listed', holdReasons, kind, companyUrl: link, xHandle: x.handle, email, anonymous };
}

export function slugify(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/** Validates a new idea. The list of existing projects is never taken from the form: the server looks it up itself. */
export function parseIdea(input: { title?: unknown; pitch?: unknown; missing?: unknown }): Ok<{ title: string; pitch: string; missing: string; slug: string }> | Bad {
  const title = clean(input.title);
  if (title.length < 3 || title.length > 80) return { ok: false, error: 'bad_title' };
  const slug = slugify(title);
  if (!slug) return { ok: false, error: 'bad_title' };
  const pitch = clean(input.pitch);
  if (pitch.length > 280) return { ok: false, error: 'bad_pitch' };
  const missing = clean(input.missing);
  if (missing.length > 600) return { ok: false, error: 'bad_missing' };
  return { ok: true, title, pitch, missing, slug };
}

export type Writeup = { problem: string; build: string; strong: string; sourceUrl: string | null; search: string };

/** Keeps paragraph breaks but trims each line and collapses runs of blank lines. */
const prose = (v: unknown) =>
  typeof v === 'string'
    ? v.replace(/\r/g, '').split('\n').map((l) => l.trim().replace(/[ \t]+/g, ' ')).join('\n').replace(/\n{3,}/g, '\n\n').trim()
    : '';

/**
 * Validates the longer write-up the organizer can give a platform idea: the problem, what to
 * build, and what a strong entry does. Any claim about another product should carry a source
 * link, which must be https. `search` is the phrase to search GitHub with, when the idea's
 * name alone would not find the existing projects.
 */
export function parseWriteup(input: { problem?: unknown; build?: unknown; strong?: unknown; sourceUrl?: unknown; search?: unknown }): Ok<Writeup> | Bad {
  const problem = prose(input.problem), build = prose(input.build), strong = prose(input.strong);
  if (problem.length > 1200 || build.length > 1200 || strong.length > 1200) return { ok: false, error: 'bad_writeup' };
  const link = httpsLink(input.sourceUrl);
  if (link === false) return { ok: false, error: 'bad_site' };
  const search = clean(input.search);
  if (search.length > 120) return { ok: false, error: 'bad_writeup' };
  return { ok: true, problem, build, strong, sourceUrl: link, search };
}

/** Validates the optional profile fields on the join form. Both are shown publicly, so the site link must be https and short. */
export function parseProfile(input: { xHandle?: unknown; siteUrl?: unknown }): Ok<{ xHandle: string | null; siteUrl: string | null }> | Bad {
  const x = parseXHandle(input.xHandle);
  if (!x.ok) return x;
  const link = httpsLink(input.siteUrl);
  if (link === false) return { ok: false, error: 'bad_site' };
  return { ok: true, xHandle: x.handle, siteUrl: link };
}

export type SponsorInput = {
  name: string;
  url: string | null;
  logoUrl: string | null;
  amountCents: number;
  kind: 'pool' | 'bounty';
  status: 'pledged' | 'paid';
  note: string;
  listed: boolean;
};

/** Validates a sponsor entered by the organizer. Links and logos must be https. */
export function parseSponsor(input: {
  name?: unknown; url?: unknown; logoUrl?: unknown; amount?: unknown;
  kind?: unknown; status?: unknown; note?: unknown; listed?: unknown;
}): Ok<{ sponsor: SponsorInput }> | Bad {
  const bad = { ok: false, error: 'bad_sponsor' } as const;
  const name = clean(input.name);
  if (name.length < 1 || name.length > 80) return bad;
  const url = httpsLink(input.url);
  const logoUrl = httpsLink(input.logoUrl);
  if (url === false || logoUrl === false) return bad;
  const raw = clean(input.amount).replace(/^\$/, '').replace(/,/g, '');
  if (!/^\d{1,8}(\.\d{1,2})?$/.test(raw)) return bad;
  const amountCents = Math.round(parseFloat(raw) * 100);
  if (amountCents < 100) return bad;
  const kind = input.kind === 'bounty' ? 'bounty' : input.kind === 'pool' ? 'pool' : null;
  const status = input.status === 'paid' ? 'paid' : input.status === 'pledged' ? 'pledged' : null;
  if (!kind || !status) return bad;
  const note = clean(input.note);
  if (note.length > 200) return bad;
  return { ok: true, sponsor: { name, url, logoUrl, amountCents, kind, status, note, listed: input.listed === 'on' || input.listed === true } };
}
