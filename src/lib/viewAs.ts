// "View as": the organizer looking at the site the way another kind of account sees it. It only
// changes what is drawn. Every save, every permission check and every organizer route still goes
// by who is really signed in, so nothing can be done in this mode that couldn't be done without it.

export type ViewAs = 'member' | 'builder';
export const VIEW_COOKIE = 'apw_view_as';
export const VIEW_LABEL: Record<ViewAs, string> = { member: 'a regular member', builder: 'a builder' };

export const parseViewAs = (v: unknown): ViewAs | null => (v === 'member' || v === 'builder' ? v : null);

/** The signed-in person as the chosen kind of account would appear. With no view chosen, unchanged. */
export function seenAs<T extends { is_builder: boolean; verified: boolean }>(person: T, view: ViewAs | null | undefined): T {
  if (view === 'builder') return { ...person, is_builder: true, verified: true };
  if (view === 'member') return { ...person, is_builder: false };
  return person;
}
