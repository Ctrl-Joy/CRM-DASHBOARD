import { Router } from 'express';
import { dealCloseSchema, dealSchema, pipelineSchema } from '@crm/shared';
import { prisma } from '../lib/prisma';
import { badRequest, handler, notFound, parse, str } from '../lib/http';
import { me, requirePermission } from '../lib/auth';
import { scopeWhere } from '../lib/scope';
import { audit } from '../lib/audit';
import { resourceRouter, type Row } from '../lib/resource';
import { buildListQuery, csvPicker, userSelect } from '../lib/records';
import { decorateDeal, effectiveProbability } from '../services/forecast';
import { notify } from '../services/notify';
import { emit } from '../services/automation';

const dealInclude = {
  stage: true,
  pipeline: { select: { id: true, name: true } },
  contact: { select: { id: true, firstName: true, lastName: true, email: true } },
  company: { select: { id: true, name: true } },
  owner: { select: userSelect },
};

const dealList = {
  searchFields: ['title', 'company.name', 'contact.firstName', 'contact.lastName'],
  filters: {
    status: 'enum', pipelineId: 'id', stageId: 'id', ownerId: 'id', companyId: 'id', contactId: 'id', campaignId: 'id',
    expectedCloseDate: 'date', closedAt: 'date', createdAt: 'date', value: 'number',
  },
  sortable: ['title', 'value', 'expectedCloseDate', 'createdAt', 'updatedAt', 'closedAt', 'stage.order', 'probability'],
  defaultSort: { field: 'createdAt', order: 'desc' },
} as const;

async function recordStageChange(deal: Row, fromStageId: string | null, actorId: string) {
  await prisma.dealStageHistory.create({ data: { dealId: deal.id, fromStageId, toStageId: deal.stageId, changedById: actorId } });
}

