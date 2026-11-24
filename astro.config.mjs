// @ts-check
import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { HACKATHON_REDIRECTS } from './src/config/routes.ts';

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
  // The hackathon's pages moved under /hackathon. Every old address redirects permanently.
  redirects: Object.fromEntries(Object.entries(HACKATHON_REDIRECTS).map(([from, to]) => [from, { status: 301, destination: to }])),
  devToolbar: { enabled: false },
  // The share-card renderer runs as it ships rather than being bundled; its WebAssembly is
  // inlined into src/lib/ogCard.ts.
  vite: { ssr: { external: ['satori', '@resvg/resvg-wasm'] }, plugins: [resvgWasm()] },
  // 4321 is Astro's default and is often taken by another project on this machine.
  server: { port: 4610, host: '127.0.0.1' },
});

/**
 * `virtual:resvg-wasm`: resvg's WebAssembly as base64, read once at build time, so the share-card
 * code carries it and the server never has to find the file on disk.
 */
function resvgWasm() {
  const id = 'virtual:resvg-wasm';
  return {
    name: 'resvg-wasm',
    resolveId: (/** @type {string} */ s) => (s === id ? '\0' + id : null),
    load(/** @type {string} */ s) {
      if (s !== '\0' + id) return null;
      const file = createRequire(import.meta.url).resolve('@resvg/resvg-wasm/index_bg.wasm');
      return `export default ${JSON.stringify(readFileSync(file).toString('base64'))};`;
    },
  };
}
