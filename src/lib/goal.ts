// The numbers behind a progress bar with a goal, the way a crowdfunding page shows it: the bar
// fills toward the goal, and past it the bar keeps growing, with the goal marked where it was.

export type GoalBar = {
  /** Count as a share of the goal, rounded: 140 builders of 100 is 140. */
  percent: number;
  /** How much of the bar is the part up to the goal (0 to 100). */
  fill: number;
  /** Where the goal circle sits on the bar (0 to 100). */
  goalAt: number;
  /** How far past the goal, or 0. */
  over: number;
  reached: boolean;
};

export function goalBar(count: number, goal: number): GoalBar {
  const c = Math.max(0, Math.floor(count));
  const g = Math.max(1, Math.floor(goal));
  if (c < g) {
    // Below the goal the bar is the goal. A tiny count still shows a sliver.
    return { percent: Math.floor((c / g) * 100), fill: c === 0 ? 0 : Math.max(2, (c / g) * 100), goalAt: 100, over: 0, reached: false };
  }
  // At or past the goal the bar is the count, so the goal slides left as the overshoot grows.
  const goalAt = (g / c) * 100;
  return { percent: Math.round((c / g) * 100), fill: goalAt, goalAt, over: c - g, reached: true };
}
