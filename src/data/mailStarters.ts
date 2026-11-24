// Starting points for emails to the list. The organizer edits them on /admin/email before
// anything is sent; nothing here is ever sent as it stands.

import { shape, site } from '../config/site';

const o = site.origin;

export const MAIL_STARTERS = {
  platform: {
    label: 'Introducing the full platform (to builders)',
    audience: 'builders' as const,
    subject: `${site.name} is more than a hackathon now`,
    body: `Hi,

You joined ${site.name} as a builder, so you're one of the first people to see what it has grown into.

${site.name} started as a hackathon: build free, open-source versions of tools people pay for every month. While the builder count grows, I built the place those tools live all year round.

What's on the site now:

Find a free alternative. Search any paid tool and see the open-source projects that do the same job, ranked by how much people rely on them. Over 700 paid tools are in there.
${o}

The wall. Every paid tool where no solid free version exists yet. Those are the gaps worth building.
${o}/wall

Paste a website. If a tool you pay for isn't listed, paste its address and the site reads it and searches GitHub for projects that do the same thing.
${o}/find

Wanted. Ideas people have posted for tools they wish existed. Post your own, heart the ones you'd use.
${o}/ideas

Builders and the feed. A public profile with your work, and a feed where builders post updates, look for teammates and show what they shipped.
${o}/feed

For your coding agent. Antipaywall has an MCP server, so your agent can look up free alternatives, find gaps and pick up open issues.
${o}/agents

The plan for the hackathon:

${shape.summary}

${shape.when} Right now there are fewer than that, so the most useful thing you can do is bring in another builder or two. Send them here:
${o}/hackathon/join

Until the dates are set, look over the wall and the ideas, and start thinking about what you'd build. Every entry is a public repo, and you can team up through the feed.

If you have questions or ideas for the platform, reply to this email. It comes straight to me.

Ethan Rogers, organizer
${o}`,
  },
} as const;
export type StarterKey = keyof typeof MAIL_STARTERS;