export const dealsRouter = resourceRouter({
  model: 'deal',
  entityType: 'deal',
  label: 'Deal',
  ownerField: 'ownerId',
  schema: dealSchema,
  include: dealInclude,
  serialize: (row) => decorateDeal(row as never),
  list: { ...dealList, filters: { ...dealList.filters } },
  csv: [
    { key: 'title', label: 'Title' }, { key: 'value', label: 'Value' }, { key: 'currency', label: 'Currency' },
    { key: 'pipeline', label: 'Pipeline', get: (r) => r.pipeline?.name }, { key: 'stage', label: 'Stage', get: (r) => r.stage?.name },
    { key: 'status', label: 'Status' }, { key: 'probability', label: 'Probability %', get: (r) => effectiveProbability(r as never) },
    { key: 'company', label: 'Company', get: (r) => r.company?.name },
    { key: 'contact', label: 'Contact', get: (r) => [r.contact?.firstName, r.contact?.lastName].filter(Boolean).join(' ') },
    { key: 'owner', label: 'Owner', get: (r) => r.owner?.name }, { key: 'expectedCloseDate', label: 'Expected close' },
    { key: 'lostReason', label: 'Lost reason' }, { key: 'createdAt', label: 'Created' }, { key: 'closedAt', label: 'Closed' },
  ],
  fromCsv: (row) => {
    const p = csvPicker(row);
    return { title: p('title', 'deal', 'name'), value: p('value', 'amount'), currency: p('currency')?.toUpperCase(), expectedCloseDate: p('expected close', 'close date') };
  },
  prepare: async (data, { req, existing }) => {
    const user = me(req);
    // CSV imports have no pipeline: use the default pipeline's first stage.
    if (!existing && !data.pipelineId) {
      const p = await prisma.pipeline.findFirst({ where: { orgId: user.orgId, deletedAt: null }, orderBy: { isDefault: 'desc' }, include: { stages: { orderBy: { order: 'asc' }, take: 1 } } });
      if (!p?.stages[0]) throw badRequest('Create a pipeline first');
      data.pipelineId = p.id;
      data.stageId = p.stages[0].id;
    }
    const pipelineId = (data.pipelineId ?? existing?.pipelineId) as string;
    const stageId = (data.stageId ?? existing?.stageId) as string;
    if (data.pipelineId !== undefined || data.stageId !== undefined) {
      const stage = await prisma.stage.findFirst({ where: { id: stageId, pipelineId, pipeline: { orgId: user.orgId } } });
      if (!stage) throw badRequest('That stage is not part of the selected pipeline');
    }
    if (existing && data.stageId && data.stageId !== existing.stageId) data.stageChangedAt = new Date();
    return data;
  },
  afterCreate: async (row, req) => {
    await recordStageChange(row, null, me(req).id);
    const full = await prisma.deal.findUniqueOrThrow({ where: { id: row.id }, include: dealInclude });
    await notify(row.orgId, row.ownerId, { type: 'assignment', title: `Deal assigned to you: ${row.title}`, link: `/deals/${row.id}` }, { skipUserId: me(req).id });
    await emit('deal.created', { orgId: row.orgId, actorId: me(req).id, entityType: 'deal', entity: full as never });
  },
  afterUpdate: async (row, before, req) => {
    const actor = me(req).id;
    if (row.stageId !== before.stageId) {
      await recordStageChange(row, before.stageId, actor);
      await notify(row.orgId, row.ownerId, {
        type: 'stage_change', title: `${row.title} moved to ${row.stage.name}`, body: `by ${me(req).name}`, link: `/deals/${row.id}`,
      }, { skipUserId: actor });
      await emit('deal.stage_changed', { orgId: row.orgId, actorId: actor, entityType: 'deal', entity: row });
    }
    if (row.ownerId !== before.ownerId) {
      await notify(row.orgId, row.ownerId, { type: 'assignment', title: `Deal assigned to you: ${row.title}`, link: `/deals/${row.id}` }, { skipUserId: actor });
    }
  },
  extend: (r, { findScoped }) => {
    // Kanban feed: open deals grouped by stage with live totals.
    r.get('/board', handler(async (req) => {
      const user = me(req);
      const pipeline = await prisma.pipeline.findFirst({
        where: { orgId: user.orgId, deletedAt: null, ...(str(req.query.pipelineId) ? { id: str(req.query.pipelineId) } : {}) },
        orderBy: { isDefault: 'desc' }, include: { stages: { orderBy: { order: 'asc' } } },
      });
      if (!pipeline) return { pipeline: null, stages: [] };
      const scope = await scopeWhere(user, 'ownerId');
      const q = buildListQuery(req, scope, { ...dealList, filters: { ownerId: 'id', companyId: 'id' } });
      const deals = await prisma.deal.findMany({
        where: { AND: [q.where, { pipelineId: pipeline.id, status: 'open' }] }, include: dealInclude, orderBy: [{ value: 'desc' }], take: 2000,
      });
      const decorated = deals.map(decorateDeal);
      return {
        pipeline: { id: pipeline.id, name: pipeline.name },
        stages: pipeline.stages.map((s) => {
          const ds = decorated.filter((d) => d.stageId === s.id);
          return { ...s, deals: ds, count: ds.length, value: ds.reduce((a, d) => a + d.value, 0), weighted: ds.reduce((a, d) => a + d.weightedValue, 0) };
        }),
      };
    }));

    // Weighted forecast by expected close month.
    r.get('/forecast', handler(async (req) => {
      const scope = await scopeWhere(me(req), 'ownerId');
      const deals = await prisma.deal.findMany({
        where: { AND: [scope, { status: 'open', ...(str(req.query.pipelineId) && { pipelineId: str(req.query.pipelineId) }) }] },
        include: { stage: true },
      });
      const months = new Map<string, { month: string; pipeline: number; weighted: number; bestCase: number; commit: number; count: number }>();
      for (const d of deals) {
        const key = d.expectedCloseDate ? d.expectedCloseDate.toISOString().slice(0, 7) : 'unscheduled';
        const m = months.get(key) ?? { month: key, pipeline: 0, weighted: 0, bestCase: 0, commit: 0, count: 0 };
        const p = effectiveProbability(d);
        m.pipeline += d.value; m.weighted += (d.value * p) / 100; m.count++;
        if (p >= 50) m.bestCase += d.value;
        if (p >= 75) m.commit += d.value;
        months.set(key, m);
      }
      return { data: [...months.values()].sort((a, b) => a.month.localeCompare(b.month)) };
    }));

    // Win / lose / reopen with reason capture.
    r.post('/:id/close', handler(async (req) => {
      const user = me(req);
      const deal = await findScoped(req, req.params.id);
      const { status, lostReason } = parse(dealCloseSchema, req.body);
      if (status === 'lost' && !lostReason) throw badRequest('Pick a reason for losing this deal');
      const updated = await prisma.deal.update({
        where: { id: deal.id },
        data: { status, lostReason: status === 'lost' ? lostReason : null, closedAt: status === 'open' ? null : new Date() },
        include: dealInclude,
      });
      if (status === 'won' && updated.contactId) {
        await prisma.contact.update({ where: { id: updated.contactId }, data: { lifecycleStage: 'customer' } });
      }
      await audit(req, status === 'open' ? 'reopen' : `mark_${status}`, 'deal', deal.id, { lostReason });
      if (status !== 'open') {
        await notify(user.orgId, updated.ownerId, { type: 'stage_change', title: `${updated.title} was marked ${status}`, link: `/deals/${deal.id}` }, { skipUserId: user.id });
        await emit(status === 'won' ? 'deal.won' : 'deal.lost', { orgId: user.orgId, actorId: user.id, entityType: 'deal', entity: updated as never });
      }
      return decorateDeal(updated);
    }));

    r.get('/:id/overview', handler(async (req) => {
      const deal = await findScoped(req, req.params.id);
      const [history, quotes, activities, tasks, attachments, pipeline] = await Promise.all([
        prisma.dealStageHistory.findMany({
          where: { dealId: deal.id }, orderBy: { changedAt: 'desc' },
          include: { fromStage: { select: { name: true } }, toStage: { select: { name: true } }, changedBy: { select: userSelect } },
        }),
        prisma.quote.findMany({ where: { dealId: deal.id, deletedAt: null }, include: { lineItems: { orderBy: { position: 'asc' } } }, orderBy: { createdAt: 'desc' } }),
        prisma.activity.findMany({ where: { dealId: deal.id, deletedAt: null }, include: { owner: { select: userSelect }, contact: { select: { id: true, firstName: true, lastName: true } } }, orderBy: { createdAt: 'desc' }, take: 200 }),
        prisma.task.findMany({ where: { dealId: deal.id, deletedAt: null }, include: { assignee: { select: userSelect } }, orderBy: [{ status: 'asc' }, { dueDate: 'asc' }] }),
        prisma.attachment.findMany({ where: { dealId: deal.id }, include: { uploadedBy: { select: userSelect } }, orderBy: { createdAt: 'desc' } }),
        prisma.pipeline.findUnique({ where: { id: deal.pipelineId }, include: { stages: { orderBy: { order: 'asc' } } } }),
      ]);
      return { deal: decorateDeal(deal as never), history, quotes, activities, tasks, attachments, stages: pipeline?.stages ?? [] };
    }));
  },
});

