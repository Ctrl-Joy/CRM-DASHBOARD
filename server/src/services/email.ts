// Outbound email behind a provider interface.
//
// With BREVO_API_KEY and EMAIL_FROM set, mail is delivered through Brevo's
// HTTPS API (no SMTP ports, so it works on hosts that block them). Without
// them, sends are only logged. Every send is recorded as an "email" activity
// by the caller either way.
import { prisma } from '../lib/prisma';
import { HttpError } from '../lib/http';
import { demoOrgId } from './demo';

export interface EmailMessage {
  /** The person sending. Replies go to them; the envelope sender is always EMAIL_FROM. */
  from: string; fromName?: string; replyTo?: string;
  to: string; subject: string; text: string;
  /** The workspace sending, used for the demo guard and the daily limit. */
  orgId?: string;
}
export interface EmailResult { id: string; delivered: boolean }
export interface EmailProvider { readonly name: string; send(msg: EmailMessage): Promise<EmailResult> }

function logOnly(msg: EmailMessage, why: string): EmailResult {
  const id = `${why}-${Date.now().toString(36)}`;
  if (process.env.NODE_ENV !== 'test') console.log(`[email:${why}] ${id} → ${msg.to} | ${msg.subject}`);
  return { id, delivered: false };
}

class ConsoleEmailProvider implements EmailProvider {
  readonly name = 'console';
  async send(msg: EmailMessage) { return logOnly(msg, 'dev'); }
}

const mask = (t: string) => t.replace(/[\w.+-]+@[\w.-]+/g, '<address>').slice(0, 220);
/** Outcome of the most recent real send since the server started, for the status check. */
let lastSend: { at: number; ok: boolean; note: string } | null = null;

export class BrevoEmailProvider implements EmailProvider {
  readonly name = 'brevo';
  constructor(private apiKey: string, private sender: string, private senderName: string, private dailyLimit: number) {}

  async send(msg: EmailMessage): Promise<EmailResult> {
    if (msg.orgId) {
      // The live demo is open to anyone, so it never sends real mail.
      if (msg.orgId === (await demoOrgId())) return logOnly(msg, 'demo');
      // Sign-up is open too: cap what one workspace can send in a day.
      const sent = await prisma.activity.count({ where: { orgId: msg.orgId, type: 'email', createdAt: { gte: new Date(Date.now() - 864e5) } } });
      if (sent >= this.dailyLimit) throw new HttpError(429, `This workspace has reached its limit of ${this.dailyLimit} emails in 24 hours. Try again later.`);
    }
    const replyTo = msg.replyTo ?? (msg.from.startsWith('no-reply@') ? undefined : msg.from);
    let res: Response;
    try {
      res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': this.apiKey, 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({
          sender: { email: this.sender, name: msg.fromName ? `${msg.fromName} via ${this.senderName}` : this.senderName },
          to: [{ email: msg.to }],
          ...(replyTo && { replyTo: { email: replyTo, ...(msg.fromName && { name: msg.fromName }) } }),
          subject: msg.subject || '(no subject)',
          textContent: msg.text || ' ',
        }),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (err) {
      console.error('[email:brevo] request failed:', (err as Error).message);
      lastSend = { at: Date.now(), ok: false, note: 'could not reach Brevo' };
      throw new HttpError(502, 'Could not reach the email service. Nothing was sent; try again in a moment.');
    }
    if (!res.ok) {
      const detail = (await res.json().catch(() => null)) as { message?: string } | null;
      console.error(`[email:brevo] ${res.status}: ${detail?.message ?? 'no detail'}`);
      lastSend = { at: Date.now(), ok: false, note: mask(`Brevo answered ${res.status}: ${detail?.message ?? 'no detail'}`) };
      throw new HttpError(502, res.status === 401
        ? 'The email service rejected the API key (BREVO_API_KEY). Nothing was sent.'
        : `The email service could not send this message${detail?.message ? `: ${detail.message}` : ''}. Nothing was sent.`);
    }
    const data = (await res.json().catch(() => ({}))) as { messageId?: string };
    lastSend = { at: Date.now(), ok: true, note: 'accepted by Brevo' };
    return { id: data.messageId ?? `brevo-${Date.now().toString(36)}`, delivered: true };
  }
}

