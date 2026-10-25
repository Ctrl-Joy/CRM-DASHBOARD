import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { inviteUserSchema, teamSchema, updateUserSchema } from '@crm/shared';
import { prisma } from '../lib/prisma';
import { me, requirePermission } from '../lib/auth';
import { badRequest, handler, HttpError, notFound, parse } from '../lib/http';
import { audit, diff } from '../lib/audit';
import { userSelect } from '../lib/records';

export const usersRouter = Router();

const publicUser = {
  ...userSelect, role: true, teamId: true, quota: true, territory: true, active: true, lastLoginAt: true, createdAt: true,
  team: { select: { id: true, name: true } },
} as const;

// Every signed-in user can see the directory (needed for owner pickers).
usersRouter.get('/', handler(async (req) => {
  const users = await prisma.user.findMany({
    where: { orgId: me(req).orgId, deletedAt: null, ...(req.query.active === 'true' && { active: true }) },
    select: publicUser, orderBy: { name: 'asc' },
  });
  return { data: users };
}));

usersRouter.post('/', requirePermission('users:manage'), handler(async (req, res) => {
  const user = me(req);
  const input = parse(inviteUserSchema, req.body);
  if (await prisma.user.findUnique({ where: { email: input.email } })) throw new HttpError(409, 'A user with that email already exists');
  if (input.teamId && !(await prisma.team.findFirst({ where: { id: input.teamId, orgId: user.orgId } }))) throw badRequest('Team not found');
  const created = await prisma.user.create({
    data: {
      orgId: user.orgId, name: input.name, email: input.email, role: input.role, teamId: input.teamId,
      quota: input.quota, territory: input.territory, passwordHash: await bcrypt.hash(input.password, 12),
    },
    select: publicUser,
  });
  await audit(req, 'create', 'user', created.id, { role: input.role });
  res.status(201);
  return created;
}));

usersRouter.patch('/:id', requirePermission('users:manage'), handler(async (req) => {
  const user = me(req);
  const target = await prisma.user.findFirst({ where: { id: req.params.id, orgId: user.orgId, deletedAt: null } });
  if (!target) throw notFound('User');
  const input = parse(updateUserSchema, req.body);
  if (target.id === user.id && (input.role && input.role !== 'admin' || input.active === false)) {
    throw badRequest("You can't demote or deactivate yourself");
  }
  if (input.teamId && !(await prisma.team.findFirst({ where: { id: input.teamId, orgId: user.orgId } }))) throw badRequest('Team not found');
  const updated = await prisma.user.update({
    where: { id: target.id },
    // Deactivating or changing role revokes existing sessions.
    data: { ...input, ...((input.active === false || (input.role && input.role !== target.role)) && { tokenVersion: { increment: 1 } }) },
    select: publicUser,
  });
  await audit(req, 'update', 'user', target.id, diff(target, updated as Record<string, unknown>));
  return updated;
}));

// ---------- teams ----------
export const teamsRouter = Router();

teamsRouter.get('/', handler(async (req) => ({
  data: await prisma.team.findMany({
    where: { orgId: me(req).orgId },
    include: { manager: { select: userSelect }, members: { select: userSelect, where: { deletedAt: null } } },
    orderBy: { name: 'asc' },
  }),
})));

async function checkManager(orgId: string, managerId: string | null | undefined) {
  if (managerId && !(await prisma.user.findFirst({ where: { id: managerId, orgId, deletedAt: null } }))) throw badRequest('Manager not found');
}

teamsRouter.post('/', requirePermission('users:manage'), handler(async (req, res) => {
  const input = parse(teamSchema, req.body);
  await checkManager(me(req).orgId, input.managerId);
  const team = await prisma.team.create({ data: { ...input, orgId: me(req).orgId } });
  await audit(req, 'create', 'team', team.id);
  res.status(201);
  return team;
}));

teamsRouter.patch('/:id', requirePermission('users:manage'), handler(async (req) => {
  const team = await prisma.team.findFirst({ where: { id: req.params.id, orgId: me(req).orgId } });
  if (!team) throw notFound('Team');
  const input = parse(teamSchema.partial(), req.body);
  await checkManager(me(req).orgId, input.managerId);
  const updated = await prisma.team.update({ where: { id: team.id }, data: input });
  await audit(req, 'update', 'team', team.id, diff(team, updated));
  return updated;
}));

teamsRouter.delete('/:id', requirePermission('users:manage'), handler(async (req) => {
  const team = await prisma.team.findFirst({ where: { id: req.params.id, orgId: me(req).orgId } });
  if (!team) throw notFound('Team');
  await prisma.team.delete({ where: { id: team.id } });
  await audit(req, 'delete', 'team', team.id);
  return { ok: true };
}));
