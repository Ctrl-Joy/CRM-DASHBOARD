import crypto from 'crypto';
import { prisma } from '../lib/prisma';

export const DEFAULT_STAGES = [
  { name: 'Qualification', probability: 10 },
  { name: 'Discovery', probability: 25 },
  { name: 'Proposal', probability: 50 },
  { name: 'Negotiation', probability: 75 },
  { name: 'Contract Sent', probability: 90 },
];

export const newApiKey = () => `lk_${crypto.randomBytes(18).toString('base64url')}`;

/**
 * A brand-new organization: the founding admin plus one empty sales pipeline
 * (deals need somewhere to live). No sample records are created.
 */
export async function createOrganization(input: { company: string; name: string; email: string; passwordHash: string }) {
  return prisma.$transaction(async (tx) => {
    const org = await tx.organization.create({ data: { name: input.company, leadApiKey: newApiKey() } });
    const user = await tx.user.create({
      data: { orgId: org.id, name: input.name, email: input.email, passwordHash: input.passwordHash, role: 'admin' },
    });
    await tx.pipeline.create({
      data: {
        orgId: org.id, name: 'Sales Pipeline', isDefault: true,
        stages: { create: DEFAULT_STAGES.map((s, i) => ({ ...s, order: i })) },
      },
    });
    return { org, user };
  });
}
