// Share cards made for one page: "11 free, open-source alternatives to Notion" with the projects
// as bricks, in the site's own colors. Drawn on request and cached at the edge for a day.

import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { shortCount } from './format';

const C = { milk: '#f6f3f9', ink: '#2a1d33', ink2: '#6b5d74', tomato: '#f2725a', card: '#ffffff' };
const BRICKS = ['#f4c95d', '#8fe0bf', '#c4a8f0', '#f6a8c8', '#f2725a', '#ffffff'];

type El = { type: string; props: Record<string, unknown> };
const h = (type: string, style: Record<string, unknown>, ...children: (El | string | null | false)[]): El => ({
  type,
  props: { style: { display: 'flex', ...style }, children: children.filter((c) => c !== null && c !== false) },
});

// The site's display fonts, fetched once per server instance. Without them the card still draws
// in the library's own font.
const FONT_CSS = 'https://api.fontshare.com/v2/css?f[]=cabinet-grotesk@800&f[]=satoshi@700&display=swap';
let fonts: Promise<{ name: string; data: ArrayBuffer; weight: 700 | 800; style: 'normal' }[]> | null = null;
function loadFonts() {
  fonts ??= (async () => {
    const css = await fetch(FONT_CSS, { signal: AbortSignal.timeout(3000) }).then((r) => r.text());
    const faces = [...css.matchAll(/font-family:\s*'([^']+)'[\s\S]*?url\('([^']+\.ttf)'\)/g)];
    const out = await Promise.all(
      faces.map(async ([, family, src]) => {
        const data = await fetch(src.startsWith('//') ? `https:${src}` : src, { signal: AbortSignal.timeout(3000) }).then((r) => r.arrayBuffer());
        const name = /cabinet/i.test(family) ? 'Cabinet' : 'Satoshi';
        return { name, data, weight: (name === 'Cabinet' ? 800 : 700) as 700 | 800, style: 'normal' as const };
      }),
    );
    if (!out.length) throw new Error('no fonts');
    return out;
  })().catch(() => {
    fonts = null;
    return [];
  });
  return fonts;
}

export type CardInput = {
  /** The big line. */
  headline: string;
  /** One or two plain sentences under it. */
  sub: string;
  /** Names drawn as bricks down the right side, with a small count each. */
  bricks: { label: string; note?: string }[];
};

function card(input: CardInput, logo: string): El {
  const size = input.headline.length > 60 ? 60 : input.headline.length > 40 ? 70 : 82;
  const bricks = input.bricks.slice(0, 7);
  return h(
    'div',
    { width: '100%', height: '100%', background: C.milk, color: C.ink, fontFamily: 'Satoshi', position: 'relative' },
    h(
      'div',
      { flexDirection: 'column', justifyContent: 'space-between', padding: '64px 0 64px 76px', width: bricks.length ? 720 : 1100 },
      h(
        'div',
        { alignItems: 'center', gap: 16 },
        { type: 'img', props: { src: logo, width: 56, height: 56, style: { borderRadius: 12 } } },
        h('div', { fontFamily: 'Cabinet', fontSize: 40, color: C.ink }, 'antipaywall'),
      ),
      h('div', { fontFamily: 'Cabinet', fontSize: size, lineHeight: 1.02, letterSpacing: -1.5 }, input.headline),
      h('div', { fontSize: 30, color: C.ink2, lineHeight: 1.3 }, input.sub),
    ),
    bricks.length
      ? h(
          'div',
          { position: 'absolute', right: -20, top: 0, bottom: 0, width: 400, flexDirection: 'column', justifyContent: 'center', gap: 14 },
          ...bricks.map((b, i) =>
            h(
              'div',
              {
                marginLeft: i % 2 ? 0 : 60,
                padding: '16px 22px',
                borderRadius: 14,
                background: BRICKS[i % BRICKS.length],
                boxShadow: `0 5px 0 ${C.ink}`,
                border: `2px solid ${C.ink}`,
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: 26,
              },
              h('div', { fontWeight: 700, maxWidth: 250, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }, b.label),
              b.note ? h('div', { fontSize: 20, color: C.ink, opacity: 0.7 }, b.note) : null,
            ),
          ),
        )
      : null,
  );
}

// The renderer: satori lays the card out as SVG, resvg turns it into a PNG. Both are loaded once,
// on the first card, so pages that never draw one don't pay for them.
type Renderer = { toSvg: (el: unknown, o: Record<string, unknown>) => Promise<string>; toPng: (svg: string) => Uint8Array };
let renderer: Promise<Renderer> | null = null;
function loadRenderer(): Promise<Renderer> {
  renderer ??= (async () => {
    const require = createRequire(import.meta.url);
    const sm: any = await import('satori');
    const satori = typeof sm.default === 'function' ? sm.default : (sm.default?.default ?? sm.satori);
    const rm: any = await import('@resvg/resvg-wasm');
    const resvg = rm.initWasm ? rm : rm.default;
    await resvg.initWasm(await readFile(require.resolve('@resvg/resvg-wasm/index_bg.wasm')));
    return {
      toSvg: (el: unknown, o: Record<string, unknown>) => satori(el, o),
      toPng: (svg: string) => new resvg.Resvg(svg, { fitTo: { mode: 'width', value: 1200 } }).render().asPng(),
    };
  })().catch((e) => {
    renderer = null;
    throw e;
  });
  return renderer;
}

// The library's fallback when the site's fonts can't be fetched: satori needs at least one.
const FALLBACK_FONT = 'https://cdn.jsdelivr.net/npm/@fontsource/inter@5.1.0/files/inter-latin-700-normal.woff';
let fallback: Promise<ArrayBuffer> | null = null;

/** The card as a PNG response, cached at the edge for a day. */
export async function cardResponse(input: CardInput, origin: string): Promise<Response> {
  const [r, loaded] = await Promise.all([loadRenderer(), loadFonts()]);
  let fontList: { name: string; data: ArrayBuffer; weight: number; style: 'normal' }[] = loaded;
  if (!fontList.length) {
    fallback ??= fetch(FALLBACK_FONT, { signal: AbortSignal.timeout(3000) }).then((x) => x.arrayBuffer());
    const data = await fallback;
    fontList = [{ name: 'Cabinet', data, weight: 800, style: 'normal' }, { name: 'Satoshi', data, weight: 700, style: 'normal' }];
  }
  const svg = await r.toSvg(card(input, `${origin}/icon-192.png`), { width: 1200, height: 630, fonts: fontList });
  // Copied out of WebAssembly memory, which the next render reuses.
  const png = Buffer.from(r.toPng(svg));
  return new Response(png as BodyInit, {
    headers: { 'content-type': 'image/png', 'cache-control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800' },
  });
}

export const starsNote = (n: number) => `${shortCount(n)} stars`;
