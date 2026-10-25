import type { Request } from 'express';
import { prisma } from './prisma';
import { badRequest, dateParam, json, pagination, str } from './http';

export const userSelect = { id: true, name: true, email: true, avatarUrl: true } as const;
export const tagSelect = { id: true, name: true, color: true } as const;

export type FilterKind = 'enum' | 'id' | 'bool' | 'date' | 'number';

export interface ListConfig {
  searchFields: readonly string[]; // dotted paths allowed: "company.name"
  filters?: Record<string, FilterKind>;
  sortable: readonly string[];
  defaultSort?: { field: string; order: 'asc' | 'desc' };
  tags?: boolean;
}

/** Turn "a.b" + value into { a: { b: value } }. */
function nest(path: string, value: unknown): Record<string, unknown> {
  return path.split('.').reduceRight<unknown>((acc, key) => ({ [key]: acc }), value) as Record<string, unknown>;
}

/**
 * Build a Prisma findMany query from list params:
 *   ?q=&page=&pageSize=&sort=&order=&<filter>=a,b&<date>_from=&<date>_to=&tag=x
 */
export function buildListQuery(req: Request, scope: Record<string, unknown>, cfg: ListConfig, maxPageSize = 100) {
  const q = req.query;
  const and: Record<string, unknown>[] = [scope];
  const search = str(q.q)?.trim();
  // SQLite LIKE is case-insensitive for ASCII; on Postgres add mode: 'insensitive'.
  if (search) and.push({ OR: cfg.searchFields.map((f) => nest(f, { contains: search })) });

  for (const [field, kind] of Object.entries(cfg.filters ?? {})) {
    if (kind === 'date' || kind === 'number') {
      const from = kind === 'date' ? dateParam(q[`${field}_from`]) : num(q[`${field}_min`]);
      const to = kind === 'date' ? dateParam(q[`${field}_to`]) : num(q[`${field}_max`]);
      if (from !== undefined || to !== undefined) and.push({ [field]: { ...(from !== undefined && { gte: from }), ...(to !== undefined && { lte: to }) } });
      continue;
    }
    const raw = str(q[field]);
    if (raw === undefined) continue;
    if (kind === 'bool') { and.push({ [field]: raw === 'true' || raw === '1' }); continue; }
    if (raw === 'none') { and.push({ [field]: null }); continue; }
    const values = raw.split(',').map((v) => (v === 'me' ? req.user!.id : v));
    and.push({ [field]: values.length > 1 ? { in: values } : values[0] });
  }
  if (cfg.tags && str(q.tag)) and.push({ tags: { some: { name: { in: str(q.tag)!.split(',') } } } });

  const sortField = str(q.sort);
  const sort = sortField && cfg.sortable.includes(sortField) ? sortField : cfg.defaultSort?.field ?? 'createdAt';
  const order = str(q.order) === 'asc' ? 'asc' : str(q.order) === 'desc' ? 'desc' : cfg.defaultSort?.order ?? 'desc';
  const { page, pageSize, skip, take } = pagination(q, maxPageSize);
  return {
    where: { AND: and },
    orderBy: [nest(sort, order), { id: 'asc' as const }],
    skip, take, page, pageSize,
  };
}
const num = (v: unknown) => (str(v) !== undefined && Number.isFinite(Number(v)) ? Number(v) : undefined);

/** Parse JSON-in-string columns on the way out. */
export function withCustomFields<T extends Record<string, any>>(row: T) {
  return { ...row, customFields: json<Record<string, unknown>>(row.customFields as string | null | undefined, {}) };
}

/** Find-or-create tags by name for the org; returns Prisma relation refs. */
export async function tagRefs(orgId: string, names: string[]) {
  const unique = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
  const tags = await Promise.all(unique.map((name) =>
    prisma.tag.upsert({ where: { orgId_name: { orgId, name } }, update: {}, create: { orgId, name } })));
  return tags.map((t) => ({ id: t.id }));
}

/** Validate custom field values against the org's definitions; returns a JSON string. */
export async function cleanCustomFields(orgId: string, entityType: string, values: Record<string, unknown> | undefined, existing?: string | null) {
  if (values === undefined) return undefined;
  const defs = await prisma.customField.findMany({ where: { orgId, entityType } });
  const merged: Record<string, unknown> = { ...json<Record<string, unknown>>(existing, {}), ...values };
  const out: Record<string, unknown> = {};
  for (const def of defs) {
    let v = merged[def.key];
    if (v === '' || v === undefined) v = null;
    if (v !== null) {
      if (def.type === 'number') { v = Number(v); if (!Number.isFinite(v)) throw badRequest(`${def.label} must be a number`); }
      if (def.type === 'checkbox') v = v === true || v === 'true' || v === 1;
      if (def.type === 'date' && Number.isNaN(new Date(String(v)).getTime())) throw badRequest(`${def.label} must be a date`);
      if (def.type === 'select' && !json<string[]>(def.options, []).includes(String(v))) throw badRequest(`${def.label} has an invalid option`);
      if (def.type === 'text') v = String(v).slice(0, 1000);
    }
    if (def.required && (v === null || v === false && def.type !== 'checkbox')) throw badRequest(`${def.label} is required`);
    out[def.key] = v;
  }
  return JSON.stringify(out);
}

/** Strip undefined keys so Prisma updates only what was sent. */
export function defined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>;
}

/** Case/punctuation-insensitive column lookup for CSV rows: pick('First Name', 'first') */
export function csvPicker(row: Record<string, string>) {
  const norm = (k: string) => k.toLowerCase().replace(/[^a-z0-9]/g, '');
  const map = Object.fromEntries(Object.entries(row).map(([k, v]) => [norm(k), (v ?? '').trim()]));
  return (...keys: string[]) => {
    for (const k of keys) if (map[norm(k)]) return map[norm(k)];
    return undefined;
  };
}
export const splitList = (s: string | undefined) => (s ? s.split(/[;|]/).map((x) => x.trim()).filter(Boolean) : undefined);

export const fullName =(c: { firstName: string; lastName?: string | null }) => [c.firstName, c.lastName].filter(Boolean).join(' ');
