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
      throw new HttpError(502, 'Could not reach the email service. Nothing was sent; try again in a moment.');
    }
    if (!res.ok) {
      const detail = (await res.json().catch(() => null)) as { message?: string } | null;
      console.error(`[email:brevo] ${res.status}: ${detail?.message ?? 'no detail'}`);
      throw new HttpError(502, res.status === 401
        ? 'The email service rejected the API key (BREVO_API_KEY). Nothing was sent.'
        : `The email service could not send this message${detail?.message ? `: ${detail.message}` : ''}. Nothing was sent.`);
    }
    const data = (await res.json().catch(() => ({}))) as { messageId?: string };
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
