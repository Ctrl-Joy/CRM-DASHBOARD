import type { NextBestAction } from '@crm/shared';
import type { AuthUser } from '../lib/auth';
import { prisma } from '../lib/prisma';
import { scopeWhere } from '../lib/scope';
import { fullName } from '../lib/records';
import { dealRisk, effectiveProbability, STALL_DAYS } from './forecast';
import { scoreLead } from './scoring';

// The AI layer sits behind this interface. The default provider is rule-based
// and runs locally; an LLM-backed provider can implement the same methods (for
// example, to write richer summaries) without touching any route.

export interface TimelineInput {
  name: string;
  activities: { type: string; subject: string; outcome: string | null; createdAt: Date; completed: boolean; dueAt: Date | null }[];
  openDeals: { title: string; value: number; stage: string }[];
  openTickets: { subject: string; priority: string }[];
  openTasks: { title: string; dueDate: Date | null }[];
}

export interface AIProvider {
  readonly name: string;
  nextBestActions(user: AuthUser, opts: { mineOnly: boolean; limit: number }): Promise<NextBestAction[]>;
  summarizeTimeline(input: TimelineInput): Promise<string>;
  leadInsights(lead: Parameters<typeof scoreLead>[0] & { status: string; createdAt: Date; firstResponseAt: Date | null }): Promise<{ score: number; suggestion: string }>;
}

const DAY = 864e5;
const money = (n: number) => '$' + Math.round(n).toLocaleString('en-US');
const daysAgo = (d: Date) => Math.max(0, Math.floor((Date.now() - d.getTime()) / DAY));
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
/** "3 hours" under two days, otherwise "4 days". */
const since = (d: Date) => {
  const h = Math.max(1, Math.round((Date.now() - d.getTime()) / 3600e3));
  return h < 48 ? plural(h, 'hour') : plural(Math.round(h / 24), 'day');
};

class HeuristicAIProvider implements AIProvider {
  readonly name = 'heuristic';

  async nextBestActions(user: AuthUser, { mineOnly, limit }: { mineOnly: boolean; limit: number }) {
    const now = new Date();
    const own = (field: string) => (mineOnly ? { [field]: user.id } : {});
    const [dealScope, taskScope, leadScope, ticketScope] = await Promise.all([
      scopeWhere(user, 'ownerId'), scopeWhere(user, 'assigneeId'), scopeWhere(user, 'ownerId'), scopeWhere(user, 'assigneeId'),
    ]);
    const [tasks, deals, leads, tickets] = await Promise.all([
      prisma.task.findMany({
        where: { AND: [taskScope, own('assigneeId'), { status: { not: 'done' }, dueDate: { lt: now } }] },
        orderBy: { dueDate: 'asc' }, take: 25,
        include: { deal: { select: { title: true } }, contact: { select: { firstName: true, lastName: true } } },
      }),
      prisma.deal.findMany({
        where: { AND: [dealScope, own('ownerId'), { status: 'open' }] },
        include: { stage: true, company: { select: { name: true } } }, take: 300,
      }),
      prisma.lead.findMany({
        where: { AND: [leadScope, own('ownerId'), { status: { in: ['new', 'contacted'] }, convertedAt: null }] },
        orderBy: { score: 'desc' }, take: 100,
      }),
      prisma.ticket.findMany({
        where: { AND: [ticketScope, own('assigneeId'), { status: { in: ['open', 'pending'] }, slaDueAt: { lt: new Date(now.getTime() + 4 * 3600e3) } }] },
        orderBy: { slaDueAt: 'asc' }, take: 25,
      }),
    ]);

    const out: NextBestAction[] = [];
    for (const t of tasks) {
      const days = daysAgo(t.dueDate!);
      const about = t.deal?.title ?? (t.contact ? fullName(t.contact) : null);
      out.push({
        id: `task-${t.id}`, kind: 'overdue_task', title: t.title,
        reason: `Overdue ${days ? `by ${plural(days, 'day')}` : 'today'}${about ? ` · ${about}` : ''}`,
        priority: 85 + Math.min(10, days) + (t.priority === 'urgent' ? 5 : t.priority === 'high' ? 3 : 0),
        link: t.dealId ? `/deals/${t.dealId}` : t.contactId ? `/contacts/${t.contactId}` : '/tasks',
        entity: { type: 'task', id: t.id },
      });
    }
    for (const tk of tickets) {
      const breached = tk.slaDueAt < now;
      out.push({
        id: `ticket-${tk.id}`, kind: 'sla_breach', title: `#${tk.number} ${tk.subject}`,
        reason: breached ? `SLA breached ${since(tk.slaDueAt)} ago` : 'SLA due within 4 hours',
        priority: breached ? 97 : 88, link: `/tickets/${tk.id}`, entity: { type: 'ticket', id: tk.id },
      });
    }
    const maxValue = Math.max(1, ...deals.map((d) => d.value));
    for (const d of deals) {
      const valueBoost = Math.round((d.value / maxValue) * 10);
      const company = d.company?.name ? ` · ${d.company.name}` : '';
      if (d.expectedCloseDate) {
        const days = Math.floor((d.expectedCloseDate.getTime() - now.getTime()) / DAY);
        if (days >= 0 && days <= 7) {
          out.push({
            id: `closing-${d.id}`, kind: 'closing_soon', title: d.title,
            reason: `Closes ${days === 0 ? 'today' : `in ${plural(days, 'day')}`} · ${money(d.value)} at ${effectiveProbability(d)}%${company}`,
            priority: 78 + valueBoost, link: `/deals/${d.id}`, entity: { type: 'deal', id: d.id },
          });
          continue;
        }
      }
      const idle = daysAgo(d.lastActivityAt ?? d.createdAt);
      if (idle >= STALL_DAYS) {
        out.push({
          id: `stalled-${d.id}`, kind: 'stalled_deal', title: d.title,
          reason: `No activity in ${idle} days while in ${d.stage.name} · ${money(d.value)}${company}`,
          priority: 65 + valueBoost, link: `/deals/${d.id}`, entity: { type: 'deal', id: d.id },
        });
        continue;
      }
      const risk = dealRisk(d);
      if (risk?.level === 'high') {
        out.push({
          id: `risk-${d.id}`, kind: 'at_risk', title: d.title, reason: risk.reasons.join(' · '),
          priority: 60 + valueBoost, link: `/deals/${d.id}`, entity: { type: 'deal', id: d.id },
        });
      }
    }
    for (const l of leads) {
      const waitingH = (now.getTime() - (l.assignedAt ?? l.createdAt).getTime()) / 3600e3;
      if (l.status === 'new' && !l.firstResponseAt && waitingH >= 1) {
        const waiting = waitingH < 24 ? plural(Math.floor(waitingH), 'hour') : plural(Math.floor(waitingH / 24), 'day');
        out.push({
          id: `lead-${l.id}`, kind: 'lead_follow_up', title: fullName(l) + (l.companyName ? ` (${l.companyName})` : ''),
          reason: `Score ${l.score} · waiting ${waiting} for a first response`,
          priority: 50 + Math.round(l.score / 3), link: `/leads/${l.id}`, entity: { type: 'lead', id: l.id },
        });
      }
    }
    return out.sort((a, b) => b.priority - a.priority).slice(0, limit);
  }

