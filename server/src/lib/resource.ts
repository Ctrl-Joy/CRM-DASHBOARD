import { Router, type Request } from 'express';
import type { AnyZodObject } from 'zod';
import { bulkSchema, importSchema, type Permission } from '@crm/shared';
import { prisma } from './prisma';
import { can, me } from './auth';
import { badRequest, forbidden, handler, notFound, parse, toCsv } from './http';
import { assertInOrg, resolveOwner, scopeWhere } from './scope';
import { buildListQuery, cleanCustomFields, defined, tagRefs, withCustomFields, type ListConfig } from './records';
import { audit, diff } from './audit';

// Generic, RBAC-aware CRUD router shared by the CRM record types: list (paged,
// searched, filtered, sorted server-side), get, create, update, soft delete,
// bulk actions, CSV export and import. Ownership scoping and audit logging are
// applied uniformly here so individual modules can't forget them.

export type Row = Record<string, any> & { id: string };

const LINKS = {
  contactId: 'contact', companyId: 'company', dealId: 'deal', leadId: 'lead',
  ticketId: 'ticket', campaignId: 'campaign', pipelineId: 'pipeline',
} as const;

export interface ResourceOptions {
  model: string;
  entityType: string;
  label: string;
  ownerField: 'ownerId' | 'assigneeId' | null;
  schema: AnyZodObject;
  list: ListConfig;
  include?: Record<string, unknown>;
  serialize?: (row: Row) => unknown;
  /** null = the owner may delete their own records without extra permission. */
  deletePermission?: Permission | null;
  /** Permission required to create/update/import (default: any signed-in user). */
  writePermission?: Permission;
  /** Enrich rows (e.g. computed stats) before serialization, for list and get. */
  decorate?: (rows: Row[], req: Request) => Promise<Row[]>;
  csv?: { key: string; label: string; get?: (r: Row) => unknown }[];
  fromCsv?: (row: Record<string, string>) => Record<string, unknown>;
  statusField?: string;
  /** Final input → Prisma data step. `raw` is the unvalidated input (request body or mapped CSV row). */
  prepare?: (data: Record<string, unknown>, ctx: { req: Request; existing?: Row; raw: Record<string, unknown> }) => Promise<Record<string, unknown>> | Record<string, unknown>;
  afterCreate?: (row: Row, req: Request) => Promise<void>;
  afterUpdate?: (row: Row, before: Row, req: Request) => Promise<void>;
  /** Extra routes, registered before /:id so they take precedence. */
  extend?: (router: Router, helpers: ResourceHelpers) => void;
}

export interface ResourceHelpers {
  findScoped: (req: Request, id: string, include?: Record<string, unknown>) => Promise<Row>;
  serialize: (row: Row) => any;
  toData: (input: Record<string, unknown>, req: Request, existing?: Row, raw?: Record<string, unknown>) => Promise<Record<string, unknown>>;
}

