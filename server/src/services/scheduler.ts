import { prisma } from '../lib/prisma';
import { notify } from './notify';
import { deliverReport } from '../routes/insights';

// Lightweight in-process jobs. For multiple server instances, move these to a
// queue/cron worker so each job runs once.

async function taskReminders() {
  const due = await prisma.task.findMany({
    where: { deletedAt: null, reminded: false, status: { not: 'done' }, reminderAt: { lte: new Date() } }, take: 200,
  });
  for (const t of due) {
    await notify(t.orgId, t.assigneeId, { type: 'task_due', title: `Reminder: ${t.title}`, body: t.dueDate ? `Due ${t.dueDate.toISOString().slice(0, 10)}` : null, link: '/tasks' });
    await prisma.task.update({ where: { id: t.id }, data: { reminded: true } });
  }
}

const warnedTickets = new Set<string>();
async function slaWarnings() {
  const soon = new Date(Date.now() + 3600e3);
  const tickets = await prisma.ticket.findMany({ where: { deletedAt: null, status: { in: ['open', 'pending'] }, slaDueAt: { lte: soon } }, take: 200 });
  for (const t of tickets) {
    if (warnedTickets.has(t.id)) continue;
    warnedTickets.add(t.id);
    const breached = t.slaDueAt < new Date();
    await notify(t.orgId, t.assigneeId, { type: 'ticket', title: `${breached ? 'SLA breached' : 'SLA due within the hour'}: #${t.number}`, body: t.subject, link: `/tickets/${t.id}` });
  }
}

const PERIOD_MS: Record<string, number> = { daily: 864e5, weekly: 7 * 864e5, monthly: 30 * 864e5 };
async function scheduledReports() {
  const reports = await prisma.report.findMany({ where: { deletedAt: null, schedule: { not: 'none' } } });
  for (const r of reports) {
    const every = PERIOD_MS[r.schedule];
    if (every && (!r.lastSentAt || Date.now() - r.lastSentAt.getTime() >= every)) {
      await deliverReport(r.id).catch((err) => console.error(`[report ${r.id}]`, err));
    }
  }
}

export function startScheduler() {
  const run = (name: string, fn: () => Promise<void>) => () => fn().catch((err) => console.error(`[scheduler:${name}]`, err));
  const timers = [
    setInterval(run('reminders', taskReminders), 60_000),
    setInterval(run('sla', slaWarnings), 5 * 60_000),
    setInterval(run('reports', scheduledReports), 15 * 60_000),
  ];
  timers.forEach((t) => t.unref());
  return () => timers.forEach(clearInterval);
}
