import { companySchema } from '@crm/shared';
import { prisma } from '../lib/prisma';
import { handler } from '../lib/http';
import { me } from '../lib/auth';
import { scopeWhere } from '../lib/scope';
import { resourceRouter } from '../lib/resource';
import { csvPicker, splitList, tagSelect, userSelect, withCustomFields } from '../lib/records';
import { decorateDeal } from '../services/forecast';

const alive = { where: { deletedAt: null } };

export const companiesRouter = resourceRouter({
  model: 'company',
  entityType: 'company',
  label: 'Company',
  ownerField: 'ownerId',
  schema: companySchema,
  include: {
    owner: { select: userSelect },
    tags: { select: tagSelect },
    _count: { select: { contacts: alive, deals: alive } },
  },
  list: {
    searchFields: ['name', 'domain', 'industry', 'phone', 'territory'],
    filters: { industry: 'enum', size: 'enum', ownerId: 'id', territory: 'enum', createdAt: 'date' },
    sortable: ['name', 'industry', 'size', 'createdAt', 'updatedAt', 'territory'],
    defaultSort: { field: 'name', order: 'asc' },
    tags: true,
  },
  csv: [
    { key: 'name', label: 'Name' }, { key: 'domain', label: 'Domain' }, { key: 'industry', label: 'Industry' },
    { key: 'size', label: 'Size' }, { key: 'phone', label: 'Phone' }, { key: 'address', label: 'Address' },
    { key: 'territory', label: 'Territory' },
    { key: 'owner', label: 'Owner', get: (r) => r.owner?.name },
    { key: 'tags', label: 'Tags', get: (r) => r.tags?.map((t: { name: string }) => t.name).join('; ') },
    { key: 'createdAt', label: 'Created' },
  ],
  fromCsv: (row) => {
    const p = csvPicker(row);
    return {
      name: p('name', 'company', 'company name'), domain: p('domain', 'website'), industry: p('industry'),
      size: p('size', 'company size', 'employees'), phone: p('phone'), address: p('address'), territory: p('territory', 'region'),
      tags: splitList(p('tags')),
    };
  },
  extend: (r, { findScoped }) => {
    // Everything about a company on one screen.
    r.get('/:id/overview', handler(async (req) => {
      const company = await findScoped(req, req.params.id);
      const user = me(req);
      const [dealScope, actScope, taskScope, ticketScope] = await Promise.all([
        scopeWhere(user, 'ownerId'), scopeWhere(user, 'ownerId'), scopeWhere(user, 'assigneeId'), scopeWhere(user, 'assigneeId'),
      ]);
      const [contacts, deals, activities, tasks, tickets, attachments] = await Promise.all([
        prisma.contact.findMany({ where: { companyId: company.id, deletedAt: null, orgId: user.orgId }, orderBy: { firstName: 'asc' }, include: { owner: { select: userSelect } } }),
        prisma.deal.findMany({ where: { AND: [dealScope, { companyId: company.id }] }, include: { stage: true, owner: { select: userSelect } }, orderBy: { createdAt: 'desc' } }),
        prisma.activity.findMany({ where: { AND: [actScope, { companyId: company.id }] }, include: { owner: { select: userSelect }, contact: { select: { id: true, firstName: true, lastName: true } } }, orderBy: { createdAt: 'desc' }, take: 100 }),
        prisma.task.findMany({ where: { AND: [taskScope, { companyId: company.id, status: { not: 'done' } }] }, include: { assignee: { select: userSelect } }, orderBy: { dueDate: 'asc' } }),
        prisma.ticket.findMany({ where: { AND: [ticketScope, { companyId: company.id }] }, orderBy: { createdAt: 'desc' } }),
        prisma.attachment.findMany({ where: { companyId: company.id, orgId: user.orgId }, include: { uploadedBy: { select: userSelect } }, orderBy: { createdAt: 'desc' } }),
      ]);
      return {
        company: withCustomFields(company),
        contacts, deals: deals.map(decorateDeal), activities, tasks, tickets, attachments,
      };
    }));
  },
});
