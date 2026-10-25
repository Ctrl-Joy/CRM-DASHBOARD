import { contactSchema, mergeContactsSchema } from '@crm/shared';
import { prisma } from '../lib/prisma';
import { badRequest, handler, parse } from '../lib/http';
import { me } from '../lib/auth';
import { scopeWhere } from '../lib/scope';
import { audit } from '../lib/audit';
import { resourceRouter } from '../lib/resource';
import { csvPicker, fullName, splitList, tagSelect, userSelect, withCustomFields } from '../lib/records';
import { decorateDeal } from '../services/forecast';
import { emit } from '../services/automation';
import { ai } from '../services/ai';

export const contactsRouter = resourceRouter({
  model: 'contact',
  entityType: 'contact',
  label: 'Contact',
  ownerField: 'ownerId',
  schema: contactSchema,
  include: {
    company: { select: { id: true, name: true } },
    owner: { select: userSelect },
    tags: { select: tagSelect },
  },
  list: {
    searchFields: ['firstName', 'lastName', 'email', 'phone', 'title', 'company.name'],
    filters: {
      status: 'enum', lifecycleStage: 'enum', source: 'enum', ownerId: 'id', companyId: 'id',
      createdAt: 'date', lastContactedAt: 'date',
    },
    sortable: ['firstName', 'lastName', 'email', 'title', 'lifecycleStage', 'status', 'createdAt', 'updatedAt', 'lastContactedAt', 'company.name'],
    defaultSort: { field: 'createdAt', order: 'desc' },
    tags: true,
  },
  statusField: 'lifecycleStage',
  csv: [
    { key: 'firstName', label: 'First name' }, { key: 'lastName', label: 'Last name' }, { key: 'email', label: 'Email' },
    { key: 'phone', label: 'Phone' }, { key: 'title', label: 'Title' },
    { key: 'company', label: 'Company', get: (r) => r.company?.name },
    { key: 'lifecycleStage', label: 'Lifecycle stage' }, { key: 'status', label: 'Status' }, { key: 'source', label: 'Source' },
    { key: 'owner', label: 'Owner', get: (r) => r.owner?.name },
    { key: 'tags', label: 'Tags', get: (r) => r.tags?.map((t: { name: string }) => t.name).join('; ') },
    { key: 'lastContactedAt', label: 'Last contacted' }, { key: 'createdAt', label: 'Created' },
  ],
  fromCsv: (row) => {
    const p = csvPicker(row);
    let first = p('first name', 'firstname', 'first');
    let last = p('last name', 'lastname', 'last', 'surname');
    const full = p('name', 'full name');
    if (!first && full) [first, last] = [full.split(' ')[0], full.split(' ').slice(1).join(' ') || undefined];
    return {
      firstName: first, lastName: last, email: p('email', 'email address'), phone: p('phone', 'mobile', 'phone number'),
      title: p('title', 'job title'), companyName: p('company', 'company name', 'organization'), source: p('source')?.toLowerCase().replace(/\s+/g, '_'),
      lifecycleStage: p('lifecycle stage', 'lifecycle')?.toLowerCase(), tags: splitList(p('tags')),
    };
  },
  prepare: async (data, { req, raw }) => {
    // Forms and CSV rows may carry a company name instead of an id: link or create it.
    const companyName = raw.companyName;
    if (!data.companyId && typeof companyName === 'string' && companyName.trim()) {
      const user = me(req);
      const existing = await prisma.company.findFirst({ where: { orgId: user.orgId, deletedAt: null, name: companyName.trim() } });
      data.companyId = existing?.id ?? (await prisma.company.create({ data: { orgId: user.orgId, name: companyName.trim(), ownerId: user.id } })).id;
    }
    return data;
  },
  afterCreate: async (row, req) => {
    await emit('contact.created', { orgId: row.orgId, actorId: me(req).id, entityType: 'contact', entity: row });
  },
  extend: (r, { findScoped }) => {
    // Likely duplicates: same email, or same full name.
    r.get('/duplicates', handler(async (req) => {
      const scope = await scopeWhere(me(req), 'ownerId');
      const rows = await prisma.contact.findMany({
        where: scope, select: { id: true, firstName: true, lastName: true, email: true, phone: true, createdAt: true, company: { select: { name: true } } },
        take: 5000,
      });
      const groups = new Map<string, typeof rows>();
      for (const c of rows) {
        const keys = [c.email && `email:${c.email.toLowerCase()}`, c.lastName && `name:${c.firstName.toLowerCase()} ${c.lastName.toLowerCase()}`].filter(Boolean) as string[];
        for (const k of keys) groups.set(k, [...(groups.get(k) ?? []), c]);
      }
      const seen = new Set<string>();
      const data = [...groups.entries()].filter(([, g]) => g.length > 1).map(([key, g]) => ({ reason: key.startsWith('email') ? 'Same email' : 'Same name', contacts: g }))
        .filter((g) => {
          const sig = g.contacts.map((c) => c.id).sort().join();
          if (seen.has(sig)) return false;
          seen.add(sig);
          return true;
        });
      return { data };
    }));

    // Merge a duplicate into a primary: re-link every related record, fill gaps, soft-delete the duplicate.
    r.post('/merge', handler(async (req) => {
      const { primaryId, duplicateId } = parse(mergeContactsSchema, req.body);
      if (primaryId === duplicateId) throw badRequest('Pick two different contacts');
      const [primary, dup] = await Promise.all([findScoped(req, primaryId), findScoped(req, duplicateId)]);
      const fill = Object.fromEntries(
        ['lastName', 'email', 'phone', 'title', 'companyId', 'source', 'lastContactedAt']
          .filter((k) => primary[k] == null && dup[k] != null).map((k) => [k, dup[k]]),
      );
      await prisma.$transaction([
        prisma.deal.updateMany({ where: { contactId: dup.id }, data: { contactId: primary.id } }),
        prisma.activity.updateMany({ where: { contactId: dup.id }, data: { contactId: primary.id } }),
        prisma.task.updateMany({ where: { contactId: dup.id }, data: { contactId: primary.id } }),
        prisma.ticket.updateMany({ where: { contactId: dup.id }, data: { contactId: primary.id } }),
        prisma.attachment.updateMany({ where: { contactId: dup.id }, data: { contactId: primary.id } }),
        prisma.contact.update({
          where: { id: primary.id },
          data: { ...fill, tags: { connect: (dup.tags as { id: string }[]).map((t) => ({ id: t.id })) } },
        }),
        prisma.contact.update({ where: { id: dup.id }, data: { deletedAt: new Date() } }),
      ]);
      await audit(req, 'merge', 'contact', primary.id, { merged: dup.id, name: fullName(dup as never) });
      return { ok: true, id: primary.id };
    }));

    // The 360° view: profile, company, deals, timeline, tasks, tickets, files, AI summary.
    r.get('/:id/overview', handler(async (req) => {
      const contact = await findScoped(req, req.params.id);
      const user = me(req);
      const [dealScope, actScope, taskScope, ticketScope] = await Promise.all([
        scopeWhere(user, 'ownerId'), scopeWhere(user, 'ownerId'), scopeWhere(user, 'assigneeId'), scopeWhere(user, 'assigneeId'),
      ]);
      const [deals, activities, tasks, tickets, attachments] = await Promise.all([
        prisma.deal.findMany({ where: { AND: [dealScope, { contactId: contact.id }] }, include: { stage: true, owner: { select: userSelect } }, orderBy: { createdAt: 'desc' } }),
        prisma.activity.findMany({ where: { AND: [actScope, { contactId: contact.id }] }, include: { owner: { select: userSelect }, deal: { select: { id: true, title: true } } }, orderBy: { createdAt: 'desc' }, take: 200 }),
        prisma.task.findMany({ where: { AND: [taskScope, { contactId: contact.id }] }, include: { assignee: { select: userSelect } }, orderBy: [{ status: 'asc' }, { dueDate: 'asc' }] }),
        prisma.ticket.findMany({ where: { AND: [ticketScope, { contactId: contact.id }] }, include: { assignee: { select: userSelect } }, orderBy: { createdAt: 'desc' } }),
        prisma.attachment.findMany({ where: { contactId: contact.id, orgId: user.orgId }, include: { uploadedBy: { select: userSelect } }, orderBy: { createdAt: 'desc' } }),
      ]);
      const openDeals = deals.filter((d) => d.status === 'open').sort((a, b) => b.stage.order - a.stage.order);
      const summary = await ai.summarizeTimeline({
        name: fullName(contact as never),
        activities: activities.filter((a) => a.type !== 'task'),
        openDeals: openDeals.map((d) => ({ title: d.title, value: d.value, stage: d.stage.name })),
        openTickets: tickets.filter((t) => ['open', 'pending'].includes(t.status)),
        openTasks: tasks.filter((t) => t.status !== 'done'),
      });
      return { contact: withCustomFields(contact), deals: deals.map(decorateDeal), activities, tasks, tickets, attachments, summary };
    }));
  },
});
