// The Open Source Ready guide: everything to prepare before a project goes public, and the first
// month after. The skill (github.com/antipaywall/open-source-ready) checks most of it for you.

/** Who a step is for. "all" applies to every project, even one you're only sharing. */
export type Need = 'all' | 'users' | 'contributors' | 'company';

export type Step = {
  id: string;
  title: string;
  /** Why it matters, in a sentence or two. */
  why: string;
  /** What to do. Plain text; `code` spans are rendered as code. */
  how: string[];
  /** A command or file to copy, if there is one. */
  copy?: string;
  need: Need;
  /** Checked automatically by the skill's review. */
  checked?: boolean;
};

export type Part = { id: string; title: string; intro: string; steps: Step[] };

export const NEED_LABEL: Record<Need, string> = {
  all: 'Every project',
  users: 'If you want users',
  contributors: 'If you want contributors',
  company: 'Work or company projects',
};

export const INTENTS = [
  {
    title: 'Just sharing it',
    text: 'You want the code out there and you may not answer questions. Do the "every project" steps, and say plainly in the README that you aren\'t taking contributions. That is a legitimate choice.',
  },
  {
    title: 'You want people to use it',
    text: 'Add the steps that make it easy to try and trust: an install command, versions and release notes, and a way to report problems.',
  },
  {
    title: 'You want people to help build it',
    text: 'Do everything here. Contributors need small tasks, a clear picture of where it\'s going, and someone who answers.',
  },
];

