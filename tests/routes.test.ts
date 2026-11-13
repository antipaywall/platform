import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { HACKATHON_REDIRECTS } from '../src/config/routes';

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : /\.(astro|ts)$/.test(path) ? [path] : [];
  });
}

describe('the hackathon section', () => {
  it('has a page for every new address', () => {
    for (const to of new Set(Object.values(HACKATHON_REDIRECTS))) {
      const base = `src/pages${to}`;
      expect(existsSync(`${base}.astro`) || existsSync(`${base}/index.astro`), to).toBe(true);
    }
  });
  it('no longer keeps pages at the old addresses', () => {
    for (const from of Object.keys(HACKATHON_REDIRECTS)) {
      expect(existsSync(`src/pages${from}.astro`) || existsSync(`src/pages${from}/index.astro`), from).toBe(false);
    }
  });
  it('never links to an old address itself', () => {
    const old = Object.keys(HACKATHON_REDIRECTS).map((p) => p.replace(/\//g, '\\/')).join('|');
    const re = new RegExp(`["'\`](${old})(?=["'\`#?])`);
    const found = files('src').filter((f) => f !== join('src', 'config', 'routes.ts') && re.test(readFileSync(f, 'utf8')));
    expect(found).toEqual([]);
  });
  it('redirects every old address from astro.config', () => {
    expect(readFileSync('astro.config.mjs', 'utf8')).toContain('HACKATHON_REDIRECTS');
  });
});
