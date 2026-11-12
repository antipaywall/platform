import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Astro drops the line break between a line of text and an inline tag on the next line,
// which glues the word to the link ("see it at<a>our site</a>"). Text that runs into an
// inline tag on the next line must end with {' '}.
const INLINE = /[\w.,;:!?)]\n[ \t]*<(a|strong|em|b|code|mark)\b/g;

function astroFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? astroFiles(path) : path.endsWith('.astro') ? [path] : [];
  });
}

describe('spacing before inline tags', () => {
  it('no text line runs straight into a link or bold text on the next line', () => {
    const problems: string[] = [];
    for (const file of astroFiles('src')) {
      const source = readFileSync(file, 'utf8');
      for (const m of source.matchAll(INLINE)) {
        const line = source.slice(0, m.index).split('\n').length;
        problems.push(`${file}:${line}`);
      }
    }
    expect(problems).toEqual([]);
  });
});
