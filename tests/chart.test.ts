import { describe, expect, it } from 'vitest';
import { PAINTS, parseChartParams, starChartSvg } from '../src/lib/chart';

const points: [string, number][] = [['2024-01-01', 1], ['2026-11-12', 4800]];

describe('starChartSvg', () => {
  it('is an accessible SVG with the escaped title', () => {
    const svg = starChartSvg(points, { paint: 'tomato', width: 640, title: 'a <b>' });
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('role="img"');
    expect(svg).toContain('a &lt;b&gt;');
    expect(svg).not.toContain('<b>');
  });
  it('uses the paint as a fixed colour, since a README cannot read our CSS', () => {
    expect(starChartSvg(points, { paint: 'mint', width: 640, title: 'x' })).toContain(PAINTS.mint.fill);
  });
  it('keeps the width between 320 and 1200 and the height in proportion', () => {
    expect(starChartSvg(points, { paint: 'tomato', width: 5000, title: 'x' })).toContain('width="1200" height="504"');
    expect(starChartSvg(points, { paint: 'tomato', width: 10, title: 'x' })).toContain('width="320"');
  });
  it('draws a flat line when there is only today', () => {
    const svg = starChartSvg([['2026-11-12', 40]], { paint: 'sky', width: 640, title: 'x' });
    expect(svg).toContain('<path');
    expect(svg).not.toContain('NaN');
  });
  it('labels the latest star count', () => {
    expect(starChartSvg(points, { paint: 'tomato', width: 640, title: 'x' })).toContain('4.8k stars');
  });
});

describe('parseChartParams', () => {
  it('falls back to the defaults for anything unknown', () => {
    expect(parseChartParams(new URL('https://x/c?paint=blue&w=10'))).toEqual({ paint: 'tomato', width: 320 });
    expect(parseChartParams(new URL('https://x/c'))).toEqual({ paint: 'tomato', width: 640 });
  });
  it('accepts a known paint and a width', () => {
    expect(parseChartParams(new URL('https://x/c?paint=lilac&w=800'))).toEqual({ paint: 'lilac', width: 800 });
  });
});
