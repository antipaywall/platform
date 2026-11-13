// Email backers: people who signed in with a link sent to their email instead of GitHub or
// GitLab. They back, signal and post gaps; they don't join as hackathon builders.

import { adminClient } from './supabase';
import { DataUnavailableError } from './db';

export type Backer = { id: string; name: string | null; about: string | null; public: boolean };

export async function getBacker(id: string): Promise<Backer | null> {
  const db = adminClient();
  if (!db) throw new DataUnavailableError('not configured');
  const { data, error } = await db.from('backers').select('id, name, about, public').eq('id', id).maybeSingle();
  if (error) throw new DataUnavailableError(error.message);
  return (data as Backer) ?? null;
}

/** What to call a backer in public: the name they chose, or nothing identifying. */
export const backerName = (b: Pick<Backer, 'name'> | null | undefined) => b?.name?.trim() || 'A backer';
