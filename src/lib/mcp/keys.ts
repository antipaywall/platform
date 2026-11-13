// Keys for the Antipaywall MCP. A builder signed in with GitHub creates one on their account page;
// it's shown once and only its hash is kept. Revoked keys stop working at once.

import { createHash, randomBytes } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Person } from '../db';

export const hashKey = (plain: string) => createHash('sha256').update(plain).digest('hex');

export function newKey(): { plain: string; hash: string } {
  const plain = `apw_${randomBytes(32).toString('base64url')}`;
  return { plain, hash: hashKey(plain) };
}

/** The builder behind an `Authorization: Bearer apw_…` header, or null. */
export async function personForKey(db: SupabaseClient, header: string | null): Promise<Person | null> {
  const m = /^Bearer\s+(apw_[A-Za-z0-9_-]{43})$/.exec(header ?? '');
  if (!m) return null;
  const hash = hashKey(m[1]);
  const { data } = await db.from('mcp_keys').select('id, revoked_at, people:person_id(*)').eq('key_hash', hash).is('revoked_at', null).maybeSingle();
  const row: any = data;
  if (!row || row.revoked_at || !row.people || !row.people.username) return null;
  await db.from('mcp_keys').update({ last_used_at: new Date().toISOString() }).eq('key_hash', hash);
  return row.people as Person;
}
