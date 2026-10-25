import { prisma } from '../lib/prisma';

export async function notify(
  orgId: string,
  userId: string | null | undefined,
  n: { type: string; title: string; body?: string | null; link?: string | null },
  opts: { skipUserId?: string } = {},
) {
  if (!userId || userId === opts.skipUserId) return;
  await prisma.notification.create({ data: { orgId, userId, type: n.type, title: n.title, body: n.body ?? null, link: n.link ?? null } });
}
