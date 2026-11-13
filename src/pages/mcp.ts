import type { APIRoute } from 'astro';
import { personForKey } from '../lib/mcp/keys';
import { handleRpc } from '../lib/mcp/server';
import { adminClient } from '../lib/supabase';

const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(body === null ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...extra } });

// The Antipaywall MCP, over Streamable HTTP. Every call needs a builder's MCP key, created on
// /agents after signing in with GitHub. Answers are plain JSON; there are no streams or sessions.
export const POST: APIRoute = async ({ request, url }) => {
  const db = adminClient();
  if (!db) return json({ jsonrpc: '2.0', id: null, error: { code: -32603, message: 'Unavailable' } }, 503);
  const person = await personForKey(db, request.headers.get('authorization'));
  if (!person) {
    return json({ jsonrpc: '2.0', id: null, error: { code: -32001, message: `Sign in with GitHub at ${url.origin}/agents and create an MCP key.` } }, 401, {
      'www-authenticate': 'Bearer realm="antipaywall"',
    });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Not valid JSON' } }, 400);
  }
  const ctx = { person, db, origin: url.origin };
  if (Array.isArray(body)) {
    const out = (await Promise.all(body.slice(0, 20).map((m) => handleRpc(m, ctx)))).filter(Boolean);
    return out.length ? json(out) : new Response(null, { status: 202 });
  }
  const out = await handleRpc(body as any, ctx);
  return out ? json(out) : new Response(null, { status: 202 });
};

// A browser opening the address gets the page explaining how to connect an agent.
export const GET: APIRoute = ({ request, redirect }) =>
  (request.headers.get('accept') ?? '').includes('text/html') ? redirect('/agents', 302) : new Response(null, { status: 405, headers: { allow: 'POST' } });
