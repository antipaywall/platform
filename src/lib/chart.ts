// The star-history chart a maintainer can put in their README. A plain SVG with fixed colours,
// because an image in a README can't read our stylesheet. Painted like the brand's bricks.

import { shortCount } from './format';

export const PAINTS = {
  tomato: { fill: '#f2785c', edge: '#c9513a' },
  marigold: { fill: '#f6c84e', edge: '#c99a24' },
  mint: { fill: '#86dcb9', edge: '#4fae8b' },
  sky: { fill: '#8fc6ee', edge: '#5b97c4' },
  lilac: { fill: '#c0a9f0', edge: '#8f74c8' },
  pink: { fill: '#f4a5c6', edge: '#c8719a' },
} as const;
export type Paint = keyof typeof PAINTS;

const INK = '#261b33';
const INK_2 = '#6b5d78';
const MILK = '#f8f4fa';
const LINE = '#e6dfeb';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export function parseChartParams(url: URL): { paint: Paint; width: number } {
  const p = url.searchParams.get('paint') ?? '';
  const w = Number(url.searchParams.get('w'));
  return { paint: (p in PAINTS ? p : 'tomato') as Paint, width: Number.isFinite(w) && w > 0 ? clamp(Math.round(w), 320, 1200) : 640 };
}

const month = (d: string) => {
  const t = new Date(`${d}T00:00:00Z`);
  return Number.isNaN(t.getTime()) ? d : t.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
};

/** Star growth over time. Points are [YYYY-MM-DD, stars], oldest first. */
export function starChartSvg(points: [string, number][], opts: { paint: Paint; width: number; title: string }): string {
  const W = clamp(Math.round(opts.width), 320, 1200);
  const H = Math.round(W * 0.42);
  const paint = PAINTS[opts.paint] ?? PAINTS.tomato;
  const pad = { l: Math.round(W * 0.05), r: Math.round(W * 0.05), t: Math.round(H * 0.24), b: Math.round(H * 0.16) };
  const valid = points.filter(([d, n]) => !Number.isNaN(Date.parse(d)) && Number.isFinite(n)).sort((a, b) => Date.parse(a[0]) - Date.parse(b[0]));
  const series = valid.length ? valid : [[new Date().toISOString().slice(0, 10), 0] as [string, number]];
  const t0 = Date.parse(series[0][0]);
  const t1 = Date.parse(series[series.length - 1][0]);
  const span = Math.max(t1 - t0, 1);
  const top = Math.max(...series.map(([, n]) => n), 1);
  const x = (d: string) => (series.length === 1 ? pad.l : pad.l + ((Date.parse(d) - t0) / span) * (W - pad.l - pad.r));
  const y = (n: number) => H - pad.b - (n / top) * (H - pad.t - pad.b);
  const pts = series.length === 1 ? [[pad.l, y(series[0][1])], [W - pad.r, y(series[0][1])]] : series.map(([d, n]) => [x(d), y(n)]);
  const line = pts.map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(1)},${py.toFixed(1)}`).join(' ');
  const area = `${line} L${pts[pts.length - 1][0].toFixed(1)},${H - pad.b} L${pts[0][0].toFixed(1)},${H - pad.b} Z`;
  const last = series[series.length - 1][1];
  const fs = Math.round(W / 34);
  const title = esc(opts.title);
  const label = `${shortCount(last)} stars`;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${title}: ${esc(label)}">`,
    `<title>${title}: ${esc(label)}</title>`,
    `<rect width="${W}" height="${H}" rx="${Math.round(W / 40)}" fill="${MILK}"/>`,
    `<line x1="${pad.l}" y1="${H - pad.b}" x2="${W - pad.r}" y2="${H - pad.b}" stroke="${LINE}" stroke-width="2"/>`,
    `<path d="${area}" fill="${paint.fill}"/>`,
    `<path d="${line}" fill="none" stroke="${paint.edge}" stroke-width="${Math.max(2, W / 260).toFixed(1)}" stroke-linejoin="round" stroke-linecap="round"/>`,
    `<text x="${pad.l}" y="${Math.round(pad.t * 0.48)}" font-family="system-ui, -apple-system, Segoe UI, sans-serif" font-size="${Math.round(fs * 1.2)}" font-weight="800" fill="${INK}">${title}</text>`,
    `<text x="${pad.l}" y="${Math.round(pad.t * 0.8)}" font-family="system-ui, -apple-system, Segoe UI, sans-serif" font-size="${fs}" font-weight="700" fill="${INK_2}">${esc(label)}</text>`,
    `<text x="${pad.l}" y="${H - Math.round(pad.b * 0.35)}" font-family="system-ui, -apple-system, Segoe UI, sans-serif" font-size="${Math.round(fs * 0.85)}" fill="${INK_2}">${esc(month(series[0][0]))}</text>`,
    `<text x="${W - pad.r}" y="${H - Math.round(pad.b * 0.35)}" text-anchor="end" font-family="system-ui, -apple-system, Segoe UI, sans-serif" font-size="${Math.round(fs * 0.85)}" fill="${INK_2}">antipaywall.org</text>`,
    `</svg>`,
  ].join('');
}
