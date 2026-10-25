// Outbound email behind a provider interface. The default provider only logs;
// swap in SMTP, SES, Resend, etc. by implementing EmailProvider and assigning
// it below. Every send is recorded as an "email" activity by the caller.

export interface EmailMessage { from: string; replyTo?: string; to: string; subject: string; text: string }
export interface EmailProvider { readonly name: string; send(msg: EmailMessage): Promise<{ id: string }> }

class ConsoleEmailProvider implements EmailProvider {
  readonly name = 'console';
  async send(msg: EmailMessage) {
    const id = `dev-${Date.now().toString(36)}`;
    if (process.env.NODE_ENV !== 'test') {
      console.log(`[email:${this.name}] ${id} → ${msg.to} | ${msg.subject}`);
    }
    return { id };
  }
}

export let emailProvider: EmailProvider = new ConsoleEmailProvider();
export const setEmailProvider = (p: EmailProvider) => { emailProvider = p; };
