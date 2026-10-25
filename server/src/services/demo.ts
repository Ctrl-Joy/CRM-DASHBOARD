import { prisma } from '../lib/prisma';
import { HttpError } from '../lib/http';

/**
 * One-click "live demo" sign-in for the separate Northwind Demo organization
 * created by `npm run seed`. It is only offered when that organization exists,
 * and can be switched off with DEMO_LOGIN=false. Real organizations are never
 * involved.
 */
export const DEMO_ORG_NAME = 'Northwind Demo';
export const DEMO_ACCOUNTS = {
  admin: 'admin@demo.nimbus.test',
  manager: 'manager@demo.nimbus.test',
  rep: 'sam@demo.nimbus.test',
} as const;
export type DemoRole = keyof typeof DEMO_ACCOUNTS;

export const demoLoginEnabled = () => process.env.DEMO_LOGIN !== 'false';

export async function demoOrgId(): Promise<string | null> {
  const org = await prisma.organization.findFirst({ where: { name: DEMO_ORG_NAME }, select: { id: true } });
  return org?.id ?? null;
}

/** Shared visitors must not be able to lock each other out of the demo. */
export async function assertNotDemo(orgId: string) {
  if (demoLoginEnabled() && orgId === (await demoOrgId())) {
    throw new HttpError(403, 'Account and user settings are read-only in the live demo.');
  }
}
