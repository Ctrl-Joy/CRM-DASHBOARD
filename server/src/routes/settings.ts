import { Router } from 'express';
import {
  ALL_PERMISSIONS, customFieldSchema, emailTemplateSchema, orgSettingsSchema, resolveRolePermissions, rolePermissionsSchema,
  savedViewSchema, tagSchema, PERMISSIONS,
} from '@crm/shared';
import { prisma } from '../lib/prisma';
import { can, me, requirePermission } from '../lib/auth';
import { badRequest, forbidden, handler, json, notFound, pagination, parse, str } from '../lib/http';
import { audit, diff } from '../lib/audit';
import { userSelect } from '../lib/records';
import { newApiKey } from '../services/setup';

export const settingsRouter = Router();

// ---------- organization ----------
settingsRouter.get('/org', handler(async (req) => {
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: me(req).orgId } });
  const admin = can(me(req), 'settings:manage');
  return {
    id: org.id, name: org.name, currency: org.currency, currencies: org.currencies.split(','),
    fiscalYearStartMonth: org.fiscalYearStartMonth, autoAssignLeads: org.autoAssignLeads, assignmentMode: org.assignmentMode,
    ...(admin && { leadApiKey: org.leadApiKey }),
  };
}));

settingsRouter.patch('/org', requirePermission('settings:manage'), handler(async (req) => {
  const input = parse(orgSettingsSchema, req.body);
  const before = await prisma.organization.findUniqueOrThrow({ where: { id: me(req).orgId } });
  const currencies = input.currencies ? [...new Set([...(input.currency ? [input.currency] : []), ...input.currencies])] : undefined;
  const org = await prisma.organization.update({
    where: { id: before.id },
    data: { ...input, currencies: currencies?.join(',') },
  });
  await audit(req, 'update', 'organization', org.id, diff(before, org));
  return { ok: true };
}));

settingsRouter.post('/org/lead-api-key', requirePermission('settings:manage'), handler(async (req) => {
  const org = await prisma.organization.update({ where: { id: me(req).orgId }, data: { leadApiKey: newApiKey() } });
  await audit(req, 'rotate_key', 'organization', org.id);
  return { leadApiKey: org.leadApiKey };
}));

// ---------- roles & permissions ----------
settingsRouter.get('/roles', handler(async (req) => {
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: me(req).orgId } });
  return { permissions: PERMISSIONS, roles: resolveRolePermissions(json(org.rolePermissions, null)) };
}));

settingsRouter.put('/roles', requirePermission('users:manage'), handler(async (req) => {
  const input = parse(rolePermissionsSchema, req.body);
  const roles = { rep: input.rep, manager: input.manager, admin: ALL_PERMISSIONS };
  await prisma.organization.update({ where: { id: me(req).orgId }, data: { rolePermissions: JSON.stringify({ rep: input.rep, manager: input.manager }) } });
  await audit(req, 'update', 'roles', me(req).orgId, input);
  return { roles };
}));

// ---------- custom fields ----------
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40) || 'field';
const serField = (f: { options: string }) => ({ ...f, options: json<string[]>(f.options, []) });

settingsRouter.get('/custom-fields', handler(async (req) => ({
  data: (await prisma.customField.findMany({
    where: { orgId: me(req).orgId, ...(str(req.query.entityType) && { entityType: str(req.query.entityType) }) },
    orderBy: [{ entityType: 'asc' }, { order: 'asc' }],
  })).map(serField),
})));

settingsRouter.post('/custom-fields', requirePermission('settings:manage'), handler(async (req, res) => {
  const input = parse(customFieldSchema, req.body);
  if (input.type === 'select' && !input.options.length) throw badRequest('Add at least one option');
  const orgId = me(req).orgId;
  let key = slug(input.label);
  for (let i = 2; await prisma.customField.findUnique({ where: { orgId_entityType_key: { orgId, entityType: input.entityType, key } } }); i++) key = `${slug(input.label)}_${i}`;
  const count = await prisma.customField.count({ where: { orgId, entityType: input.entityType } });
  const field = await prisma.customField.create({ data: { ...input, key, orgId, order: count, options: JSON.stringify(input.options) } });
  await audit(req, 'create', 'custom_field', field.id);
  res.status(201);
  return serField(field);
}));

settingsRouter.patch('/custom-fields/:id', requirePermission('settings:manage'), handler(async (req) => {
  const field = await prisma.customField.findFirst({ where: { id: req.params.id, orgId: me(req).orgId } });
  if (!field) throw notFound('Field');
  const input = parse(customFieldSchema.omit({ entityType: true }).partial(), req.body);
  const updated = await prisma.customField.update({
    where: { id: field.id },
    data: { ...input, options: input.options ? JSON.stringify(input.options) : undefined },
  });
  await audit(req, 'update', 'custom_field', field.id, diff(field, updated));
  return serField(updated);
}));

settingsRouter.delete('/custom-fields/:id', requirePermission('settings:manage'), handler(async (req) => {
  const field = await prisma.customField.findFirst({ where: { id: req.params.id, orgId: me(req).orgId } });
  if (!field) throw notFound('Field');
  await prisma.customField.delete({ where: { id: field.id } });
  await audit(req, 'delete', 'custom_field', field.id);
  return { ok: true };
}));

