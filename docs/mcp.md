# The Antipaywall MCP

What a coding agent can do on Antipaywall, and why it is shaped the way it is.

## What it is for

An agent connected to Antipaywall should be able to do, from inside an editor, the four things the
site exists for:

1. **Find the free version.** Before someone pays for a tool, check whether an open-source one exists.
2. **Say what you pay for.** The tools people pay for today are the site's best picture of what is
   worth replacing.
3. **Say what is missing.** If nothing solid exists, post it, or back the idea someone already posted.
4. **Help build.** Find an issue to contribute to, and get a project ready to open-source.

## Rules it follows

- **Builders only.** Every call carries a key made on `/agents` by someone signed in with GitHub who
  has chosen a username. A revoked key stops working at once.
- **The same limits as the site.** Changes are limited to 30 an hour per person. Looking up a new
  website costs a page read and five GitHub searches, so it has the site's own limit: 10 new
  lookups an hour per person and 150 for the whole site, shared with `/api/find`.
- **No AI model.** Nothing here calls one. Matching is the site's own search; lookups use the words
  on the tool's own website.
- **Signals are never money.** "Would pay" and "pays for" are statements of demand.
- **Nothing about your code leaves your machine.** `open_source_ready` returns a checklist; the
  checks run in the skill, locally.
- **Stateless.** Each request is one JSON-RPC message (or a batch of up to 20) answered with JSON
  over MCP's Streamable HTTP transport, which suits serverless functions. No sessions, no streams.

## Tools

| Tool | Changes something | What it does |
|---|---|---|
| `search` | no | Paid tools, wanted ideas and projects matching a name or a description |
| `alternatives_to` | no | The open-source projects replacing one catalog tool, with what is still missing |
| `lookup_tool` | saves the answer | Reads a paid tool's website and finds open-source projects doing the same job |
| `my_tools` | add and remove | The paid tools you pay for today: list, add, remove |
| `get_gap` | no | One wanted idea: demand, would-pay signal, who is building it |
| `top_gaps` | no | The most wanted things nobody has built |
| `post_idea` | yes | Posts an idea, after showing anything that already matches |
| `me_too` | yes | "I want this too" on an idea, once per person |
| `suggest_improvement` | no | Hands back the page where the person edits an idea themself |
| `follow` | yes | Follow an idea |
| `help_wanted` | no | Open "help wanted" and "good first issue" issues across tracked projects |
| `open_source_ready` | no | The Open Source Ready checklist, the guide and the skill |

## Decisions

- **`lookup_tool` returns a catalog tool as a pointer.** If the website belongs to a tool the site
  already tracks, the answer is its slug and "call `alternatives_to`", so there is one source for
  each tool's alternatives.
- **`my_tools` takes a slug or a website.** A catalog tool is stored in `paid_tools`. A looked-up
  tool is stored by counting the person in `asked_tools.askers` as `u:<person id>`, the same key
  the site uses when a signed-in person looks a tool up. Adding a website nobody has asked about
  looks it up first.
- **"Pays for" is not "would pay".** They are stored apart on purpose. "I'd pay if it worked" is a
  signal with an amount and feeds the public would-pay totals; listing a tool you pay for must
  never inflate it. Onboarding and the MCP both go through `src/lib/myTools.ts`.
- **`help_wanted` narrows by topic, not by a language field.** The site stores each project's
  GitHub topics, and projects tag themselves with their language there, so `topic: "typescript"`
  works. At most two issues per project are returned so one busy project does not fill the list.
- **`suggest_improvement` does not write.** A suggestion becomes a pull request in the person's
  name, so the person writes it on the page.

## Files

- `src/pages/mcp.ts`: the endpoint and the key check.
- `src/lib/mcp/server.ts`: the protocol and every tool.
- `src/lib/mcp/keys.ts`: making and checking keys.
- `src/lib/mcp/checklist.ts`: the checklist, built from the guide's own data.
- `src/lib/myTools.ts`: the tools someone pays for.
- `src/pages/agents.astro`: how to connect, and your keys.
