import { prisma } from '../lib/prisma';

/**
 * Pick an owner for an inbound lead: round-robin across active reps, or — in
 * territory mode — across reps whose territory matches the lead's, falling back
 * to everyone when no rep covers that territory.
 */
export async function pickAssignee(orgId: string, territory: string | null | undefined): Promise<string | null> {
  const org = await prisma.organization.findUnique({ where: { id: orgId } });
  if (!org?.autoAssignLeads) return null;
  const active = { orgId, active: true, deletedAt: null };
  let pool = await prisma.user.findMany({ where: { ...active, role: 'rep' }, orderBy: { createdAt: 'asc' }, select: { id: true, territory: true } });
  if (!pool.length) pool = await prisma.user.findMany({ where: active, orderBy: { createdAt: 'asc' }, select: { id: true, territory: true } });
  if (org.assignmentMode === 'territory' && territory) {
    const local = pool.filter((u) => u.territory?.toLowerCase() === territory.toLowerCase());
    if (local.length) pool = local;
  }
  if (!pool.length) return null;
  const pick = pool[org.roundRobinCursor % pool.length];
  await prisma.organization.update({ where: { id: orgId }, data: { roundRobinCursor: { increment: 1 } } });
  return pick.id;
}
