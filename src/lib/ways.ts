/** The five ways to get involved. One list, used by the homepage, the join page and the About page. */
export const WAYS = [
  {
    id: 'follow', label: 'Follow along', href: '/join#follow', paint: 'p5',
    blurb: 'Join the email list. You hear when something real happens: the dates, the pool opening, the results.',
    asks: 'An email address. No account.',
  },
  {
    id: 'build', label: 'Build', href: '/join/build', paint: 'p3',
    blurb: 'Create your builder account and hold your place. You count toward the 100 or more builders the dates are waiting on.',
    asks: 'A GitHub sign-in and two automatic checks.',
  },
  {
    id: 'panel', label: 'Review panel', href: '/join/panel', paint: 'p2',
    blurb: 'Sit on the review panel. It will check entries for cheating and nothing else. It never ranks anyone.',
    asks: 'A GitHub sign-in and a short application.',
  },
  {
    id: 'organize', label: 'Help organize', href: '/join/organize', paint: 'p4',
    blurb: 'Rules, outreach, moderation, and the things one person has not thought of.',
    asks: 'A GitHub sign-in and a note on what you can do.',
  },
  {
    id: 'sponsor', label: 'Sponsor', href: '/sponsor#inquiry', paint: 'p6',
    blurb: 'Put money into the pool, or put up a bounty for something specific.',
    asks: 'A short message. A person replies.',
  },
] as const;

export type WayId = (typeof WAYS)[number]['id'];
