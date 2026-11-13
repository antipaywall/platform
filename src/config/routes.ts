// Where the hackathon's pages used to live, and where they live now. Used by astro.config.mjs for
// permanent redirects, so links people already shared keep working, and by a test that keeps the
// site's own links on the new addresses.
export const HACKATHON_REDIRECTS: Record<string, string> = {
  '/rules': '/hackathon/rules',
  '/about': '/hackathon/about',
  '/faq': '/hackathon/faq',
  '/pool': '/hackathon/pool',
  '/fund': '/hackathon/fund',
  '/sponsor': '/hackathon/sponsor',
  '/join': '/hackathon/join',
  '/join/build': '/hackathon/join/build',
  '/join/panel': '/hackathon/join/panel',
  '/join/organize': '/hackathon/join/organize',
  // Older addresses that already redirected.
  '/help': '/hackathon/join',
  '/join/judge': '/hackathon/join/panel',
};
