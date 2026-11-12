// Every request that changes something must come from one of our own pages.
// This replaces Astro's built-in check, which only looks at form-style posts, and it makes
// exactly one exception, by path, for mail apps pressing their own "unsubscribe" button.

/** The one route another origin may post to. It only ever unsubscribes the address its token belongs to. */
export const ONE_CLICK_PATH = '/api/list-unsubscribe';

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * True when this request may go ahead. Reads are always allowed. A write is allowed only
 * when the browser says it came from this same origin; a write with no Origin header, or
 * with any other origin, is refused.
 */
export function allowedRequest(input: { method: string; origin: string | null; self: string; path: string }): boolean {
  if (SAFE.has(input.method.toUpperCase())) return true;
  if (input.path === ONE_CLICK_PATH) return true;
  return input.origin !== null && input.origin === input.self;
}
