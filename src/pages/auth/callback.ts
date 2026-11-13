import type { APIRoute } from 'astro';
import { countryCode } from '../../lib/analytics';
import { isAdmin, type Person } from '../../lib/db';
import { checkEligibility } from '../../lib/eligibility';
import { recordEvent } from '../../lib/events';
import { parseProvider, providerOf } from '../../lib/accounts';
import type { AccountFacts } from '../../lib/eligibility';
import { fetchGithubFacts, GithubUnavailableError } from '../../lib/github';
import { fetchGitlabFacts, GitlabUnavailableError } from '../../lib/gitlab';
import { accountIdentity } from '../../lib/identity';
import { refreshActivity, refreshRepos } from '../../lib/profiles';
import { parseEmail } from '../../lib/intake';
import { addToList } from '../../lib/list';
import { back, safeNext, type MessageCode } from '../../lib/respond';
import { adminClient, sessionClient } from '../../lib/supabase';
import { claimSignals } from '../../lib/signals';
import { visitorId } from '../../lib/visitor';

export const GET: APIRoute = async (context) => {
  const { request, cookies, url, redirect } = context;
  const next = safeNext(url.searchParams.get('next'));
  const code = url.searchParams.get('code');
  const supabase = sessionClient(request, cookies);
  const db = adminClient();
  if (!supabase || !db) return back(next, 'signin_failed');

  // A sign-in link from an email: a backer, never a builder row.
  if (url.searchParams.get('provider') === 'email') {
    const tokenHash = url.searchParams.get('token_hash');
    if (!tokenHash || url.searchParams.get('type') !== 'magiclink') return back(next, 'signin_failed');
    const { data: verified, error: verifyError } = await supabase.auth.verifyOtp({ type: 'magiclink', token_hash: tokenHash });
    const userId = verified?.user?.id;
    if (verifyError || !userId) return back(next, 'signin_failed');
    // Someone who already has a GitHub or GitLab row keeps it; otherwise they are a backer.
    const known = await db.from('people').select('id').eq('id', userId).maybeSingle();
    if (!known.data) await db.from('backers').upsert({ id: userId }, { ignoreDuplicates: true });
    await claimSignals(db, visitorId(cookies), userId);
    return redirect(next);
  }
  if (!code) return back(next, 'signin_failed');

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.session) return back(next, 'signin_failed');
  const { user, provider_token } = data.session;

  // Any way out that does not end in a saved person also ends the session, so nobody is
  // left signed in without a row we wrote from the provider's own answer.
  const giveUp = async (why: MessageCode = 'signin_failed') => {
    await supabase.auth.signOut();
    return back(next, why);
  };

  // Which provider this sign-in went through. Our own sign-in link says; a link from before
  // GitLab existed says nothing and was GitHub.
  const rawProvider = url.searchParams.get('provider');
  const provider = rawProvider === null ? 'github' : parseProvider(rawProvider);
  if (!provider) return giveUp();

  // The account id comes from the sign-in provider's record of what GitHub or GitLab said,
  // never from profile fields the user can edit.
  const identity = accountIdentity(user, provider);
  if (!identity) return giveUp();
  // Without the provider's token we cannot ask who this is, so no person is created.
  if (!provider_token) return giveUp();

  let facts: AccountFacts;
  try {
    facts = provider === 'gitlab' ? await fetchGitlabFacts(provider_token, new Date()) : await fetchGithubFacts(provider_token);
  } catch (e) {
    if (e instanceof GithubUnavailableError) return giveUp('github_unavailable');
    if (e instanceof GitlabUnavailableError) return giveUp('gitlab_unavailable');
    throw e;
  }
  // The provider's own answer must be about the same account the session says it is.
  if (facts.accountId !== identity.accountId) return giveUp();

  // Whether this account has been here before, so a first sign-in can be told from a return.
  const before = await db.from('people').select('verified, provider').eq('id', user.id).maybeSingle();
  if (before.error) return giveUp();
  // One account per person: someone who joined with one provider keeps signing in with it.
  if (before.data && providerOf(before.data) !== provider) return giveUp(provider === 'gitlab' ? 'signin_use_github' : 'signin_use_gitlab');

  // Two letters from the hosting provider. Nothing finer than a country is kept.
  const country = countryCode(request.headers.get('x-vercel-ip-country'));
  const { verified, results } = checkEligibility(facts, new Date());
  const saved = await db.from('people').upsert({
    id: user.id,
    provider,
    github_id: provider === 'github' ? facts.accountId : null,
    gitlab_id: provider === 'gitlab' ? facts.accountId : null,
    handle: facts.handle,
    avatar_url: facts.avatarUrl,
    country,
    account_created_at: facts.accountCreatedAt,
    contributions_12mo: facts.contributions12mo,
    name: facts.name ?? null,
    bio: facts.bio ?? null,
    location: facts.location ?? null,
    repo_count: facts.repoCount ?? null,
    verified,
    failed_rules: results.filter((r) => !r.pass).map((r) => r.rule),
    checked_at: new Date().toISOString(),
  });
  if (saved.error) return giveUp();

  // Their public repositories and activity, for their profile. A slow provider never holds up the sign-in.
  const fresh = { id: user.id, provider, handle: facts.handle, github_id: provider === 'github' ? facts.accountId : null, gitlab_id: provider === 'gitlab' ? facts.accountId : null } as Person;
  await Promise.all([
    refreshRepos(fresh, { force: true, timeoutMs: 1500 }),
    refreshActivity(fresh, { force: true, timeoutMs: 2500, token: provider === 'github' ? provider_token : undefined }),
  ]);

  // What this browser backed before signing in becomes theirs.
  await claimSignals(db, visitorId(cookies), user.id);

  // Signing in joins the email list, as the sign-in button says, using the address the provider gave.
  // An address that unsubscribed stays off. Failing to add it never blocks the sign-in.
  const email = parseEmail(identity.email);
  const listed = email ? await addToList(db, { email, source: provider, personId: user.id, country }) : null;

  // What happened, for the organizer's page. The organizer's own sign-ins are not tied to page views.
  const who = { personId: user.id, organizer: provider === 'github' && isAdmin({ github_id: facts.accountId } as Person) };
  if (!before.data) await recordEvent(db, context, { ...who, kind: 'signed_in' });
  if (before.data?.verified !== verified) await recordEvent(db, context, { ...who, kind: verified ? 'checks_passed' : 'checks_failed' });
  if (listed?.status === 'new') await recordEvent(db, context, { ...who, kind: 'list_joined', subject: listed.id });
  return redirect(next);
};
