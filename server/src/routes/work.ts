import { Router } from 'express';
import { activitySchema, renderTemplate, sendEmailSchema, taskSchema } from '@crm/shared';
import { prisma } from '../lib/prisma';
import { badRequest, dateParam, handler, parse } from '../lib/http';
import { me } from '../lib/auth';
import { assertInOrg, scopeWhere } from '../lib/scope';
import { audit } from '../lib/audit';
import { resourceRouter, type Row } from '../lib/resource';
import { fullName, userSelect } from '../lib/records';
import { notify } from '../services/notify';
import { rescoreLead } from '../services/scoring';
import { emailProvider } from '../services/email';

const related = {
  contact: { select: { id: true, firstName: true, lastName: true } },
  deal: { select: { id: true, title: true } },
  company: { select: { id: true, name: true } },
};

/** Side effects of a completed touchpoint on the records it relates to. */
async function touch(a: Row) {
  if (!a.completed || a.type === 'note' || a.type === 'task') return;
  const at = a.completedAt ?? a.createdAt;
  if (a.contactId) await prisma.contact.update({ where: { id: a.contactId }, data: { lastContactedAt: at } });
  if (a.dealId) await prisma.deal.update({ where: { id: a.dealId }, data: { lastActivityAt: at } });
  if (a.leadId) {
    await prisma.lead.updateMany({ where: { id: a.leadId, firstResponseAt: null }, data: { firstResponseAt: at } });
    await prisma.lead.updateMany({ where: { id: a.leadId, status: 'new' }, data: { status: 'contacted' } });
    await rescoreLead(a.leadId);
  }
  if (a.ticketId) await prisma.ticket.updateMany({ where: { id: a.ticketId, firstResponseAt: null }, data: { firstResponseAt: at } });
}

export const activitiesRouter = resourceRouter({
  model: 'activity',
  entityType: 'activity',
  label: 'Activity',
  ownerField: 'ownerId',
  schema: activitySchema,
  include: { ...related, owner: { select: userSelect } },
  deletePermission: null,
  list: {
    searchFields: ['subject', 'body', 'emailTo'],
    filters: {
      type: 'enum', ownerId: 'id', contactId: 'id', dealId: 'id', companyId: 'id', leadId: 'id', ticketId: 'id',
      completed: 'bool', createdAt: 'date', dueAt: 'date',
    },
    sortable: ['createdAt', 'dueAt', 'type', 'subject'],
  },
  prepare: (data, { existing }) => {
    if (data.completed === true && !existing?.completed) data.completedAt = new Date();
    if (data.completed === false) data.completedAt = null;
    return data;
  },
  afterCreate: async (row) => touch(row),
  afterUpdate: async (row, before) => { if (row.completed && !before.completed) await touch(row); },
});

export const tasksRouter = resourceRouter({
  model: 'task',
  entityType: 'task',
  label: 'Task',
  ownerField: 'assigneeId',
  schema: taskSchema,
  include: { ...related, assignee: { select: userSelect } },
  deletePermission: null,
  statusField: 'status',
  list: {
    searchFields: ['title', 'description'],
    filters: {
      status: 'enum', priority: 'enum', assigneeId: 'id', contactId: 'id', dealId: 'id', companyId: 'id', leadId: 'id', ticketId: 'id',
      dueDate: 'date', createdAt: 'date',
    },
    sortable: ['dueDate', 'priority', 'status', 'title', 'createdAt'],
    defaultSort: { field: 'dueDate', order: 'asc' },
  },
  csv: [
    { key: 'title', label: 'Title' }, { key: 'status', label: 'Status' }, { key: 'priority', label: 'Priority' },
    { key: 'dueDate', label: 'Due' }, { key: 'assignee', label: 'Assignee', get: (r) => r.assignee?.name },
    { key: 'deal', label: 'Deal', get: (r) => r.deal?.title }, { key: 'contact', label: 'Contact', get: (r) => r.contact && fullName(r.contact) },
  ],
  prepare: (data, { req, existing }) => {
    if (!existing) data.createdById = me(req).id;
    if (data.status === 'done' && existing?.status !== 'done') data.completedAt = new Date();
    if (data.status && data.status !== 'done') data.completedAt = null;
    if (data.reminderAt !== undefined) data.reminded = false;
    return data;
  },
  afterCreate: async (row, req) => {
    await notify(row.orgId, row.assigneeId, { type: 'assignment', title: `New task: ${row.title}`, body: `from ${me(req).name}`, link: '/tasks' }, { skipUserId: me(req).id });
  },
  afterUpdate: async (row, before, req) => {
    if (row.assigneeId !== before.assigneeId) {
      await notify(row.orgId, row.assigneeId, { type: 'assignment', title: `Task assigned to you: ${row.title}`, link: '/tasks' }, { skipUserId: me(req).id });
    }
  },
});

