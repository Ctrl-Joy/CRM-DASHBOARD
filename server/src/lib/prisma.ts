import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient({
  log: process.env.PRISMA_LOG === '1' ? ['query', 'warn', 'error'] : ['warn', 'error'],
});

/** Filter for rows that haven't been soft-deleted. */
export const alive = { deletedAt: null } as const;