export function resourceRouter(opts: ResourceOptions) {
  const r = Router();
  const delegate = (prisma as any)[opts.model];
  const ser = (row: Row) => {
    const base = 'customFields' in row ? withCustomFields(row) : row;
    return opts.serialize ? opts.serialize(base as Row) : base;
  };

  async function findScoped(req: Request, id: string, include = opts.include) {
    const scope = await scopeWhere(me(req), opts.ownerField);
    const row = await delegate.findFirst({ where: { AND: [scope, { id }] }, include });
    if (!row) throw notFound(opts.label);
    return row as Row;
  }

  async function toData(input: Record<string, unknown>, req: Request, existing?: Row, raw: Record<string, unknown> = req.body ?? {}) {
    const user = me(req);
    const data: Record<string, unknown> = { ...input };
    const of = opts.ownerField;
    if (of && !existing && input[of] == null) {
      data[of] = user.id; // new records belong to their creator unless assigned
    } else if (of && of in opts.schema.shape && input[of] !== undefined) {
      data[of] = await resolveOwner(user, input[of] as string | null, existing ? existing[of] : undefined);
    }
    for (const [key, model] of Object.entries(LINKS)) {
      if (typeof data[key] === 'string') await assertInOrg(model, data[key] as string, user.orgId);
    }
    if ('tags' in data) {
      const names = data.tags as string[] | undefined;
      delete data.tags;
      if (names !== undefined) {
        const refs = await tagRefs(user.orgId, names);
        data.tags = existing ? { set: refs } : { connect: refs };
      }
    }
    if ('customFields' in data) {
      data.customFields = await cleanCustomFields(user.orgId, opts.entityType, data.customFields as Record<string, unknown> | undefined, existing?.customFields);
    }
    const prepared = opts.prepare ? await opts.prepare(data, { req, existing, raw }) : data;
    return defined(prepared);
  }

  const helpers: ResourceHelpers = { findScoped, serialize: ser, toData };
  const decorate = async (rows: Row[], req: Request) => (opts.decorate ? opts.decorate(rows, req) : rows);
  const checkWrite = (req: Request) => {
    if (opts.writePermission && !can(me(req), opts.writePermission)) throw forbidden();
  };

  r.get('/', handler(async (req) => {
    const scope = await scopeWhere(me(req), opts.ownerField);
    const q = buildListQuery(req, scope, opts.list);
    const [rows, total] = await Promise.all([
      delegate.findMany({ where: q.where, orderBy: q.orderBy, skip: q.skip, take: q.take, include: opts.include }),
      delegate.count({ where: q.where }),
    ]);
    return { data: (await decorate(rows, req)).map(ser), total, page: q.page, pageSize: q.pageSize };
  }));

  r.get('/export', handler(async (req, res) => {
    const user = me(req);
    if (!can(user, 'records:export')) throw forbidden();
    if (!opts.csv) throw notFound();
    const scope = await scopeWhere(user, opts.ownerField);
    const q = buildListQuery(req, scope, opts.list);
    const rows: Row[] = await delegate.findMany({ where: q.where, orderBy: q.orderBy, take: 10000, include: opts.include });
    const flat = rows.map((row) => Object.fromEntries(opts.csv!.map((c) => [c.key, c.get ? c.get(row) : row[c.key]])));
    await audit(req, 'export', opts.entityType, 'bulk', { count: rows.length });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${opts.model}s-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send('﻿' + toCsv(flat, opts.csv));
  }));

  r.post('/import', handler(async (req) => {
    const user = me(req);
    if (!can(user, 'records:import')) throw forbidden();
    checkWrite(req);
    if (!opts.fromCsv) throw notFound();
    const { rows } = parse(importSchema, req.body);
    let created = 0;
    const failed: { row: number; error: string }[] = [];
    for (const [i, csvRow] of rows.entries()) {
      const mapped = opts.fromCsv(csvRow);
      const result = opts.schema.safeParse(mapped);
      if (!result.success) {
        const issue = result.error.issues[0];
        failed.push({ row: i + 1, error: `${issue.path.join('.') || 'row'}: ${issue.message}` });
        continue;
      }
      try {
        const data = await toData(result.data, req, undefined, mapped);
        const row = await delegate.create({ data: { ...data, orgId: user.orgId } });
        if (opts.afterCreate) await opts.afterCreate(row, req);
        created++;
      } catch (err) {
        failed.push({ row: i + 1, error: err instanceof Error ? err.message : 'Failed' });
      }
    }
    await audit(req, 'import', opts.entityType, 'bulk', { created, failed: failed.length });
    return { created, failed };
  }));

  r.post('/bulk', handler(async (req) => {
    const user = me(req);
    const { ids, action, value } = parse(bulkSchema, req.body);
    const scope = await scopeWhere(user, opts.ownerField);
    const where = { AND: [scope, { id: { in: ids } }] };
    let count = 0;
    if (action === 'delete') {
      if (opts.deletePermission !== null && !can(user, opts.deletePermission ?? 'records:delete')) throw forbidden();
      ({ count } = await delegate.updateMany({ where, data: { deletedAt: new Date() } }));
    } else if (action === 'assign') {
      if (!opts.ownerField) throw badRequest('This record type has no owner');
      const ownerId = await resolveOwner(user, value || null);
      ({ count } = await delegate.updateMany({ where, data: { [opts.ownerField]: ownerId } }));
    } else if (action === 'status') {
      if (!opts.statusField || !value) throw badRequest('Status is not supported here');
      const field = (opts.schema.shape as Record<string, AnyZodObject>)[opts.statusField];
      parse(field, value);
      ({ count } = await delegate.updateMany({ where, data: { [opts.statusField]: value } }));
    } else if (action === 'tag') {
      if (!('tags' in opts.schema.shape) || !value) throw badRequest('Tags are not supported here');
      const refs = await tagRefs(user.orgId, [value]);
      const rows: Row[] = await delegate.findMany({ where, select: { id: true } });
      await Promise.all(rows.map((row) => delegate.update({ where: { id: row.id }, data: { tags: { connect: refs } } })));
      count = rows.length;
    }
    await audit(req, `bulk_${action}`, opts.entityType, 'bulk', { ids, value, count });
    return { count };
  }));

  opts.extend?.(r, helpers);

  r.get('/:id', handler(async (req) => ser((await decorate([await findScoped(req, req.params.id)], req))[0])));

  r.post('/', handler(async (req, res) => {
    const user = me(req);
    checkWrite(req);
    const input = parse(opts.schema, req.body);
    const data = await toData(input, req);
    const row: Row = await delegate.create({ data: { ...data, orgId: user.orgId }, include: opts.include });
    await audit(req, 'create', opts.entityType, row.id);
    if (opts.afterCreate) await opts.afterCreate(row, req);
    res.status(201);
    return ser(await findScoped(req, row.id).catch(() => row));
  }));

  r.patch('/:id', handler(async (req) => {
    checkWrite(req);
    const existing = await findScoped(req, req.params.id);
    const input = parse(opts.schema.partial(), req.body);
    const data = await toData(input, req, existing);
    const row: Row = await delegate.update({ where: { id: existing.id }, data, include: opts.include });
    await audit(req, 'update', opts.entityType, row.id, diff(existing, row));
    if (opts.afterUpdate) await opts.afterUpdate(row, existing, req);
    return ser(await findScoped(req, row.id).catch(() => row));
  }));

  r.delete('/:id', handler(async (req) => {
    const user = me(req);
    const existing = await findScoped(req, req.params.id);
    if (opts.deletePermission !== null && !can(user, opts.deletePermission ?? 'records:delete')) throw forbidden();
    await delegate.update({ where: { id: existing.id }, data: { deletedAt: new Date() } });
    await audit(req, 'delete', opts.entityType, existing.id);
    return { ok: true };
  }));

  return r;
}
