// Small pieces shared by every place an idea is shown.

/** The name shown for ideas the platform posted itself, which have no personal author. */
export const PLATFORM_AUTHOR = 'Antipaywall';

/** Who posted an idea, as shown to visitors: a GitHub or GitLab username, or the platform's own name. */
export function postedBy(idea: { author: string; byPlatform: boolean }): string {
  return idea.byPlatform ? PLATFORM_AUTHOR : `@${idea.author}`;
}
