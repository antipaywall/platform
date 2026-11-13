import { describe, expect, it } from 'vitest';
import { mergeHappening, type Happening } from '../src/lib/happening';

const at = (h: number) => new Date(Date.UTC(2026, 10, 13, h)).toISOString();
const e = (kind: Happening['kind'], h: number, key = `${kind}${h}`): Happening => ({ kind, at: at(h), key, text: kind, href: '/' });

describe('mergeHappening', () => {
  it('puts everything in one list, newest first, up to the limit', () => {
    const out = mergeHappening([[e('idea', 1), e('idea', 5)], [e('backed', 3)], [e('pushed', 4)]], 3);
    expect(out.map((x) => x.at)).toEqual([at(5), at(4), at(3)]);
  });
  it('keeps one GitHub push per project so busy repos do not drown the rest', () => {
    const out = mergeHappening([[e('pushed', 5, 'repo-a'), e('pushed', 4, 'repo-a'), e('pushed', 3, 'repo-b')]], 10);
    expect(out.map((x) => x.key)).toEqual(['repo-a', 'repo-b']);
  });
  it('lets no one kind take more than half the list', () => {
    const many = Array.from({ length: 10 }, (_, i) => e('pushed', 20 - i, `r${i}`));
    const out = mergeHappening([many, [e('idea', 1)]], 6);
    expect(out.filter((x) => x.kind === 'pushed').length).toBeLessThanOrEqual(3);
    expect(out.some((x) => x.kind === 'idea')).toBe(true);
  });
});
