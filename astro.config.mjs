// @ts-check
import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';

// https://astro.build/config
export default defineConfig({
  site: 'https://www.antipaywall.org',
  output: 'server',
  adapter: vercel(),
  security: {
    // Cross-site writes are refused in src/middleware.ts, which checks every write (not only
    // form posts) and makes one exception by path for mail apps' unsubscribe button.
    checkOrigin: false,
    // A Content-Security-Policy on every page. Astro adds a hash for each of its own scripts,
    // so no inline script runs unless this build produced it; there is no 'unsafe-inline' for
    // scripts. Styles do allow inline, because pages and the hero wall set style attributes.
    csp: {
      directives: [
        "default-src 'self'",
        // Avatars (GitHub, unavatar.io) and sponsor logos come from other https hosts.
        "img-src 'self' data: https:",
        "font-src 'self' https://cdn.fontshare.com",
        "connect-src 'self'",
        "media-src 'self'",
        "form-action 'self'",
        "base-uri 'self'",
        "object-src 'none'",
      ],
      scriptDirective: { resources: ["'self'"] },
      styleDirective: { resources: ["'self'", "'unsafe-inline'", 'https://api.fontshare.com'] },
    },
  },
  // The old page of ways to help is now the join page, and the review panel's page used to
  // be called "judge".
  redirects: {
    '/help': { status: 301, destination: '/join' },
    '/join/judge': { status: 301, destination: '/join/panel' },
  },
  devToolbar: { enabled: false },
  // 4321 is Astro's default and is often taken by another project on this machine.
  server: { port: 4610, host: '127.0.0.1' },
});
