import type { APIContext } from 'astro';
import { rateKey } from './ratelimit';

/** The server-side key the one-day codes are made with. Empty when nothing is configured. */
export const VISITOR_KEY = String(import.meta.env.ANALYTICS_SALT ?? import.meta.env.SUPABASE_SECRET_KEY ?? '');

/** The requester's IP address, used only to compute a one-day code and then dropped. */
export function clientIp(context: Pick<APIContext, 'clientAddress' | 'request'>): string {
  try {
    return context.clientAddress;
  } catch {
    return context.request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '';
  }
}

/** Today's rate-limit key for whoever sent this request, or null when no key is configured. */
export function senderKey(context: Pick<APIContext, 'clientAddress' | 'request'>, now = new Date()): string | null {
  if (!VISITOR_KEY) return null;
  return rateKey(VISITOR_KEY, now.toISOString().slice(0, 10), clientIp(context));
}
