import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { leadSchema, publicLeadSchema, zMoney } from '@crm/shared';
import { prisma } from '../lib/prisma';
import { badRequest, handler, HttpError, json, parse } from '../lib/http';
import { me } from '../lib/auth';
import { audit } from '../lib/audit';
import { resourceRouter, type Row } from '../lib/resource';
import { csvPicker, fullName, userSelect } from '../lib/records';
import { rescoreLead, scoreLead } from '../services/scoring';
import { pickAssignee } from '../services/assignment';
import { notify } from '../services/notify';
import { emit } from '../services/automation';
import { ai } from '../services/ai';

const serializeLead = (row: Row) => ({ ...row, scoreBreakdown: json(row.scoreBreakdown, []) });

export const leadsRouter = resourceRouter({
  model: 'lead',
  entityType: 'lead',
  label: 'Lead',
  ownerField: 'ownerId',
  schema: leadSchema,
  include: { owner: { select: userSelect }, campaign: { select: { id: true, name: true } } },
  serialize: serializeLead,
  list: {
    searchFields: ['firstName', 'lastName', 'email', 'phone', 'companyName', 'title'],
    filters: { status: 'enum', source: 'enum', ownerId: 'id', campaignId: 'id', territory: 'enum', createdAt: 'date', score: 'number' },
    sortable: ['firstName', 'companyName', 'score', 'status', 'source', 'createdAt', 'assignedAt'],
    defaultSort: { field: 'createdAt', order: 'desc' },
  },
  statusField: 'status',
  csv: [
    { key: 'firstName', label: 'First name' }, { key: 'lastName', label: 'Last name' }, { key: 'email', label: 'Email' },
    { key: 'phone', label: 'Phone' }, { key: 'companyName', label: 'Company' }, { key: 'title', label: 'Title' },
    { key: 'source', label: 'Source' }, { key: 'status', label: 'Status' }, { key: 'score', label: 'Score' },
    { key: 'owner', label: 'Owner', get: (r) => r.owner?.name }, { key: 'createdAt', label: 'Created' },
  ],
  fromCsv: (row) => {
    const p = csvPicker(row);
    return {
      firstName: p('first name', 'firstname', 'first', 'name'), lastName: p('last name', 'lastname', 'last'),
      email: p('email'), phone: p('phone'), companyName: p('company', 'company name'), title: p('title', 'job title'),
      companySize: p('company size', 'size'), source: p('source')?.toLowerCase().replace(/\s+/g, '_') || undefined, territory: p('territory'),
    };
  },
  prepare: async (data, { existing, req, raw }) => {
    // "Auto-assign" in the form routes a new lead through the org's assignment rules.
    if (!existing && raw.autoAssign === true) {
      data.ownerId = (await pickAssignee(me(req).orgId, data.territory as string | null)) ?? data.ownerId;
    }
    if (!existing && data.ownerId) data.assignedAt = new Date();
    if (existing && data.ownerId !== undefined && data.ownerId !== existing.ownerId) data.assignedAt = data.ownerId ? new Date() : null;
    if (existing && data.status && data.status !== 'new' && !existing.firstResponseAt) data.firstResponseAt = new Date();
    return data;
  },
  afterCreate: async (row, req) => {
    await rescoreLead(row.id);
    await notify(row.orgId, row.ownerId, { type: 'assignment', title: `New lead: ${fullName(row as never)}`, link: `/leads/${row.id}` }, { skipUserId: me(req).id });
    await emit('lead.created', { orgId: row.orgId, actorId: me(req).id, entityType: 'lead', entity: row });
  },
  afterUpdate: async (row, before, req) => {
    await rescoreLead(row.id);
    if (row.ownerId !== before.ownerId) {
      await notify(row.orgId, row.ownerId, { type: 'assignment', title: `Lead assigned to you: ${fullName(row as never)}`, link: `/leads/${row.id}` }, { skipUserId: me(req).id });
    }
  },
  extend: (r, { findScoped }) => {
    r.get('/:id/insights', handler(async (req) => {
      const lead = await findScoped(req, req.params.id);
      const engagementCount = await prisma.activity.count({ where: { leadId: lead.id, deletedAt: null, type: { in: ['call', 'email', 'meeting'] } } });
      const { breakdown } = scoreLead({ ...lead, engagementCount } as never);
      return { ...(await ai.leadInsights({ ...lead, engagementCount } as never)), breakdown };
    }));

    const convertSchema = z.object({
      createDeal: z.boolean().default(true),
      dealTitle: z.string().trim().max(255).optional(),
      value: zMoney.optional(),
      pipelineId: z.string().optional(),
      stageId: z.string().optional(),
      expectedCloseDate: z.coerce.date().optional(),
    });

    // One-click conversion: lead → company (if named) + contact (+ deal).
    r.post('/:id/convert', handler(async (req) => {
      const user = me(req);
      const lead = await findScoped(req, req.params.id);
      if (lead.convertedAt) throw badRequest('This lead has already been converted');
      const input = parse(convertSchema, req.body ?? {});
      let pipelineId: string | undefined, stageId: string | undefined;
      if (input.createDeal) {
        const pipeline = await prisma.pipeline.findFirst({
          where: { orgId: user.orgId, deletedAt: null, ...(input.pipelineId ? { id: input.pipelineId } : { isDefault: true }) },
          include: { stages: { orderBy: { order: 'asc' } } },
        }) ?? await prisma.pipeline.findFirst({ where: { orgId: user.orgId, deletedAt: null }, include: { stages: { orderBy: { order: 'asc' } } } });
        if (!pipeline?.stages.length) throw badRequest('Create a pipeline before converting leads into deals');
        pipelineId = pipeline.id;
        stageId = input.stageId && pipeline.stages.some((s) => s.id === input.stageId) ? input.stageId : pipeline.stages[0].id;
      }
      const ownerId = lead.ownerId ?? user.id;
      const result = await prisma.$transaction(async (tx) => {
        let companyId: string | null = null;
        if (lead.companyName) {
          const existing = await tx.company.findFirst({ where: { orgId: user.orgId, deletedAt: null, name: lead.companyName } });
          companyId = existing?.id ?? (await tx.company.create({ data: { orgId: user.orgId, name: lead.companyName, size: lead.companySize, territory: lead.territory, ownerId } })).id;
        }
        const contact = await tx.contact.create({
          data: {
            orgId: user.orgId, firstName: lead.firstName, lastName: lead.lastName, email: lead.email, phone: lead.phone,
            title: lead.title, companyId, ownerId, source: lead.source, lifecycleStage: input.createDeal ? 'opportunity' : 'sql',
            lastContactedAt: lead.firstResponseAt,
          },
        });
        const deal = input.createDeal ? await tx.deal.create({
          data: {
            orgId: user.orgId, title: input.dealTitle || `${lead.companyName ?? fullName(lead as never)} deal`, value: input.value ?? 0,
            pipelineId: pipelineId!, stageId: stageId!, contactId: contact.id, companyId, ownerId, campaignId: lead.campaignId,
            expectedCloseDate: input.expectedCloseDate ?? null,
            stageHistory: { create: { toStageId: stageId!, changedById: user.id } },
          },
          include: { stage: true },
        }) : null;
        // Carry the lead's history over to the new records.
        for (const model of ['activity', 'task', 'attachment'] as const) {
          await (tx as any)[model].updateMany({ where: { leadId: lead.id }, data: { contactId: contact.id, ...(deal && { dealId: deal.id }) } });
        }
        await tx.lead.update({
          where: { id: lead.id },
          data: { status: 'qualified', convertedAt: new Date(), convertedContactId: contact.id, convertedDealId: deal?.id ?? null },
        });
        return { contact, deal, companyId };
      });
      await audit(req, 'convert', 'lead', lead.id, { contactId: result.contact.id, dealId: result.deal?.id ?? null });
      await emit('lead.converted', { orgId: user.orgId, actorId: user.id, entityType: 'lead', entity: { ...lead, status: 'qualified' } });
      if (result.deal) await emit('deal.created', { orgId: user.orgId, actorId: user.id, entityType: 'deal', entity: result.deal as never });
      return { contactId: result.contact.id, dealId: result.deal?.id ?? null, companyId: result.companyId };
    }));
  },
});

