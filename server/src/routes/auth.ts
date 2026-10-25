import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { changePasswordSchema, loginSchema, profileSchema, signupSchema, type Me, type Role } from '@crm/shared';
import { prisma } from '../lib/prisma';
import { clearSessionCookie, me, requireAuth, setSessionCookie, signToken } from '../lib/auth';
import { badRequest, handler, HttpError, parse } from '../lib/http';
import { audit } from '../lib/audit';
import { createOrganization } from '../services/setup';
import { assertNotDemo, DEMO_ACCOUNTS, demoLoginEnabled, demoOrgId, type DemoRole } from '../services/demo';

export const authRouter = Router();
const DUMMY_HASH = bcrypt.hashSync('timing-equaliser', 12);

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: process.env.NODE_ENV === 'test' ? 1000 : 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please wait a few minutes and try again.' },
});

export async function buildMe(userId: string, permissions: Set<string> | string[]): Promise<Me> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { org: true } });
  const perms = [...permissions] as Me['permissions'];
  return {
    id: user.id, name: user.name, email: user.email, avatarUrl: user.avatarUrl, role: user.role as Role,
    teamId: user.teamId, quota: user.quota, territory: user.territory, permissions: perms,
    org: {
      id: user.org.id, name: user.org.name, currency: user.org.currency, currencies: user.org.currencies.split(','),
      fiscalYearStartMonth: user.org.fiscalYearStartMonth,
      ...(perms.includes('settings:manage') && { leadApiKey: user.org.leadApiKey }),
    },
  };
}

authRouter.post('/signup', limiter, handler(async (req, res) => {
  const input = parse(signupSchema, req.body);
  if (await prisma.user.findUnique({ where: { email: input.email } })) throw new HttpError(409, 'An account with that email already exists');
  const passwordHash = await bcrypt.hash(input.password, 12);
  const { user } = await createOrganization({ company: input.company, name: input.name, email: input.email, passwordHash });
  setSessionCookie(res, signToken(user));
  await audit({ user: { id: user.id, orgId: user.orgId }, ip: req.ip }, 'signup', 'user', user.id);
  res.status(201);
  return { ok: true };
}));

authRouter.post('/login', limiter, handler(async (req, res) => {
  const { email, password } = parse(loginSchema, req.body);
  const user = await prisma.user.findUnique({ where: { email } });
  // Compare against a dummy hash when the user doesn't exist to keep timing uniform.
  const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) throw new HttpError(401, 'Incorrect email or password');
  if (!user.active || user.deletedAt) throw new HttpError(403, 'This account has been deactivated. Contact your administrator.');
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  setSessionCookie(res, signToken(user));
  await audit({ user: { id: user.id, orgId: user.orgId }, ip: req.ip }, 'login', 'user', user.id);
  return { ok: true };
}));

authRouter.get('/demo', handler(async () => ({ available: demoLoginEnabled() && (await demoOrgId()) !== null })));

authRouter.post('/demo', limiter, handler(async (req, res) => {
  const role: DemoRole = req.body?.role in DEMO_ACCOUNTS ? req.body.role : 'admin';
  const orgId = demoLoginEnabled() ? await demoOrgId() : null;
  const user = orgId && await prisma.user.findFirst({ where: { orgId, email: DEMO_ACCOUNTS[role], active: true, deletedAt: null } });
  if (!user) throw new HttpError(404, 'The live demo isn’t available right now.');
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  setSessionCookie(res, signToken(user));
  await audit({ user: { id: user.id, orgId: user.orgId }, ip: req.ip }, 'login', 'user', user.id, { demo: true });
  return { ok: true };
}));

authRouter.post('/logout', (_req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

authRouter.get('/me', requireAuth, handler(async (req) => buildMe(me(req).id, me(req).permissions)));

authRouter.patch('/me', requireAuth, handler(async (req) => {
  const user = me(req);
  await assertNotDemo(user.orgId);
  const input = parse(profileSchema, req.body);
  const clash = await prisma.user.findFirst({ where: { email: input.email, id: { not: user.id } } });
  if (clash) throw new HttpError(409, 'That email is already in use');
  await prisma.user.update({ where: { id: user.id }, data: input });
  await audit(req, 'update', 'user', user.id, { profile: true });
  return buildMe(user.id, user.permissions);
}));

authRouter.post('/me/password', requireAuth, handler(async (req, res) => {
  await assertNotDemo(me(req).orgId);
  const { current, next } = parse(changePasswordSchema, req.body);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: me(req).id } });
  if (!(await bcrypt.compare(current, user.passwordHash))) throw badRequest('Current password is incorrect');
  // Bumping tokenVersion signs out every other session.
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(next, 12), tokenVersion: { increment: 1 } },
  });
  setSessionCookie(res, signToken(updated));
  await audit(req, 'password_change', 'user', user.id);
  return { ok: true };
}));
