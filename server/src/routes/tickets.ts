import { SLA_HOURS, ticketSchema } from '@crm/shared';
import { prisma } from '../lib/prisma';
import { me } from '../lib/auth';
import { resourceRouter } from '../lib/resource';
import { userSelect } from '../lib/records';
import { notify } from '../services/notify';
import { emit } from '../services/automation';

const slaDue = (from: Date, priority: string) => new Date(from.getTime() + (SLA_HOURS[priority as keyof typeof SLA_HOURS] ?? 24) * 3600e3);

export const ticketsRouter = resourceRouter({
  model: 'ticket',
  entityType: 'ticket',
  label: 'Ticket',
  ownerField: 'assigneeId',
  schema: ticketSchema,
  include: {
    contact: { select: { id: true, firstName: true, lastName: true, email: true } },
    company: { select: { id: true, name: true } },
    assignee: { select: userSelect },
  },
  statusField: 'status',
  list: {
    searchFields: ['subject', 'description', 'contact.firstName', 'contact.lastName', 'contact.email'],
    filters: { status: 'enum', priority: 'enum', channel: 'enum', assigneeId: 'id', contactId: 'id', companyId: 'id', createdAt: 'date', slaDueAt: 'date' },
    sortable: ['number', 'subject', 'priority', 'status', 'slaDueAt', 'createdAt', 'updatedAt'],
    defaultSort: { field: 'slaDueAt', order: 'asc' },
  },
  csv: [
    { key: 'number', label: 'Number' }, { key: 'subject', label: 'Subject' }, { key: 'status', label: 'Status' },
    { key: 'priority', label: 'Priority' }, { key: 'channel', label: 'Channel' },
    { key: 'contact', label: 'Contact', get: (r) => r.contact?.email }, { key: 'assignee', label: 'Assignee', get: (r) => r.assignee?.name },
    { key: 'slaDueAt', label: 'SLA due' }, { key: 'createdAt', label: 'Created' }, { key: 'resolvedAt', label: 'Resolved' },
  ],
  prepare: async (data, { req, existing }) => {
    if (!existing) {
      // Ticket numbers are sequential per organization.
      const org = await prisma.organization.update({ where: { id: me(req).orgId }, data: { ticketCounter: { increment: 1 } } });
      data.number = org.ticketCounter;
      data.slaDueAt = slaDue(new Date(), (data.priority as string) ?? 'normal');
      if (data.contactId && !data.companyId) {
        const c = await prisma.contact.findUnique({ where: { id: data.contactId as string }, select: { companyId: true } });
        data.companyId = c?.companyId ?? undefined;
      }
    } else {
      if (data.priority && data.priority !== existing.priority) data.slaDueAt = slaDue(existing.createdAt, data.priority as string);
      if (data.status && data.status !== 'open' && !existing.firstResponseAt) data.firstResponseAt = new Date();
      if (data.status === 'resolved' || data.status === 'closed') data.resolvedAt = existing.resolvedAt ?? new Date();
      else if (data.status) data.resolvedAt = null;
    }
    return data;
  },
  afterCreate: async (row, req) => {
    await notify(row.orgId, row.assigneeId, { type: 'ticket', title: `Ticket #${row.number} assigned to you`, body: row.subject, link: `/tickets/${row.id}` }, { skipUserId: me(req).id });
    await emit('ticket.created', { orgId: row.orgId, actorId: me(req).id, entityType: 'ticket', entity: row });
  },
  afterUpdate: async (row, before, req) => {
    if (row.assigneeId !== before.assigneeId) {
      await notify(row.orgId, row.assigneeId, { type: 'ticket', title: `Ticket #${row.number} assigned to you`, body: row.subject, link: `/tickets/${row.id}` }, { skipUserId: me(req).id });
    }
    if (row.status !== before.status) await emit('ticket.status_changed', { orgId: row.orgId, actorId: me(req).id, entityType: 'ticket', entity: row });
  },
});
