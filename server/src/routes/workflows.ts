import { Router } from 'express';
import { workflowSchema } from '@crm/shared';
import { prisma } from '../lib/prisma';
import { handler, json, notFound, parse } from '../lib/http';
import { me, requirePermission } from '../lib/auth';
import { audit } from '../lib/audit';

export const workflowsRouter = Router();
const ser = (w: { conditions: string; actions: string }) => ({ ...w, conditions: json(w.conditions, []), actions: json(w.actions, []) });

async function find(req: Parameters<typeof me>[0]) {
  const wf = await prisma.workflow.findFirst({ where: { id: req.params.id, orgId: me(req).orgId, deletedAt: null } });
  if (!wf) throw notFound('Workflow');
  return wf;
}

workflowsRouter.get('/', handler(async (req) => ({
  data: (await prisma.workflow.findMany({ where: { orgId: me(req).orgId, deletedAt: null }, orderBy: { createdAt: 'desc' } })).map(ser),
})));

workflowsRouter.get('/:id/runs', handler(async (req) => {
  const wf = await find(req);
  return { data: await prisma.workflowRun.findMany({ where: { workflowId: wf.id }, orderBy: { createdAt: 'desc' }, take: 50 }) };
}));

workflowsRouter.post('/', requirePermission('workflows:manage'), handler(async (req, res) => {
  const input = parse(workflowSchema, req.body);
  const wf = await prisma.workflow.create({
    data: { ...input, orgId: me(req).orgId, createdById: me(req).id, conditions: JSON.stringify(input.conditions), actions: JSON.stringify(input.actions) },
  });
  await audit(req, 'create', 'workflow', wf.id);
  res.status(201);
  return ser(wf);
}));

workflowsRouter.put('/:id', requirePermission('workflows:manage'), handler(async (req) => {
  const wf = await find(req);
  const input = parse(workflowSchema, req.body);
  const updated = await prisma.workflow.update({
    where: { id: wf.id },
    data: { ...input, conditions: JSON.stringify(input.conditions), actions: JSON.stringify(input.actions) },
  });
  await audit(req, 'update', 'workflow', wf.id, { name: input.name, active: input.active });
  return ser(updated);
}));

workflowsRouter.patch('/:id/active', requirePermission('workflows:manage'), handler(async (req) => {
  const wf = await find(req);
  const updated = await prisma.workflow.update({ where: { id: wf.id }, data: { active: !!req.body?.active } });
  return ser(updated);
}));

workflowsRouter.delete('/:id', requirePermission('workflows:manage'), handler(async (req) => {
  const wf = await find(req);
  await prisma.workflow.update({ where: { id: wf.id }, data: { deletedAt: new Date(), active: false } });
  await audit(req, 'delete', 'workflow', wf.id);
  return { ok: true };
}));