function fromEnv(): EmailProvider {
  const { BREVO_API_KEY, EMAIL_FROM, EMAIL_FROM_NAME, EMAIL_DAILY_LIMIT, NODE_ENV } = process.env;
  if (NODE_ENV === 'test' || !BREVO_API_KEY || !EMAIL_FROM) return new ConsoleEmailProvider();
  return new BrevoEmailProvider(BREVO_API_KEY, EMAIL_FROM, EMAIL_FROM_NAME || 'Nexora', Number(EMAIL_DAILY_LIMIT) || 50);
}

export let emailProvider: EmailProvider = fromEnv();
export const setEmailProvider = (p: EmailProvider) => { emailProvider = p; };

// ---------- status (shown by /api/health, so a deploy can be checked without sending mail) ----------
let cached: { at: number; status: string } | null = null;

/** "off", "ready", or a short reason delivery would fail. Asks Brevo at most every 10 minutes. */
async function recentEvents(apiKey: string): Promise<string> {
  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/statistics/events?limit=20&days=1&sort=desc', { headers: { 'api-key': apiKey, accept: 'application/json' }, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) {
      const detail = (await res.json().catch(() => null)) as { message?: string } | null;
      return `events not readable (${res.status}${detail?.message ? `: ${mask(detail.message)}` : ''})`;
    }
    const { events = [] } = (await res.json()) as { events?: { event: string; reason?: string }[] };
    if (!events.length) return 'no email activity in Brevo in the last day';
    const counts: Record<string, number> = {};
    for (const e of events) counts[e.event] = (counts[e.event] ?? 0) + 1;
    const reason = events.find((e) => e.reason)?.reason;
    return `last day in Brevo: ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(', ')}${reason ? `; reason: ${mask(reason)}` : ''}`;
  } catch { return 'events not readable'; }
}

export async function emailStatus(): Promise<string> {
  const base = await keyStatus();
  if (base === 'off' || !process.env.BREVO_API_KEY) return base;
  const last = lastSend ? `; last send ${Math.round((Date.now() - lastSend.at) / 60000)} min ago: ${lastSend.ok ? 'ok' : 'FAILED'}, ${lastSend.note}` : '; no send since the server started';
  return `${base}${last}; ${await recentEvents(process.env.BREVO_API_KEY)}`;
}

async function keyStatus(): Promise<string> {
  const { BREVO_API_KEY, EMAIL_FROM } = process.env;
  if (!BREVO_API_KEY && !EMAIL_FROM) return 'off';
  if (!BREVO_API_KEY) return 'BREVO_API_KEY is not set';
  if (!EMAIL_FROM) return 'EMAIL_FROM is not set';
  if (cached && Date.now() - cached.at < 600_000) return cached.status;
  let status: string;
  try {
    const res = await fetch('https://api.brevo.com/v3/senders', { headers: { 'api-key': BREVO_API_KEY, accept: 'application/json' }, signal: AbortSignal.timeout(10_000) });
    if (res.status === 401) {
      const detail = (await res.clone().json().catch(() => null)) as { message?: string } | null;
      status = BREVO_API_KEY.startsWith('xsmtpsib-') ? 'BREVO_API_KEY is an SMTP key; an API key (xkeysib-) is needed'
        : `Brevo rejected BREVO_API_KEY${detail?.message ? `: ${detail.message.slice(0, 200)}` : ''}`;
    }
    // A key limited to sending can't list senders; that is not a failure.
    else if (res.status === 403) status = 'key accepted; sender not checked (this key cannot read account details)';
    else if (!res.ok) {
      const detail = (await res.json().catch(() => null)) as { message?: string } | null;
      status = `Brevo answered ${res.status}${detail?.message ? `: ${detail.message.slice(0, 200)}` : ''}`;
    }
    else {
      const { senders = [] } = (await res.json()) as { senders?: { email: string; active: boolean }[] };
      const sender = senders.find((x) => x.email.toLowerCase() === EMAIL_FROM.trim().toLowerCase());
      status = !sender ? 'EMAIL_FROM is not a sender in this Brevo account' : sender.active ? 'ready' : 'EMAIL_FROM is not verified in Brevo yet';
    }
  } catch { status = 'Brevo could not be reached'; }
  cached = { at: Date.now(), status };
  return status;
}