// ---------- public lead capture (website forms / integrations) ----------
export const publicLeadsRouter = Router();
const captureLimiter = rateLimit({ windowMs: 60_000, limit: process.env.NODE_ENV === 'test' ? 1000 : 20, standardHeaders: 'draft-7', legacyHeaders: false });

publicLeadsRouter.use((req, res, next) => {
  // Embeddable from any website; no cookies are read on these routes.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.sendStatus(204); return; }
  next();
});

publicLeadsRouter.get('/forms/:key', handler(async (req) => {
  const org = await prisma.organization.findUnique({ where: { leadApiKey: req.params.key }, select: { name: true } });
  if (!org) throw new HttpError(404, 'Form not found');
  return { organization: org.name };
}));

publicLeadsRouter.post('/leads/:key', captureLimiter, handler(async (req, res) => {
  const org = await prisma.organization.findUnique({ where: { leadApiKey: req.params.key } });
  if (!org) throw new HttpError(404, 'Unknown lead capture key');
  const input = parse(publicLeadSchema, req.body);
  const ownerId = await pickAssignee(org.id, null);
  const { score, breakdown } = scoreLead({ ...input, source: input.source ?? 'inbound_api' });
  const lead = await prisma.lead.create({
    data: {
      orgId: org.id, firstName: input.firstName, lastName: input.lastName, email: input.email, phone: input.phone,
      companyName: input.companyName, title: input.title, companySize: input.companySize, message: input.message,
      source: input.source ?? 'inbound_api', ownerId, assignedAt: ownerId ? new Date() : null,
      score, scoreBreakdown: JSON.stringify(breakdown),
    },
  });
  await notify(org.id, ownerId, { type: 'assignment', title: `New inbound lead: ${fullName(lead)} (score ${score})`, link: `/leads/${lead.id}` });
  await emit('lead.created', { orgId: org.id, actorId: null, entityType: 'lead', entity: lead });
  res.status(201);
  return { ok: true, id: lead.id };
}));