// ---------- tags ----------
settingsRouter.get('/tags', handler(async (req) => ({
  data: await prisma.tag.findMany({
    where: { orgId: me(req).orgId },
    include: { _count: { select: { contacts: true, companies: true } } }, orderBy: { name: 'asc' },
  }),
})));
settingsRouter.post('/tags', requirePermission('settings:manage'), handler(async (req, res) => {
  const input = parse(tagSchema, req.body);
  const tag = await prisma.tag.create({ data: { ...input, orgId: me(req).orgId } });
  res.status(201);
  return tag;
}));
settingsRouter.patch('/tags/:id', requirePermission('settings:manage'), handler(async (req) => {
  const tag = await prisma.tag.findFirst({ where: { id: req.params.id, orgId: me(req).orgId } });
  if (!tag) throw notFound('Tag');
  return prisma.tag.update({ where: { id: tag.id }, data: parse(tagSchema.partial(), req.body) });
}));
settingsRouter.delete('/tags/:id', requirePermission('settings:manage'), handler(async (req) => {
  const tag = await prisma.tag.findFirst({ where: { id: req.params.id, orgId: me(req).orgId } });
  if (!tag) throw notFound('Tag');
  await prisma.tag.delete({ where: { id: tag.id } });
  await audit(req, 'delete', 'tag', tag.id, { name: tag.name });
  return { ok: true };
}));

// ---------- audit log ----------
settingsRouter.get('/audit-log', requirePermission('audit:read'), handler(async (req) => {
  const { page, pageSize, skip, take } = pagination(req.query, 100);
  const where = {
    orgId: me(req).orgId,
    ...(str(req.query.entityType) && { entityType: str(req.query.entityType) }),
    ...(str(req.query.action) && { action: str(req.query.action) }),
    ...(str(req.query.userId) && { userId: str(req.query.userId) }),
    ...(str(req.query.entityId) && { entityId: str(req.query.entityId) }),
  };
  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take, include: { user: { select: userSelect } } }),
    prisma.auditLog.count({ where }),
  ]);
  return { data: rows.map((r) => ({ ...r, changes: json(r.changes, null) })), total, page, pageSize };
}));

// ---------- email templates ----------
export const templatesRouter = Router();
templatesRouter.get('/', handler(async (req) => ({
  data: await prisma.emailTemplate.findMany({
    where: { orgId: me(req).orgId, deletedAt: null, OR: [{ shared: true }, { ownerId: me(req).id }] }, orderBy: { name: 'asc' },
  }),
})));
templatesRouter.post('/', handler(async (req, res) => {
  const input = parse(emailTemplateSchema, req.body);
  if (input.shared && !can(me(req), 'templates:manage')) throw forbidden('Only managers can create shared templates');
  const t = await prisma.emailTemplate.create({ data: { ...input, orgId: me(req).orgId, ownerId: me(req).id } });
  res.status(201);
  return t;
}));
async function ownTemplate(req: Parameters<typeof me>[0]) {
  const t = await prisma.emailTemplate.findFirst({ where: { id: req.params.id, orgId: me(req).orgId, deletedAt: null } });
  if (!t) throw notFound('Template');
  if (t.ownerId !== me(req).id && !can(me(req), 'templates:manage')) throw forbidden();
  return t;
}
templatesRouter.patch('/:id', handler(async (req) => {
  const t = await ownTemplate(req);
  return prisma.emailTemplate.update({ where: { id: t.id }, data: parse(emailTemplateSchema.partial(), req.body) });
}));
templatesRouter.delete('/:id', handler(async (req) => {
  const t = await ownTemplate(req);
  await prisma.emailTemplate.update({ where: { id: t.id }, data: { deletedAt: new Date() } });
  return { ok: true };
}));

// ---------- saved views ----------
export const viewsRouter = Router();
const serView = (v: { filters: string }) => ({ ...v, filters: json<Record<string, string>>(v.filters, {}) });
viewsRouter.get('/', handler(async (req) => ({
  data: (await prisma.savedView.findMany({
    where: { orgId: me(req).orgId, ...(str(req.query.entityType) && { entityType: str(req.query.entityType) }), OR: [{ userId: me(req).id }, { shared: true }] },
    orderBy: { name: 'asc' },
  })).map(serView),
})));
viewsRouter.post('/', handler(async (req, res) => {
  const input = parse(savedViewSchema, req.body);
  const v = await prisma.savedView.create({ data: { ...input, filters: JSON.stringify(input.filters), orgId: me(req).orgId, userId: me(req).id } });
  res.status(201);
  return serView(v);
}));
viewsRouter.delete('/:id', handler(async (req) => {
  const v = await prisma.savedView.findFirst({ where: { id: req.params.id, orgId: me(req).orgId } });
  if (!v) throw notFound('View');
  if (v.userId !== me(req).id && !can(me(req), 'settings:manage')) throw forbidden();
  await prisma.savedView.delete({ where: { id: v.id } });
  return { ok: true };
}));

// ---------- notifications ----------
export const notificationsRouter = Router();
notificationsRouter.get('/', handler(async (req) => {
  const where = { userId: me(req).id, ...(req.query.unread === 'true' && { readAt: null }) };
  const [data, unread] = await Promise.all([
    prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, take: 50 }),
    prisma.notification.count({ where: { userId: me(req).id, readAt: null } }),
  ]);
  return { data, unread };
}));
notificationsRouter.post('/read', handler(async (req) => {
  const ids = Array.isArray(req.body?.ids) ? (req.body.ids as unknown[]).filter((x): x is string => typeof x === 'string') : null;
  await prisma.notification.updateMany({ where: { userId: me(req).id, readAt: null, ...(ids && { id: { in: ids } }) }, data: { readAt: new Date() } });
  return { ok: true };
}));
