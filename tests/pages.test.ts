import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function files(dir: string, ext: RegExp): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path, ext) : ext.test(path) ? [path] : [];
  });
}

const astro = files('src', /\.astro$/);
// Everything whose words can reach a visitor: pages, components, the shared wording, form
// messages, emails, and the small script served with the home page.
const served = [...astro, 'src/config/site.ts', 'src/lib/respond.ts', 'src/lib/email.ts', 'src/lib/ways.ts', ...files('public', /\.(js|txt|webmanifest)$/)];

describe('what is served to visitors', () => {
  it('has no HTML comments, which would be sent to every browser', () => {
    const found = astro.filter((f) => readFileSync(f, 'utf8').includes('<!--'));
    expect(found).toEqual([]);
  });
  it('never calls itself a draft', () => {
    const found = served.filter((f) => /draft/i.test(readFileSync(f, 'utf8')));
    expect(found).toEqual([]);
  });
  it('has no filler wording', () => {
    const filler = /coming soon|lorem ipsum|\bTBD\b|\bTBA\b|to be announced|under construction|work in progress|placeholder text/i;
    const found = served.filter((f) => filler.test(readFileSync(f, 'utf8')));
    expect(found).toEqual([]);
  });
  it('makes one statement about who holds the pool, and never says it "will be named"', () => {
    const found = served.filter((f) => /will be named|is named here before|to be named/i.test(readFileSync(f, 'utf8')));
    expect(found).toEqual([]);
  });
  it('never talks about donating (web addresses aside)', () => {
    const found = served.filter((f) => /\bdonat|\bdonor/i.test(readFileSync(f, 'utf8').replace(/https?:\/\/\S+/g, '')));
    expect(found).toEqual([]);
  });
  it('signs in with GitHub or GitLab only: no email sign-in', () => {
    const found = ['src/pages/auth/email.astro', 'src/pages/api/auth/email.ts', 'src/lib/emailSignIn.ts', 'src/pages/api/account/backer.ts'].filter((f) => existsSync(f));
    expect(found).toEqual([]);
    expect(served.filter((f) => /sign in with your email|auth\/email/i.test(readFileSync(f, 'utf8')))).toEqual([]);
  });
  it('does not claim the checks keep fake accounts out', () => {
    const found = served.filter((f) => /keep (fake|throwaway) accounts out/i.test(readFileSync(f, 'utf8')));
    expect(found).toEqual([]);
  });
});
