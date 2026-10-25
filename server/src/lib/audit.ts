import type { Request } from 'express';
import { prisma } from './prisma';

const IGNORED = new Set(['updatedAt', 'createdAt', 'deletedAt', 'passwordHash', 'tokenVersion']);

/** Field-level diff between two records (only changed, non-noise fields). */
export function diff(before: Record<string, unknown>, after: Record<string, unknown>) {
  const out: Record<string, { from: unknown; to: unknown }> = {};
  for (const key of Object.keys(after)) {
    if (IGNORED.has(key)) continue;
    const a = before[key], b = after[key];
    const norm = (v: unknown) => (v instanceof Date ? v.toISOString() : v);
    if (typeof b === 'object' && b !== null && !(b instanceof Date)) continue; // skip relations
    if (norm(a) !== norm(b)) out[key] = { from: norm(a) ?? null, to: norm(b) ?? null };
  }
  return out;
}

export async function audit(
  req: Request | { user?: { id: string; orgId: string }; ip?: string },
  action: string,
  entityType: string,
  entityId: string,
  changes?: unknown,
) {
  const user = req.user;
  if (!user) return;
  if (action === 'update' && changes && typeof changes === 'object' && !Object.keys(changes).length) return;
  await prisma.auditLog.create({
    data: {
      orgId: user.orgId, userId: user.id, action, entityType, entityId,
      changes: changes === undefined ? null : JSON.stringify(changes),
      ip: 'ip' in req ? req.ip ?? null : null,
    },
  });
}
