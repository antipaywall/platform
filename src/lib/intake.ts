import type { MessageCode } from './respond';

type Bad = { ok: false; error: MessageCode };
/** A filled-in trap field. The caller answers as if it worked and saves nothing. */
type Spam = { ok: true; spam: true };

const oneLine = (v: unknown) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : '');
const text = (v: unknown) => (typeof v === 'string' ? v.trim().replace(/\r\n/g, '\n') : '');
const trapped = (v: unknown) => typeof v === 'string' && v.trim() !== '';

/** A lowercased address, or null. Deliberately simple: one @, something either side, a dot in the domain, no spaces. */
export function parseEmail(v: unknown): string | null {
  const email = typeof v === 'string' ? v.trim().toLowerCase() : '';
  if (email.length < 5 || email.length > 254) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ? email : null;
}

/** The "follow along" form: an email address, plus a field people never see. */
export function parseSubscribe(input: { email?: unknown; trap?: unknown }): { ok: true; spam: false; email: string } | Spam | Bad {
  if (trapped(input.trap)) return { ok: true, spam: true };
  const email = parseEmail(input.email);
  return email ? { ok: true, spam: false, email } : { ok: false, error: 'bad_email' };
}

/** A review panel application: why you, and any ties to builders or sponsors. */
export function parsePanel(input: { why?: unknown; ties?: unknown }): { ok: true; why: string; ties: string } | Bad {
  const why = text(input.why);
  const ties = text(input.ties);
  if (why.length < 1) return { ok: false, error: 'need_why' };
  if (why.length > 500 || ties.length > 500) return { ok: false, error: 'bad_note' };
  return { ok: true, why, ties };
}

/** An offer to help organize: what you can help with. */
export function parseOrganize(input: { note?: unknown }): { ok: true; note: string } | Bad {
  const note = text(input.note);
  if (note.length < 1) return { ok: false, error: 'need_note' };
  if (note.length > 500) return { ok: false, error: 'bad_note' };
  return { ok: true, note };
}

export const INQUIRY_KINDS = ['pool', 'bounty', 'unsure'] as const;
export type InquiryKind = (typeof INQUIRY_KINDS)[number];
export type SponsorInquiry = { company: string; contact: string; email: string; amountUsd: number | null; kind: InquiryKind; message: string };

/** A company asking about sponsoring. The amount is optional and in whole dollars. */
export function parseSponsorInquiry(input: {
  company?: unknown; contact?: unknown; email?: unknown; amount?: unknown; kind?: unknown; message?: unknown; trap?: unknown;
}): ({ ok: true; spam: false } & SponsorInquiry) | Spam | Bad {
  if (trapped(input.trap)) return { ok: true, spam: true };
  const company = oneLine(input.company);
  const contact = oneLine(input.contact);
  if (company.length < 1 || company.length > 120 || contact.length < 1 || contact.length > 120) return { ok: false, error: 'bad_inquiry' };
  const email = parseEmail(input.email);
  if (!email) return { ok: false, error: 'bad_email' };
  const rawAmount = oneLine(input.amount).replace(/^\$/, '').replace(/,/g, '');
  let amountUsd: number | null = null;
  if (rawAmount !== '') {
    if (!/^\d{1,8}$/.test(rawAmount)) return { ok: false, error: 'bad_inquiry' };
    amountUsd = Number(rawAmount);
    if (amountUsd < 1 || amountUsd > 10_000_000) return { ok: false, error: 'bad_inquiry' };
  }
  const kind = INQUIRY_KINDS.find((k) => k === input.kind) ?? 'unsure';
  const message = text(input.message);
  if (message.length > 1000) return { ok: false, error: 'bad_inquiry' };
  return { ok: true, spam: false, company, contact, email, amountUsd, kind, message };
}

/**
 * One CSV cell. Quotes are doubled and the cell is always quoted. A value that a
 * spreadsheet would run as a formula (it starts with =, +, - or @, or with a tab
 * or carriage return) gets a leading apostrophe so it is shown as text instead.
 */
export function csvCell(value: unknown): string {
  let s = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

export function toCsv(header: string[], rows: unknown[][]): string {
  return [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