// ---------- calendar: meetings, calls and tasks in a date range ----------
export const calendarRouter = Router();
calendarRouter.get('/', handler(async (req) => {
  const user = me(req);
  const from = dateParam(req.query.from) ?? new Date(Date.now() - 31 * 864e5);
  const to = dateParam(req.query.to) ?? new Date(Date.now() + 62 * 864e5);
  if (to.getTime() - from.getTime() > 400 * 864e5) throw badRequest('Date range is too large');
  const mine = req.query.mine === 'true';
  const [taskScope, actScope] = await Promise.all([scopeWhere(user, 'assigneeId'), scopeWhere(user, 'ownerId')]);
  const [tasks, activities] = await Promise.all([
    prisma.task.findMany({
      where: { AND: [taskScope, mine ? { assigneeId: user.id } : {}, { dueDate: { gte: from, lte: to } }] },
      include: { ...related, assignee: { select: userSelect } },
    }),
    prisma.activity.findMany({
      where: { AND: [actScope, mine ? { ownerId: user.id } : {}, { dueAt: { gte: from, lte: to } }] },
      include: { ...related, owner: { select: userSelect } },
    }),
  ]);
  return {
    data: [
      ...tasks.map((t) => ({
        id: t.id, kind: 'task' as const, type: 'task', title: t.title, start: t.dueDate, durationMin: null,
        done: t.status === 'done', priority: t.priority, owner: t.assignee, deal: t.deal, contact: t.contact,
      })),
      ...activities.map((a) => ({
        id: a.id, kind: 'activity' as const, type: a.type, title: a.subject, start: a.dueAt, durationMin: a.durationMin,
        done: a.completed, priority: null, owner: a.owner, deal: a.deal, contact: a.contact,
      })),
    ],
  };
}));

// ---------- email: compose with templates + merge tags, logged as activities ----------
export const emailRouter = Router();
emailRouter.post('/send', handler(async (req, res) => {
  const user = me(req);
  const input = parse(sendEmailSchema, req.body);
  await Promise.all([assertInOrg('contact', input.contactId, user.orgId), assertInOrg('deal', input.dealId, user.orgId), assertInOrg('lead', input.leadId, user.orgId)]);
  const [contact, deal, lead, sender] = await Promise.all([
    input.contactId ? prisma.contact.findUnique({ where: { id: input.contactId }, include: { company: true } }) : null,
    input.dealId ? prisma.deal.findUnique({ where: { id: input.dealId }, include: { company: true } }) : null,
    input.leadId ? prisma.lead.findUnique({ where: { id: input.leadId } }) : null,
    prisma.user.findUniqueOrThrow({ where: { id: user.id } }),
  ]);
  const person = contact ?? lead;
  const vars = {
    first_name: person?.firstName ?? '', last_name: person?.lastName ?? '', full_name: person ? fullName(person) : '',
    email: input.to, title: person?.title ?? '',
    company_name: contact?.company?.name ?? deal?.company?.name ?? lead?.companyName ?? '',
    deal_title: deal?.title ?? '', deal_value: deal ? deal.value.toLocaleString('en-US') : '',
    sender_name: sender.name, sender_email: sender.email,
  };
  const subject = renderTemplate(input.subject, vars);
  const body = renderTemplate(input.body, vars);
  const sent = await emailProvider.send({ from: sender.email, replyTo: sender.email, to: input.to, subject, text: body });
  const activity = await prisma.activity.create({
    data: {
      orgId: user.orgId, type: 'email', subject, body, emailTo: input.to, ownerId: user.id, completed: true, completedAt: new Date(),
      contactId: input.contactId, dealId: input.dealId, leadId: input.leadId, companyId: contact?.companyId ?? deal?.companyId ?? null,
    },
  });
  await touch(activity);
  await audit(req, 'send_email', 'activity', activity.id, { to: input.to, provider: emailProvider.name, messageId: sent.id });
  res.status(201);
  return { id: activity.id, provider: emailProvider.name, messageId: sent.id };
}));
