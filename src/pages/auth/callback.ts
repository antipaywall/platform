import type { APIRoute } from 'astro';
import { countryCode } from '../../lib/analytics';
import { checkEligibility } from '../../lib/eligibility';
import { fetchGithubFacts, GithubUnavailableError } from '../../lib/github';
import { githubIdentity } from '../../lib/identity';
import { parseEmail } from '../../lib/intake';
import { addToList } from '../../lib/list';
import { back, safeNext, type MessageCode } from '../../lib/respond';
import { adminClient, sessionClient } from '../../lib/supabase';

export const GET: APIRoute = async ({ request, cookies, url, redirect }) => {
  const next = safeNext(url.searchParams.get('next'));
  const code = url.searchParams.get('code');
  const supabase = sessionClient(request, cookies);
  const db = adminClient();
  if (!code || !supabase || !db) return back(next, 'signin_failed');

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.session) return back(next, 'signin_failed');
  const { user, provider_token } = data.session;

  // Any way out that does not end in a saved person also ends the session, so nobody is
  // left signed in without a row we wrote from GitHub's own answer.
  const giveUp = async (why: MessageCode = 'signin_failed') => {
    await supabase.auth.signOut();
    return back(next, why);
  };

  // Only a GitHub sign-in counts, and the account id comes from the sign-in provider's
  // record of what GitHub said, never from profile fields the user can edit.
  const identity = githubIdentity(user);
  if (!identity) return giveUp();
  // Without GitHub's token we cannot ask GitHub who this is, so no person is created.
  if (!provider_token) return giveUp();

  let facts;
  try {
    facts = await fetchGithubFacts(provider_token);
  } catch (e) {
    if (!(e instanceof GithubUnavailableError)) throw e;
    return giveUp('github_unavailable');
  }
  // GitHub's own answer must be about the same account the session says it is.
  if (facts.githubId !== identity.githubId) return giveUp();

  // Two letters from the hosting provider. Nothing finer than a country is kept.
  const country = countryCode(request.headers.get('x-vercel-ip-country'));
  const { verified, results } = checkEligibility(facts, new Date());
  const saved = await db.from('people').upsert({
    id: user.id,
    github_id: facts.githubId,
    handle: facts.handle,
    avatar_url: facts.avatarUrl,
    country,
    account_created_at: facts.accountCreatedAt,
    contributions_12mo: facts.contributions12mo,
    verified,
    failed_rules: results.filter((r) => !r.pass).map((r) => r.rule),
    checked_at: new Date().toISOString(),
  });
  if (saved.error) return giveUp();

  // Signing in joins the email list, as the sign-in button says, using the address GitHub gave.
  // An address that unsubscribed stays off. Failing to add it never blocks the sign-in.
  const email = parseEmail(identity.email);
  if (email) await addToList(db, { email, source: 'github', personId: user.id, country });
  return redirect(next);
};
