import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { resolveRolePermissions, type Permission, type Role } from '@crm/shared';
import { prisma } from './prisma';
import { forbidden, HttpError, json } from './http';

export const COOKIE = 'crm_session';
const TTL_SECONDS = 7 * 24 * 3600;

function secret() {
  const s = process.env.JWT_SECRET;
  if (!s || (process.env.NODE_ENV === 'production' && s.startsWith('change-me'))) {
    throw new Error('Set a strong JWT_SECRET in server/.env');
  }
  return s;
}

export interface AuthUser {
  id: string;
  orgId: string;
  name: string;
  email: string;
  role: Role;
  teamId: string | null;
  permissions: Set<Permission>;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request { user?: AuthUser }
  }
}

export function signToken(user: { id: string; tokenVersion: number }) {
  return jwt.sign({ sub: user.id, tv: user.tokenVersion }, secret(), { expiresIn: TTL_SECONDS });
}

export function setSessionCookie(res: Response, token: string) {
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.SECURE_COOKIES === '1',
    maxAge: TTL_SECONDS * 1000,
    path: '/',
  });
}
export const clearSessionCookie = (res: Response) => res.clearCookie(COOKIE, { path: '/' });

/**
 * Authenticate via the session cookie (browser) or a Bearer token (API
 * clients). Cookie-authenticated writes must carry X-Requested-With, which a
 * cross-site form can't send — that's our CSRF defence alongside SameSite.
 */
export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    const bearer = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    const token = bearer ?? req.cookies?.[COOKIE];
    if (!token) throw new HttpError(401, 'Please sign in');
    if (!bearer && !['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers['x-requested-with'] !== 'XMLHttpRequest') {
      throw new HttpError(403, 'Missing X-Requested-With header');
    }
    let payload: { sub: string; tv: number };
    try {
      payload = jwt.verify(token, secret()) as typeof payload;
    } catch {
      throw new HttpError(401, 'Your session has expired. Please sign in again.');
    }
    const user = await prisma.user.findFirst({
      where: { id: payload.sub, deletedAt: null, active: true },
      include: { org: { select: { rolePermissions: true } } },
    });
    if (!user || user.tokenVersion !== payload.tv) throw new HttpError(401, 'Please sign in');
    const role = user.role as Role;
    const map = resolveRolePermissions(json(user.org.rolePermissions, null));
    req.user = {
      id: user.id, orgId: user.orgId, name: user.name, email: user.email, role, teamId: user.teamId,
      permissions: new Set(map[role]),
    };
    next();
  } catch (err) {
    next(err);
  }
}

export const can = (user: AuthUser, perm: Permission) => user.permissions.has(perm);

export const requirePermission = (perm: Permission) => (req: Request, _res: Response, next: NextFunction) => {
  if (!req.user || !can(req.user, perm)) return next(forbidden());
  next();
};

/** Narrow req.user for handlers mounted behind requireAuth. */
export function me(req: Request): AuthUser {
  if (!req.user) throw new HttpError(401, 'Please sign in');
  return req.user;
}
