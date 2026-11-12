// A readable name for where a visit came from. The database does the grouping
// (`source_alias` and `source_key` in supabase/migrations/0013_attribution.sql); this is the
// same table, used to name each group on the organizer's page. A test keeps the two in step.

export type SourceGroup = { key: string; name: string; tags: string[]; hosts: string[] };

/** Well-known places, each with the link tags and the referring hosts that mean it. */
export const SOURCES: SourceGroup[] = [
  { key: 'x', name: 'X', tags: ['x', 'twitter'], hosts: ['x.com', 'twitter.com', 't.co', 'mobile.twitter.com', 'mobile.x.com'] },
  { key: 'reddit', name: 'Reddit', tags: ['reddit'], hosts: ['reddit.com', 'old.reddit.com', 'new.reddit.com', 'out.reddit.com', 'redd.it'] },
  { key: 'hackernews', name: 'Hacker News', tags: ['hn', 'hackernews', 'ycombinator'], hosts: ['news.ycombinator.com', 'hckrnews.com'] },
  { key: 'github', name: 'GitHub', tags: ['github', 'gh'], hosts: ['github.com', 'gist.github.com'] },
  { key: 'linkedin', name: 'LinkedIn', tags: ['linkedin', 'li'], hosts: ['linkedin.com', 'lnkd.in'] },
  { key: 'tiktok', name: 'TikTok', tags: ['tiktok', 'tt'], hosts: ['tiktok.com'] },
  { key: 'youtube', name: 'YouTube', tags: ['youtube', 'yt'], hosts: ['youtube.com', 'm.youtube.com', 'youtu.be'] },
  { key: 'facebook', name: 'Facebook', tags: ['facebook', 'fb'], hosts: ['facebook.com', 'm.facebook.com', 'l.facebook.com', 'lm.facebook.com'] },
  { key: 'instagram', name: 'Instagram', tags: ['instagram', 'ig'], hosts: ['instagram.com', 'l.instagram.com'] },
  { key: 'threads', name: 'Threads', tags: ['threads'], hosts: ['threads.net', 'threads.com'] },
  { key: 'bluesky', name: 'Bluesky', tags: ['bluesky', 'bsky'], hosts: ['bsky.app', 'go.bsky.app'] },
  { key: 'discord', name: 'Discord', tags: ['discord'], hosts: ['discord.com', 'discordapp.com'] },
  { key: 'telegram', name: 'Telegram', tags: ['telegram'], hosts: ['t.me', 'web.telegram.org'] },
  { key: 'producthunt', name: 'Product Hunt', tags: ['producthunt', 'ph'], hosts: ['producthunt.com'] },
  { key: 'email', name: 'Email', tags: ['email', 'newsletter', 'mail'], hosts: ['mail.google.com', 'outlook.live.com', 'outlook.office.com'] },
  { key: 'ai', name: 'AI assistants', tags: [], hosts: ['chatgpt.com', 'chat.openai.com', 'perplexity.ai', 'claude.ai', 'gemini.google.com', 'copilot.microsoft.com'] },
  {
    key: 'search', name: 'Search', tags: ['google', 'bing', 'duckduckgo', 'search'],
    hosts: ['bing.com', 'duckduckgo.com', 'search.brave.com', 'yahoo.com', 'search.yahoo.com', 'ecosia.org', 'kagi.com', 'startpage.com', 'baidu.com', 'yandex.com', 'yandex.ru'],
  },
];

const GOOGLE = /^google\.[a-z.]{2,6}$/;

function alias(value: string | null): string | null {
  if (!value) return null;
  for (const s of SOURCES) if (s.tags.includes(value) || s.hosts.includes(value)) return s.key;
  return GOOGLE.test(value) ? 'search' : null;
}

/**
 * The group a visit belongs to. A tag on the link wins over the referring site, because most
 * apps hide the referrer; anything not in the table is kept as it arrived; nothing at all is "direct".
 */
export function sourceKey(tag: string | null | undefined, host: string | null | undefined): string {
  const t = (tag ?? '').toLowerCase() || null;
  const h = (host ?? '').toLowerCase() || null;
  return alias(t) ?? t ?? alias(h) ?? h ?? 'direct';
}

/** What to call a group on the page. */
export function sourceName(key: string): string {
  if (key === 'direct') return 'Direct or unknown';
  return SOURCES.find((s) => s.key === key)?.name ?? key;
}

/** Links to paste into posts, one per place, so each shows up under its own name. */
export function taggedLinks(siteUrl: string): { where: string; link: string }[] {
  const base = siteUrl.replace(/\/+$/, '');
  return [['X', 'x'], ['Reddit', 'reddit'], ['Hacker News', 'hn'], ['TikTok', 'tiktok'], ['LinkedIn', 'linkedin'], ['Email', 'email']]
    .map(([where, tag]) => ({ where, link: `${base}/?ref=${tag}` }));
}
