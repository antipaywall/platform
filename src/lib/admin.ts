// Who the organizer is. Kept free of any database code so it can be tested on its own.

/**
 * GitHub user ids from the `ADMIN_GITHUB_IDS` setting: whole numbers separated by commas.
 * Anything that is not a plain positive whole number is dropped, so a typo can never
 * widen access. An empty or missing setting means nobody is an organizer.
 */
export function parseAdminIds(raw: unknown): number[] {
  return String(raw ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => /^[1-9]\d{0,14}$/.test(s))
    .map(Number);
}

/** True only for a signed-in person whose GitHub id is on the list. A GitLab account has no GitHub id, so it never is. */
export function isAdminIn(ids: readonly number[], person: { github_id: number | string | null } | null | undefined): boolean {
  if (!person || person.github_id === null || person.github_id === undefined) return false;
  const id = Number(person.github_id);
  return Number.isSafeInteger(id) && id > 0 && ids.includes(id);
}

/** The organizer's pages and the routes behind them. */
export const isAdminPath = (pathname: string) => /^\/(?:api\/)?admin(?:[/.]|$)/.test(pathname);

/** Sent with every organizer page and route: never cached anywhere shared, never indexed. */
export const ADMIN_HEADERS = { 'cache-control': 'private, no-store', 'x-robots-tag': 'noindex, nofollow' } as const;