export const PARTS: Part[] = [
  {
    id: 'decide',
    title: 'Decide before you publish',
    intro: 'Four questions that are cheap to answer now and expensive to answer after people depend on the project.',
    steps: [
      {
        id: 'allowed',
        title: 'Check you are allowed to publish it',
        why: 'Many employment contracts give your employer the rights to code you write, sometimes even on your own time and computer. Clients and co-founders can have a claim too.',
        how: [
          'Read the intellectual property section of your contract, or ask your manager in writing.',
          'For a company project, get sign-off from whoever owns legal and security, and check no customer data or internal systems are referenced.',
        ],
        need: 'all',
      },
      {
        id: 'name',
        title: 'Check the name is free',
        why: 'Renaming after launch breaks links, installs and search results. A name that clashes with a trademark or a well-known project can force a rename.',
        how: [
          'Search GitHub, the package registry you will publish to (npm, PyPI, crates.io), and the WIPO Global Brand Database.',
          'If you want them, reserve the package name, the domain and social handles now.',
        ],
        need: 'all',
      },
      {
        id: 'license',
        title: 'Choose a license',
        why: 'Without a license, the law says nobody may use, copy or change your code, even though they can read it. Public is not the same as open source.',
        how: [
          'MIT: anyone can do almost anything, including use it in paid products, as long as they keep your copyright notice. The most common choice.',
          'Apache-2.0: like MIT, plus an explicit patent grant. Common for company-backed projects.',
          'GPL-3.0: people who share a changed version must share their source too. AGPL-3.0 extends that to software run as a web service.',
          'Put the full, unedited license text in a `LICENSE` file, and name the same license in your package file (`package.json`, `pyproject.toml`, `Cargo.toml`).',
        ],
        need: 'all',
        checked: true,
      },
      {
        id: 'deps',
        title: 'Check your dependencies allow it',
        why: 'Code you include, or depend on, comes with its own license. A GPL dependency limits how you can license your project; a dependency with no license at all may not be usable.',
        how: [
          'List your dependencies\' licenses (for Node: `npx license-checker --summary`; for Python: `pip-licenses`).',
          'Keep any copied third-party code in its own folder with its original license.',
          'Check images, fonts and datasets too: "non-commercial" licenses are common there.',
        ],
        need: 'all',
      },
    ],
  },
  {
    id: 'safe',
    title: 'Make it safe to publish',
    intro: 'Once a repo is public, every file in every past commit is public too. Deleting something in a new commit does not hide it.',
    steps: [
      {
        id: 'secrets',
        title: 'Find secrets in the files and the whole history',
        why: 'Bots scan new public repos for keys within minutes. A key that was ever committed has to be treated as leaked.',
        how: [
          'Scan everything, including history: `gitleaks git .` (or `trufflehog git file://.`).',
          'For every real key you find: revoke it at the service and make a new one. That is the only real fix.',
          'Move secrets into environment variables, keep `.env` out with `.gitignore`, and add a `.env.example` with placeholder values if the code reads them.',
        ],
        copy: 'gitleaks git . --verbose',
        need: 'all',
        checked: true,
      },
      {
        id: 'private-files',
        title: 'Take out private files and personal details',
        why: 'Local databases, exports, logs, personal notes, customer data in test fixtures and internal URLs are easy to forget and hard to remove later.',
        how: [
          'Look through the file list as a stranger would. Untrack what shouldn\'t be public (`git rm --cached`) and ignore it.',
          'Commit author emails are public. GitHub\'s no-reply address keeps yours private for future commits.',
        ],
        need: 'all',
        checked: true,
      },
      {
        id: 'history',
        title: 'Decide what to do about the history',
        why: 'If something private is buried in old commits, removing the file today leaves it in the history.',
        how: [
          'Harmless, or the key is revoked: keep the history.',
          'Something must go and nobody else has a copy: rewrite it with `git filter-repo` before the first push.',
          'Easiest of all: start fresh, with one first commit of the current files. Many projects open this way.',
        ],
        need: 'all',
      },
      {
        id: 'gitignore',
        title: 'Keep future mistakes out',
        why: 'You, or a contributor, will one day run `git add .` with an env file or build output lying around.',
        how: [
          'A `.gitignore` for your language that covers `.env*`, build output, logs and editor files.',
          'Turn on GitHub secret scanning and push protection (Settings, then Code security). Push protection blocks a commit that contains a known key format.',
        ],
        need: 'all',
        checked: true,
      },
    ],
  },
  {
    id: 'try',
    title: 'Make it easy to try',
    intro: 'Most visitors decide in seconds whether to keep reading, and people only help with things they have run.',
    steps: [
      {
        id: 'readme-top',
        title: 'Say what it does and who it is for, first',
        why: 'The first two lines of the README decide whether a stranger stays. Badges, logos and tables of contents push them down.',
        how: [
          'Name, then one or two plain sentences: what it does and who it\'s for.',
          'A screenshot or a short demo if it has anything to see. Never a mock-up of features that don\'t exist.',
        ],
        need: 'all',
        checked: true,
      },
      {
        id: 'one-command',
        title: 'Give one command to try it',
        why: 'Every extra setup step loses people. Install steps that only work on your machine lose all of them.',
        how: [
          'A code block someone can copy: `npx your-tool`, `pip install your-tool`, `docker run ...`.',
          'Test it from a fresh clone in an empty folder before you publish.',
          'If people will use it a lot, publish it to the usual package registry so they can install it the normal way.',
        ],
        need: 'users',
        checked: true,
      },
      {
        id: 'status',
        title: 'Be honest about how finished it is',
        why: 'Overstating it costs trust you won\'t get back. Saying what\'s rough sets expectations and shows people where they can help.',
        how: [
          'A short status section: what works, what\'s rough, what isn\'t started.',
          'If you\'re not taking contributions or won\'t answer issues, say so here.',
        ],
        need: 'all',
        checked: true,
      },
      {
        id: 'releases',
        title: 'Number your versions and write release notes',
        why: 'People need to know what changed and whether an update will break them. It also shows the project is alive.',
        how: [
          'Tag releases with version numbers (`v0.1.0`). Below 1.0 tells people things may still change.',
          'Write what changed in each release, in a `CHANGELOG.md` or in GitHub Releases.',
        ],
        need: 'users',
        checked: true,
      },
    ],
  },
  {
    id: 'help',
    title: 'Make it easy to help',
    intro: 'A visitor becomes a contributor when there is a small, clear task and someone answers them.',
    steps: [
      {
        id: 'contributing',
        title: 'Write a short CONTRIBUTING file',
        why: 'It answers "how do I run this and send a change?" before anyone has to ask, and it\'s where you set expectations.',
        how: [
          'How to run it locally and run the tests, how to pick an issue, what a good pull request looks like.',
          'How often you\'ll look at issues and pull requests. Only promise what you\'ll keep.',
          'Your policy on AI-written contributions: welcome, welcome if disclosed and tested, or not accepted. Low-effort generated pull requests are a real cost now; say what you want.',
        ],
        need: 'contributors',
        checked: true,
      },
      {
        id: 'first-issues',
        title: 'Open a few good first issues',
        why: 'An empty issue list says there\'s nothing to do. A small, well-described task is how most people make their first contribution.',
        how: [
          'Five to ten issues from your roadmap and TODOs. Each says what and why, where in the code to start, and how to know it\'s done.',
          'Label the easiest two to five `good first issue` and the bigger ones `help wanted`.',
        ],
        need: 'contributors',
        checked: true,
      },
      {
        id: 'scope',
        title: 'Write down where it is going, and what it won\'t do',
        why: 'A short roadmap lets people pick work that matters. A "won\'t do" list lets you say no to a pull request kindly, without arguing.',
        how: ['A few lines in the README or a pinned issue: what\'s next, and what\'s out of scope.'],
        need: 'contributors',
      },
      {
        id: 'templates',
        title: 'Add issue templates and labels',
        why: 'Feedback arrives with the details you need instead of "it doesn\'t work".',
        how: [
          'Two short templates in `.github/ISSUE_TEMPLATE/`: one for bugs, one for ideas.',
          'Four labels: `good first issue`, `help wanted`, `bug`, `idea`.',
        ],
        need: 'contributors',
        checked: true,
      },
      {
        id: 'support',
        title: 'Say where questions go',
        why: 'Without one, questions land in the issue list and real bugs get lost.',
        how: ['Turn on GitHub Discussions, or name another place, and point to it from the README.'],
        need: 'users',
        checked: true,
      },
      {
        id: 'agents',
        title: 'Add an AGENTS.md',
        why: 'More and more contributors work with a coding agent. A short file with the build, test and style commands helps them, and their agents, get it right first time.',
        how: ['A plain `AGENTS.md` at the root: how to install, run the tests, and the conventions to follow.'],
        need: 'contributors',
        checked: true,
      },
    ],
  },
  {
    id: 'protect',
    title: 'Protect it and the people using it',
    intro: 'A few settings that take minutes and save you from the problems public projects attract.',
    steps: [
      {
        id: 'security',
        title: 'Give people a private way to report security problems',
        why: 'Otherwise the first report may be a public issue that shows everyone how to attack your users.',
        how: [
          'Turn on private vulnerability reporting (Settings, then Code security).',
          'Add a short `SECURITY.md` that points to it.',
        ],
        need: 'users',
        checked: true,
      },
      {
        id: 'deps-updates',
        title: 'Keep dependencies updated automatically',
        why: 'Most security problems in projects come from old dependencies.',
        how: ['Turn on Dependabot alerts and add a `.github/dependabot.yml` (or use Renovate).'],
        need: 'users',
        checked: true,
      },
      {
        id: 'ci',
        title: 'Run the tests on every pull request',
        why: 'You can\'t review every change by hand for long. Automated checks catch breakage before you merge it, and tell contributors whether their change works.',
        how: [
          'A GitHub Actions workflow that installs and runs your tests (and a linter, if you use one).',
          'Protect the main branch so changes go through a pull request with passing checks.',
        ],
        need: 'contributors',
        checked: true,
      },
      {
        id: 'conduct',
        title: 'Decide on a code of conduct',
        why: 'It tells people how they\'ll be treated and what you\'ll do if someone behaves badly. One you won\'t enforce is worse than none.',
        how: ['If you\'ll stand behind it, the Contributor Covenant is the common choice. It needs a contact for reports.'],
        need: 'contributors',
        checked: true,
      },
      {
        id: 'second-admin',
        title: 'Make sure you are not the only admin',
        why: 'If you lose access or step away, nobody can merge, release or fix anything.',
        how: ['Add a second person you trust as an admin, or move the repo to a GitHub organization.'],
        need: 'contributors',
      },
    ],
  },
  {
    id: 'share',
    title: 'Share it',
    intro: 'The first users usually come from people who already know you. You don\'t need a campaign.',
    steps: [
      {
        id: 'about',
        title: 'Fill in the description and topics',
        why: 'They\'re what GitHub search and every other site show about your project.',
        how: ['A one-line description, a homepage link if you have one, and three to six topics people would actually search for.'],
        need: 'all',
        checked: true,
      },
      {
        id: 'launch-text',
        title: 'Write one honest launch description',
        why: 'Written once, it becomes the post, the newsletter blurb and the directory listing, and it stays consistent.',
        how: [
          'What it does, who it\'s for, why you made it, how finished it is, and what help you want. Three short paragraphs, no hype.',
          'Post it where your people already are. A plain "I built this, here\'s what\'s rough" does better than marketing language.',
        ],
        need: 'users',
        checked: true,
      },
    ],
  },
  {
    id: 'first-month',
    title: 'The first month',
    intro: 'Most guides stop at "announce it". This is where projects actually win or lose their first contributors.',
    steps: [
      {
        id: 'respond',
        title: 'Answer everything quickly',
        why: 'Time to first response is the strongest signal newcomers read. A quick "thanks, I\'ll look this weekend" keeps them.',
        how: ['Aim to answer every new issue and pull request within a few days, even if the real answer comes later.'],
        need: 'contributors',
      },
      {
        id: 'thank',
        title: 'Thank first-time contributors by name',
        why: 'Being thanked publicly is why many people come back for a second contribution.',
        how: ['In the pull request, in the release notes, and when you post about the project.'],
        need: 'contributors',
      },
      {
        id: 'refill',
        title: 'Keep the good first issues topped up',
        why: 'Every good first issue that gets done is one less door for the next newcomer.',
        how: ['Turn feedback and bug reports into new small issues as they arrive.'],
        need: 'contributors',
      },
      {
        id: 'close-kindly',
        title: 'Close what you won\'t merge, kindly',
        why: 'A pull request left open for months is a worse answer than a polite no.',
        how: ['Thank them, explain why in a sentence (your "won\'t do" list helps), and close it.'],
        need: 'contributors',
      },
    ],
  },
];

