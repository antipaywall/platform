import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// From 0018 on, the platform shares the live site's database before it is released, so every
// migration may only add: new tables, new columns, new functions and views. Nothing the live
// site reads may be dropped, renamed or changed.
const DIR = 'supabase/migrations';
const platform = readdirSync(DIR)
  .filter((f) => /^(\d{4})_.*\.sql$/.test(f) && Number(f.slice(0, 4)) >= 18)
  .map((f) => ({ file: f, sql: readFileSync(`${DIR}/${f}`, 'utf8').replace(/--[^\n]*/g, '') }));

const created = (sql: string, kind: string) =>
  [...sql.matchAll(new RegExp(`create\\s+(?:or\\s+replace\\s+)?${kind}\\s+(?:if\\s+not\\s+exists\\s+)?public\\.(\\w+)`, 'gi'))].map((m) => m[1].toLowerCase());

describe('platform migrations', () => {
  it('has a 0018 migration', () => {
    expect(existsSync(`${DIR}/0018_platform.sql`)).toBe(true);
  });

  it('keeps every migration from 0018 on additive', () => {
    for (const { file, sql } of platform) {
      const own = new Set([...created(sql, 'table'), ...created(sql, 'view'), ...created(sql, 'function'), ...created(sql, 'index')]);
      for (const m of sql.matchAll(/\bdrop\s+(table|column|view|function|index|constraint|trigger)\s+(?:if\s+exists\s+)?(?:public\.)?(\w+)/gi)) {
        expect(own.has(m[2].toLowerCase()), `${file} drops ${m[1]} ${m[2]}`).toBe(true);
      }
      expect(/\brename\b/i.test(sql), `${file} renames something`).toBe(false);
      expect(/\balter\s+column\b[^;]*\b(type|set\s+not\s+null|drop)\b/i.test(sql), `${file} changes a column`).toBe(false);
      expect(/\bdrop\s+constraint\b/i.test(sql), `${file} drops a constraint`).toBe(false);
    }
  });

  it('turns on row-level security for every new table and keeps browsers out', () => {
    for (const { file, sql } of platform) {
      for (const t of created(sql, 'table')) {
        expect(new RegExp(`alter\\s+table\\s+public\\.${t}\\s+enable\\s+row\\s+level\\s+security`, 'i').test(sql) || new RegExp(`'${t}'`).test(sql), `${file}: ${t} has no row-level security`).toBe(true);
        expect(new RegExp(`revoke\\s+all\\s+on\\s+public\\.${t}\\s+from\\s+anon,\\s*authenticated`, 'i').test(sql) || new RegExp(`'${t}'`).test(sql), `${file}: ${t} is not revoked`).toBe(true);
      }
    }
  });

  it('gives new functions to service_role only', () => {
    for (const { file, sql } of platform) {
      for (const f of created(sql, 'function')) {
        expect(new RegExp(`revoke\\s+execute\\s+on\\s+function\\s+public\\.${f}\\([^)]*\\)\\s+from\\s+public,\\s*anon,\\s*authenticated`, 'i').test(sql), `${file}: ${f} is not revoked`).toBe(true);
        expect(new RegExp(`grant\\s+execute\\s+on\\s+function\\s+public\\.${f}\\([^)]*\\)\\s+to\\s+service_role`, 'i').test(sql), `${file}: ${f} is not granted to service_role`).toBe(true);
      }
    }
  });
});
