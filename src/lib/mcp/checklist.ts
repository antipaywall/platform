// The Open Source Ready checklist as the MCP hands it to an agent: the steps, who each is for, and
// which ones the skill checks by itself. The words come from the guide's own data, so the two
// can't drift apart. The checks run in the skill, on the person's machine; the server only lists them.

import { NEED_LABEL, PARTS, REPO_URL, type Need } from '../../data/open-source-ready';

export const OSR_GUIDE_PATH = '/open-source-ready';
const NEEDS = Object.keys(NEED_LABEL) as Need[];

export function osrChecklist(only: string | null) {
  const need = NEEDS.includes(only as Need) ? (only as Need) : null;
  // "Every project" steps always apply; a narrower choice adds its own.
  const parts = PARTS.map((part) => ({
    part: part.title,
    steps: part.steps
      .filter((s) => !need || s.need === 'all' || s.need === need)
      .map((s) => ({ step: s.title, why: s.why, how: s.how, for: NEED_LABEL[s.need], checked_by_the_skill: Boolean(s.checked) })),
  })).filter((p) => p.steps.length);
  return {
    what: 'Everything to prepare before a project goes public, and in its first month.',
    parts,
    steps: parts.reduce((n, p) => n + p.steps.length, 0),
    skill: REPO_URL,
    note: 'The skill runs the checks marked checked_by_the_skill against the code on the person\'s own machine. Antipaywall never sees their project.',
  };
}