/** Worth doing once the project has momentum, not on day one. */
export const LATER: { title: string; text: string }[] = [
  { title: 'Governance', text: 'Write down how decisions are made and who breaks ties, before a disagreement needs it.' },
  { title: 'DCO or CLA', text: 'A Developer Certificate of Origin (a sign-off on each commit) is the lighter option. Use a CLA only if you need to relicense or want a patent grant.' },
  { title: 'License headers', text: 'SPDX headers in each file and the REUSE tool make your licensing machine-readable.' },
  { title: 'Funding', text: 'A `FUNDING.yml` adds a sponsor button to the repo.' },
  { title: 'Citation', text: 'A `CITATION.cff` tells researchers how to cite your work.' },
  { title: 'A maturity badge', text: 'The OpenSSF Best Practices badge and OpenSSF Scorecard measure your project against a public bar.' },
];

export const MISTAKES: string[] = [
  'Publishing without a license, or with one only mentioned in the README.',
  'Leaving keys in old commits, and deleting the file instead of revoking the key.',
  'Calling it production-ready when it isn\'t.',
  'Install steps that only work on the author\'s machine.',
  'An empty issue list, so nobody knows where to start.',
  'Not answering the first issues and pull requests.',
  'Waiting for the perfect moment. Rough and honest beats polished and late.',
];

export const READING: { title: string; url: string; text: string }[] = [
  { title: 'Open Source Guides', url: 'https://opensource.guide/starting-a-project/', text: 'GitHub\'s guides on starting a project, building community and finding users. The most widely used.' },
  { title: 'Producing Open Source Software', url: 'https://producingoss.com/en/getting-started.html', text: 'Karl Fogel\'s book, free online. The best on what the front page must say and on opening a closed project.' },
  { title: 'GitHub Docs: healthy contributions', url: 'https://docs.github.com/en/communities/setting-up-your-project-for-healthy-contributions', text: 'The exact files and settings GitHub recognizes.' },
  { title: 'Starting an Open Source Project', url: 'https://todogroup.org/resources/guides/starting-an-open-source-project/', text: 'The TODO Group and Linux Foundation guide. Strongest on legal review, governance and company projects.' },
  { title: 'OpenSSF Best Practices criteria', url: 'https://www.bestpractices.dev/en/criteria/0', text: 'A measurable bar for a mature project.' },
  { title: 'REUSE', url: 'https://reuse.software/tutorial/', text: 'Machine-readable licensing for every file.' },
];

export const REPO_URL = 'https://github.com/antipaywall/open-source-ready';
