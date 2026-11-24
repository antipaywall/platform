import { beforeEach, describe, expect, it, vi } from 'vitest';

// The organizer's route for looked-up tools: who may use it, and what each button changes.
const state = { admin: false, updates: [] as { status: string; domain: string }[], lookups: [] as string[] };

beforeEach(() => {
  vi.resetModules();
  state.admin = false;
  state.updates = [];
  state.lookups = [];
  vi.doMock('../src/lib/db', () => ({ isAdmin: () => state.admin }));
  vi.doMock('../src/lib/supabase', () => ({
    adminClient: () => ({
      from: () => ({ update: (v: { status: string }) => ({ eq: async (_c: string, domain: string) => (state.updates.push({ status: v.status, domain }), { error: null }) }) }),
    }),
  }));
  vi.doMock('../src/lib/askedTools', () => ({ lookupTool: async (_db: unknown, domain: string) => (state.lookups.push(domain), { githubDown: false }) }));
});

async function post(fields: Record<string, string>) {
  const { POST } = await import('../src/pages/api/admin/tools');
  const body = new FormData();
  for (const [k, v] of Object.entries(fields)) body.set(k, v);
  const request = new Request('https://x.test/api/admin/tools', { method: 'POST', body });
  const redirect = (to: string, status: number) => new Response(null, { status, headers: { location: to } });
  return POST({ request, locals: { person: { github_id: 1 } }, redirect } as any) as Promise<Response>;
}

describe('the looked-up tools route', () => {
  it('does not exist for anyone but the organizer', async () => {
    const res = await post({ action: 'hide', domain: 'annot.io' });
    expect(res.status).toBe(404);
    expect(state.updates).toEqual([]);
  });
  it('lists, hides and brings back one tool at a time', async () => {
    state.admin = true;
    for (const action of ['list', 'hide', 'unlist']) expect((await post({ action, domain: 'https://www.Annot.io/' })).headers.get('location')).toBe(`/admin/tools?done=${action}#annot.io`);
    expect(state.updates).toEqual([{ status: 'listed', domain: 'annot.io' }, { status: 'hidden', domain: 'annot.io' }, { status: 'new', domain: 'annot.io' }]);
  });
  it('looks a tool up again without changing its status', async () => {
    state.admin = true;
    expect((await post({ action: 'refresh', domain: 'annot.io' })).status).toBe(303);
    expect(state.lookups).toEqual(['annot.io']);
    expect(state.updates).toEqual([]);
  });
  it('refuses an unknown action or something that is not a website', async () => {
    state.admin = true;
    expect((await post({ action: 'delete', domain: 'annot.io' })).headers.get('location')).toContain('m=save_failed');
    expect((await post({ action: 'hide', domain: 'not a site' })).headers.get('location')).toContain('m=save_failed');
    expect(state.updates).toEqual([]);
  });
});