// ---------- pipelines & stages ----------
export const pipelinesRouter = Router();
const withStages = { stages: { orderBy: { order: 'asc' as const } } };

pipelinesRouter.get('/', handler(async (req) => ({
  data: await prisma.pipeline.findMany({ where: { orgId: me(req).orgId, deletedAt: null }, include: withStages, orderBy: [{ isDefault: 'desc' }, { name: 'asc' }] }),
})));

pipelinesRouter.post('/', requirePermission('pipelines:manage'), handler(async (req, res) => {
  const input = parse(pipelineSchema, req.body);
  const orgId = me(req).orgId;
  const isDefault = !(await prisma.pipeline.count({ where: { orgId, deletedAt: null } }));
  const pipeline = await prisma.pipeline.create({
    data: { orgId, name: input.name, isDefault, stages: { create: input.stages.map((s, i) => ({ name: s.name, probability: s.probability, order: i })) } },
    include: withStages,
  });
  await audit(req, 'create', 'pipeline', pipeline.id);
  res.status(201);
  return pipeline;
}));

// Replace the stage list: update kept stages, create new ones, delete removed
// ones (only when no deals sit in them).
pipelinesRouter.put('/:id', requirePermission('pipelines:manage'), handler(async (req) => {
  const pipeline = await prisma.pipeline.findFirst({ where: { id: req.params.id, orgId: me(req).orgId, deletedAt: null }, include: withStages });
  if (!pipeline) throw notFound('Pipeline');
  const input = parse(pipelineSchema, req.body);
  const keep = new Set(input.stages.map((s) => s.id).filter(Boolean));
  const removed = pipeline.stages.filter((s) => !keep.has(s.id));
  for (const s of removed) {
    const n = await prisma.deal.count({ where: { stageId: s.id, deletedAt: null } });
    if (n) throw badRequest(`Move the ${n} deal${n === 1 ? '' : 's'} out of "${s.name}" before removing it`);
  }
  await prisma.$transaction([
    prisma.pipeline.update({ where: { id: pipeline.id }, data: { name: input.name } }),
    prisma.stage.deleteMany({ where: { id: { in: removed.map((s) => s.id) } } }),
    ...input.stages.map((s, i) => s.id && pipeline.stages.some((x) => x.id === s.id)
      ? prisma.stage.update({ where: { id: s.id }, data: { name: s.name, probability: s.probability, order: i } })
      : prisma.stage.create({ data: { pipelineId: pipeline.id, name: s.name, probability: s.probability, order: i } })),
  ]);
  await audit(req, 'update', 'pipeline', pipeline.id, { stages: input.stages.map((s) => `${s.name} (${s.probability}%)`) });
  return prisma.pipeline.findUniqueOrThrow({ where: { id: pipeline.id }, include: withStages });
}));

pipelinesRouter.post('/:id/default', requirePermission('pipelines:manage'), handler(async (req) => {
  const orgId = me(req).orgId;
  const pipeline = await prisma.pipeline.findFirst({ where: { id: req.params.id, orgId, deletedAt: null } });
  if (!pipeline) throw notFound('Pipeline');
  await prisma.$transaction([
    prisma.pipeline.updateMany({ where: { orgId }, data: { isDefault: false } }),
    prisma.pipeline.update({ where: { id: pipeline.id }, data: { isDefault: true } }),
  ]);
  return { ok: true };
}));

pipelinesRouter.delete('/:id', requirePermission('pipelines:manage'), handler(async (req) => {
  const pipeline = await prisma.pipeline.findFirst({ where: { id: req.params.id, orgId: me(req).orgId, deletedAt: null } });
  if (!pipeline) throw notFound('Pipeline');
  const n = await prisma.deal.count({ where: { pipelineId: pipeline.id, deletedAt: null } });
  if (n) throw badRequest(`This pipeline still has ${n} deal${n === 1 ? '' : 's'}`);
  await prisma.pipeline.update({ where: { id: pipeline.id }, data: { deletedAt: new Date(), isDefault: false } });
  await audit(req, 'delete', 'pipeline', pipeline.id);
  return { ok: true };
}));
