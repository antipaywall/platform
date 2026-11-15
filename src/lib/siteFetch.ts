// Fetching a website someone pasted, safely. The address comes from a stranger, so it may only
// ever lead to a public web server: https only, never an internal or private address, a short
// time limit, a size limit, and every redirect checked the same way.

import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

/** True for addresses that are not on the public internet: loopback, private ranges, link-local and the like. */
export function isPrivateAddress(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
  }
  if (v === 6) {
    const low = ip.toLowerCase();
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(low);
    if (mapped) return isPrivateAddress(mapped[1]);
    return low === '::' || low === '::1' || /^f[cd]/.test(low) || /^fe[89ab]/.test(low) || low.startsWith('::ffff:') || low.startsWith('64:ff9b:') || low.startsWith('2001:db8');
  }
  return true;
}

async function isPublicHost(host: string): Promise<boolean> {
  if (isIP(host)) return false;
  try {
    const found = await lookup(host, { all: true });
    return found.length > 0 && found.every((a) => !isPrivateAddress(a.address));
  } catch {
    return false;
  }
}

/** A web page's HTML, or null when it can't be read safely or in time. Never throws. */
export async function fetchPage(url: string, ms = 4500, maxBytes = 900_000): Promise<string | null> {
  const signal = AbortSignal.timeout(ms);
  let next = url;
  try {
    for (let hop = 0; hop < 4; hop++) {
      const u = new URL(next);
      if (u.protocol !== 'https:' || u.port || u.username || u.password) return null;
      if (!(await isPublicHost(u.hostname))) return null;
      const res = await fetch(u, { redirect: 'manual', signal, headers: { 'user-agent': 'Mozilla/5.0 (compatible; site-reader)', accept: 'text/html,application/xhtml+xml', 'accept-language': 'en' } });
      if (res.status >= 300 && res.status < 400) {
        const to = res.headers.get('location');
        if (!to) return null;
        next = new URL(to, u).toString();
        continue;
      }
      if (!res.ok || !/html/i.test(res.headers.get('content-type') ?? '') || !res.body) return null;
      const reader = res.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      while (size < maxBytes) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        size += value.byteLength;
      }
      await reader.cancel().catch(() => undefined);
      return new TextDecoder('utf-8', { fatal: false }).decode(Buffer.concat(chunks).subarray(0, maxBytes));
    }
  } catch {
    return null;
  }
  return null;
}