  async summarizeTimeline(input: TimelineInput) {
    const done = input.activities.filter((a) => a.completed);
    if (!done.length && !input.openDeals.length && !input.openTickets.length) {
      return `No activity with ${input.name} yet. Start with an introductory call or email.`;
    }
    const parts: string[] = [];
    const last = done[0];
    if (last) {
      const ago = daysAgo(last.createdAt);
      parts.push(`Last touch was ${ago === 0 ? 'today' : `${plural(ago, 'day')} ago`}: ${last.type} "${last.subject}"${last.outcome ? ` (${last.outcome.replace(/_/g, ' ')})` : ''}.`);
    }
    const recent = done.filter((a) => daysAgo(a.createdAt) <= 30);
    if (recent.length) {
      const counts = recent.reduce<Record<string, number>>((m, a) => ({ ...m, [a.type]: (m[a.type] ?? 0) + 1 }), {});
      parts.push(`${plural(recent.length, 'touchpoint')} in the last 30 days (${Object.entries(counts).map(([t, n]) => plural(n, t)).join(', ')}).`);
    } else if (last) {
      parts.push('No touchpoints in the last 30 days — this relationship is going cold.');
    }
    if (input.openDeals.length) {
      const total = input.openDeals.reduce((s, d) => s + d.value, 0);
      parts.push(`${plural(input.openDeals.length, 'open deal')} worth ${money(total)}, most advanced in ${input.openDeals[0].stage}.`);
    }
    if (input.openTickets.length) parts.push(`${plural(input.openTickets.length, 'open support ticket')}${input.openTickets.some((t) => t.priority === 'urgent' || t.priority === 'high') ? ', including high priority' : ''}.`);
    const upcoming = input.openTasks.filter((t) => t.dueDate).sort((a, b) => a.dueDate!.getTime() - b.dueDate!.getTime())[0];
    if (upcoming) parts.push(`Next step: "${upcoming.title}" due ${upcoming.dueDate!.toISOString().slice(0, 10)}.`);
    else if (input.openDeals.length) parts.push('Suggested next step: schedule a follow-up — no task is planned.');
    return parts.join(' ');
  }

  async leadInsights(lead: Parameters<AIProvider['leadInsights']>[0]) {
    const { score } = scoreLead(lead);
    let suggestion: string;
    if (lead.status === 'unqualified') suggestion = 'Marked unqualified — no action needed unless circumstances change.';
    else if (!lead.firstResponseAt && score >= 60) suggestion = 'High-fit lead with no response yet. Call within the hour — response speed drives conversion.';
    else if (!lead.firstResponseAt) suggestion = 'Send a short personalised intro email and log it.';
    else if (score >= 70 && lead.status !== 'qualified') suggestion = 'Strong fit and engaged. Qualify budget and timeline, then convert to a deal.';
    else if (score < 30) suggestion = 'Low fit. Add to a nurture campaign rather than spending rep time.';
    else suggestion = 'Keep engaging: book a discovery call to confirm need and authority.';
    return { score, suggestion };
  }
}

export const ai: AIProvider = new HeuristicAIProvider();
