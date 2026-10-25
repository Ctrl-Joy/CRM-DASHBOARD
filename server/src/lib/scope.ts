import { can, type AuthUser } from './auth';
import { prisma } from './prisma';
import { forbidden } from './http';

/**
 * Row-level access control. Every CRM query goes through this:
 *  - view_all (admins): everything in the org
 *  - view_team (managers): records owned by their team, plus unassigned ones
 *  - otherwise (reps): only records they own
 */
export async function visibleOwnerIds(user: AuthUser): Promise<string[] | 'all'> {
  if (can(user, 'records:view_all')) return 'all';
  if (can(user, 'records:view_team')) {
    const teamIds = new Set<string>([user.id]);
    const teams = await prisma.team.findMany({
      where: { orgId: user.orgId, OR: [{ managerId: user.id }, ...(user.teamId ? [{ id: user.teamId }] : [])] },
      select: { members: { select: { id: true } } },
    });
    teams.forEach((t) => t.members.forEach((m) => teamIds.add(m.id)));
    return [...teamIds];
  }
  return [user.id];
}

/** Prisma `where` fragment restricting rows to what the user may see. */
export async function scopeWhere(user: AuthUser, ownerField: string | null = 'ownerId'): Promise<Record<string, unknown>> {
  const base: Record<string, unknown> = { orgId: user.orgId, deletedAt: null };
  if (!ownerField) return base;
  const ids = await visibleOwnerIds(user);
  if (ids === 'all') return base;
  if (can(user, 'records:view_team')) return { ...base, OR: [{ [ownerField]: { in: ids } }, { [ownerField]: null }] };
  return { ...base, [ownerField]: user.id };
}

/**
 * Decide the owner for a create/update. Users without records:reassign can only
 * assign records to themselves.
 */
export async function resolveOwner(user: AuthUser, requested: string | null | undefined, current?: string | null) {
  if (requested === undefined) return current === undefined ? user.id : current;
  if (requested === null) return can(user, 'records:reassign') ? null : current ?? user.id;
  if (requested === user.id || requested === current) return requested;
  if (!can(user, 'records:reassign')) throw forbidden('You can only assign records to yourself');
  const target = await prisma.user.findFirst({ where: { id: requested, orgId: user.orgId, deletedAt: null }, select: { id: true } });
  if (!target) throw forbidden('That user is not in your organization');
  return requested;
}

/** Verify a referenced record exists in the user's org (prevents cross-tenant links). */
export async function assertInOrg(
  model: 'contact' | 'company' | 'deal' | 'lead' | 'ticket' | 'campaign' | 'product' | 'pipeline',
  id: string | null | undefined,
  orgId: string,
) {
  if (!id) return;
  const delegate = (prisma as unknown as Record<string, { findFirst: (a: unknown) => Promise<unknown> }>)[model];
  const row = await delegate.findFirst({ where: { id, orgId, deletedAt: null }, select: { id: true } });
  if (!row) throw forbidden(`Linked ${model} not found`);
}
