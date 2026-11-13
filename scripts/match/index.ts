// pnpm match: improve the catalog with Claude, on your own key. Nothing here touches the live
// site or costs Antipaywall anything. It reads the public open data, asks Claude, checks what
// comes back, and writes changes to files in catalog/ for you to open as a pull request.
//
//   ANTHROPIC_API_KEY=… pnpm match                 (or an `ant auth login` profile)
//   pnpm match --bundle                            no key: writes match-bundle.md to paste into Claude Code
//   pnpm match --base https://<preview-url>        read a preview's open data instead of the live site
//   pnpm match --only merges | --only words
//
// Jobs: (1) gaps that are the same wish, written to catalog/merges.yml; (2) more plain words for
// each paid product, written to catalog/products/<slug>.yml.

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { parse, stringify } from 'yaml';
import { loadCatalog } from '../../src/lib/catalog';
import { acceptMerges, mergeWords, type Proposal } from '../../src/lib/matchProposals';

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const BASE = flag('--base') ?? 'https://www.antipaywall.org';
const ONLY = flag('--only');
const MODEL = flag('--model') ?? 'claude-opus-5-5';
const BUNDLE = args.includes('--bundle');
const here = (f: string) => readFileSync(join('scripts', 'match', 'prompts', f), 'utf8');

async function open(file: string): Promise<any[]> {
  const res = await fetch(`${BASE}/open-data/${file}.json`);
  if (!res.ok) throw new Error(`Could not read ${BASE}/open-data/${file}.json (${res.status})`);
  return ((await res.json()) as { items: any[] }).items;
}

const MERGE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['merges'],
  properties: {
    merges: {
      type: 'array',
      items: { type: 'object', additionalProperties: false, required: ['from', 'into', 'reason'], properties: { from: { type: 'string' }, into: { type: 'string' }, reason: { type: 'string' } } },
    },
  },
};
const WORDS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['products'],
  properties: {
    products: {
      type: 'array',
      items: { type: 'object', additionalProperties: false, required: ['slug', 'words'], properties: { slug: { type: 'string' }, words: { type: 'array', items: { type: 'string' } } } },
    },
  },
};

async function ask(client: Anthropic, prompt: string, data: unknown, schema: Record<string, unknown>): Promise<any> {
  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 32000,
    output_config: { effort: 'high', format: { type: 'json_schema', schema } },
    messages: [{ role: 'user', content: `${prompt}\n\n<data>\n${JSON.stringify(data)}\n</data>` }],
  });
  const message = await stream.finalMessage();
  if (message.stop_reason === 'refusal') throw new Error('Claude declined this request.');
  const text = message.content.find((b) => b.type === 'text');
  if (!text || text.type !== 'text') throw new Error('No answer came back.');
  return JSON.parse(text.text);
}

async function main() {
  const catalog = loadCatalog();
  const [gaps, products, merges] = await Promise.all([open('gaps'), open('products'), open('merges')]);
  const openGaps = gaps.filter((g) => !g.merged_into_slug).map((g) => ({ slug: g.slug, title: g.title, pitch: g.pitch, missing: g.missing, want: g.want }));
  const productData = products.map((p) => ({ slug: p.slug, name: p.name, blurb: p.blurb, words: p.words }));

  if (BUNDLE) {
    const parts = [
      '# pnpm match bundle',
      'Paste this into Claude Code in this repository. Ask it to follow both prompts and write the results to catalog/merges.yml and catalog/products/<slug>.yml, keeping existing entries, then open a pull request.',
      '## Merges', here('merges.md'), '```json', JSON.stringify(openGaps, null, 1), '```',
      '## Words', here('words.md'), '```json', JSON.stringify(productData, null, 1), '```',
    ];
    writeFileSync('match-bundle.md', parts.join('\n\n') + '\n');
    console.log('Wrote match-bundle.md');
    return;
  }

  const client = new Anthropic();
  if (ONLY !== 'words') {
    const answer = (await ask(client, here('merges.md'), openGaps, MERGE_SCHEMA)) as { merges: Proposal[] };
    const blocked = new Set(merges.filter((m) => m.undone_at).map((m) => [m.from, m.into].sort().join('|')));
    const accepted = acceptMerges(answer.merges, {
      gaps: openGaps.map((g) => g.slug),
      merged: new Set(gaps.filter((g) => g.merged_into_slug).map((g) => g.slug)),
      blocked,
      existing: catalog.merges,
    });
    if (accepted.length) {
      const file = 'catalog/merges.yml';
      const header = readFileSync(file, 'utf8').split('\n').filter((l) => l.startsWith('#')).join('\n');
      writeFileSync(file, `${header}\n${stringify([...catalog.merges, ...accepted], { lineWidth: 120 })}`);
    }
    console.log(`Merges proposed: ${answer.merges.length}, kept: ${accepted.length}`);
  }
  if (ONLY !== 'merges') {
    const answer = (await ask(client, here('words.md'), productData, WORDS_SCHEMA)) as { products: { slug: string; words: string[] }[] };
    let changed = 0;
    for (const s of answer.products) {
      const path = `catalog/products/${s.slug}.yml`;
      const product = catalog.products.find((p) => p.slug === s.slug);
      if (!product) continue;
      const words = mergeWords(product.words, s.words.slice(0, 12));
      if (words.length === product.words.length) continue;
      const text = readFileSync(path, 'utf8');
      const header = text.split('\n').filter((l) => l.startsWith('#')).join('\n');
      const doc = parse(text) as Record<string, unknown>;
      writeFileSync(path, `${header ? header + '\n' : ''}${stringify({ ...doc, words }, { lineWidth: 120 })}`);
      changed++;
    }
    console.log(`Products with new words: ${changed}`);
  }
  console.log('Check the changes with `git diff`, run `pnpm test`, and open a pull request.');
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
