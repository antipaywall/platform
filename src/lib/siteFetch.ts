// Fetching a website someone pasted, safely. The address comes from a stranger, so it may only
// ever lead to a public web server: https only, never an internal or private address, a short
// time limit, a size limit, and every redirect checked the same way.

import { lookup as dnsLookup, type LookupAddress, type LookupOptions } from 'node:dns';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';
import type { Readable } from 'node:stream';
import { createBrotliDecompress, createGunzip, createInflate } from 'node:zlib';

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

/**
 * A DNS lookup that refuses private addresses. It is handed to the connection itself, so the
 * address that is checked is the address that is connected to: a name that answers with a public
 * address once and a private one a moment later gets nowhere.
 */
export function publicLookup(hostname: string, options: LookupOptions, callback: (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void): void {
  if (isIP(hostname)) return callback(Object.assign(new Error('address given directly'), { code: 'EPRIVATE' }), '', 0);
  dnsLookup(hostname, { all: true }, (err, found) => {
    if (err) return callback(err, '', 0);
    if (!found.length || found.some((a) => isPrivateAddress(a.address))) return callback(Object.assign(new Error('not a public address'), { code: 'EPRIVATE' }), '', 0);
    const want = options.family === 6 || options.family === 4 ? found.filter((a) => a.family === options.family) : found;
    if (!want.length) return callback(Object.assign(new Error('no address of that family'), { code: 'ENOTFOUND' }), '', 0);
    if (options.all) return callback(null, want);
    callback(null, want[0].address, want[0].family);
  });
}

type Got = { status: number; location: string | null; type: string; body: Readable | null };

/** One https request, connected only through publicLookup. The body is decompressed if it came compressed. */
function get(u: URL, signal: AbortSignal): Promise<Got> {
  return new Promise((resolve, reject) => {
    const req = httpsRequest(
      u,
      {
        method: 'GET', lookup: publicLookup as any, signal, agent: false,
        headers: { 'user-agent': 'Mozilla/5.0 (compatible; site-reader)', accept: 'text/html,application/xhtml+xml', 'accept-language': 'en', 'accept-encoding': 'gzip, deflate, br' },
      },
      (res) => {
        const enc = String(res.headers['content-encoding'] ?? '').toLowerCase();
        const body = enc === 'gzip' ? res.pipe(createGunzip()) : enc === 'deflate' ? res.pipe(createInflate()) : enc === 'br' ? res.pipe(createBrotliDecompress()) : res;
        body.on('error', () => undefined);
        resolve({ status: res.statusCode ?? 0, location: typeof res.headers.location === 'string' ? res.headers.location : null, type: String(res.headers['content-type'] ?? ''), body });
      },
    );
    req.on('error', reject);
    req.end();
  });
}

/** A web page's HTML, or null when it can't be read safely or in time. Never throws. */
export async function fetchPage(url: string, ms = 4500, maxBytes = 900_000): Promise<string | null> {
  const signal = AbortSignal.timeout(ms);
  let next = url;
  try {
    for (let hop = 0; hop < 4; hop++) {
      const u = new URL(next);
      if (u.protocol !== 'https:' || u.port || u.username || u.password || isIP(u.hostname.replace(/^\[|\]$/g, ''))) return null;
      const res = await get(u, signal);
      if (res.status >= 300 && res.status < 400) {
        res.body?.destroy();
        if (!res.location) return null;
        next = new URL(res.location, u).toString();
        continue;
      }
      if (res.status < 200 || res.status >= 300 || !/html/i.test(res.type) || !res.body) {
        res.body?.destroy();
        return null;
      }
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of res.body) {
        chunks.push(chunk as Buffer);
        size += (chunk as Buffer).byteLength;
        if (size >= maxBytes) break;
      }
      res.body.destroy();
      return new TextDecoder('utf-8', { fatal: false }).decode(Buffer.concat(chunks).subarray(0, maxBytes));
    }
  } catch {
    return null;
  }
  return null;
}
