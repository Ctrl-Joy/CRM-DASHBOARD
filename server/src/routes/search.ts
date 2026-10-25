import { Router } from 'express';
import type { SearchResult } from '@crm/shared';
import { prisma } from '../lib/prisma';
import { handler, str } from '../lib/http';
import { me } from '../lib/auth';
import { scopeWhere } from '../lib/scope';
import { fullName } from '../lib/records';
import { ai } from '../services/ai';

export const searchRouter = Router();

// Command-palette search across every record type the user can see.
searchRouter.get('/', handler(async (req) => {
  const q = str(req.query.q)?.trim();
  if (!q || q.length < 2) return { data: [] };
  const user = me(req);
  const [own, assign] = await Promise.all([scopeWhere(user, 'ownerId'), scopeWhere(user, 'assigneeId')]);
  const c = { contains: q };
  const take = 5;
  const [contacts, companies, leads, deals, tickets, tasks] = await Promise.all([
    prisma.contact.findMany({ where: { AND: [own, { OR: [{ firstName: c }, { lastName: c }, { email: c }, { phone: c }] }] }, take, include: { company: { select: { name: true } } } }),
    prisma.company.findMany({ where: { AND: [own, { OR: [{ name: c }, { domain: c }] }] }, take }),
    prisma.lead.findMany({ where: { AND: [own, { convertedAt: null, OR: [{ firstName: c }, { lastName: c }, { email: c }, { companyName: c }] }] }, take }),
    prisma.deal.findMany({ where: { AND: [own, { title: c }] }, take, include: { stage: { select: { name: true } } } }),
    prisma.ticket.findMany({ where: { AND: [assign, { OR: [{ subject: c }, ...(Number.isInteger(Number(q)) ? [{ number: Number(q) }] : [])] }] }, take }),
    prisma.task.findMany({ where: { AND: [assign, { title: c, status: { not: 'done' } }] }, take }),
  ]);
  const data: SearchResult[] = [
    ...contacts.map((x) => ({ type: 'contact' as const, id: x.id, title: fullName(x), subtitle: [x.email, x.company?.name].filter(Boolean).join(' · ') || null, link: `/contacts/${x.id}` })),
    ...companies.map((x) => ({ type: 'company' as const, id: x.id, title: x.name, subtitle: x.domain, link: `/companies/${x.id}` })),
    ...deals.map((x) => ({ type: 'deal' as const, id: x.id, title: x.title, subtitle: `${x.status === 'open' ? x.stage.name : x.status} · $${x.value.toLocaleString('en-US')}`, link: `/deals/${x.id}` })),
    ...leads.map((x) => ({ type: 'lead' as const, id: x.id, title: fullName(x), subtitle: [x.companyName, `score ${x.score}`].filter(Boolean).join(' · '), link: `/leads/${x.id}` })),
    ...tickets.map((x) => ({ type: 'ticket' as const, id: x.id, title: `#${x.number} ${x.subject}`, subtitle: x.status, link: `/tickets/${x.id}` })),
    ...tasks.map((x) => ({ type: 'task' as const, id: x.id, title: x.title, subtitle: x.dueDate ? `due ${x.dueDate.toISOString().slice(0, 10)}` : null, link: '/tasks' })),
  ];
  return { data };
}));

export const aiRouter = Router();
aiRouter.get('/next-actions', handler(async (req) => ({
  provider: ai.name,
  data: await ai.nextBestActions(me(req), { mineOnly: req.query.scope !== 'team', limit: Math.min(50, Number(req.query.limit) || 15) }),
})));
