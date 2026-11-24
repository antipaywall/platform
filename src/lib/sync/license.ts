// What a license lets you do, in words a bakery owner would follow. Not legal advice; the
// project's own license file is what counts, and the page links to it.

const PLAIN: Record<string, string> = {
  MIT: 'Free to use, change and sell, even in paid products. Keep the copyright notice.',
  'Apache-2.0': 'Free to use, change and sell, even in paid products. Keep the notices and say what you changed.',
  'BSD-2-Clause': 'Free to use, change and sell, even in paid products. Keep the copyright notice.',
  'BSD-3-Clause': 'Free to use, change and sell, even in paid products. Keep the copyright notice and don\'t use the authors\' names to promote yours.',
  ISC: 'Free to use, change and sell, even in paid products. Keep the copyright notice.',
  Unlicense: 'Given to everyone. Use it for anything, no conditions.',
  'CC0-1.0': 'Given to everyone. Use it for anything, no conditions.',
  '0BSD': 'Free to use for anything, no conditions.',
  'MPL-2.0': 'Free to use and sell. If you change its files, share those changed files.',
  'LGPL-2.1': 'Free to use, even in paid products. If you change the library itself, share your changes.',
  'LGPL-3.0': 'Free to use, even in paid products. If you change the library itself, share your changes.',
  'GPL-2.0': 'Free to use and change. If you give a changed version to others, share its code under the same license.',
  'GPL-3.0': 'Free to use and change. If you give a changed version to others, share its code under the same license.',
  'AGPL-3.0': 'Free to use and change. If you run a changed version for others online, you must share your changes.',
  'EPL-2.0': 'Free to use and sell. If you change its files and give them out, share those changes.',
};

export function plainLicense(spdx: string | null, name?: string | null): { label: string; words: string } {
  if (!spdx && name) return { label: 'Own license', words: "It uses its own license, or several together. Read the project's license file before you rely on it." };
  if (!spdx) return { label: 'No license', words: 'No license was found, so you may not have the right to use it.' };
  return { label: spdx, words: PLAIN[spdx] ?? "See the project's license file." };
}
