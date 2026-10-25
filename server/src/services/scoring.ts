import { prisma } from '../lib/prisma';

// Rule-based lead scoring (0–100): source quality + fit + data completeness +
// engagement. Each rule contributes points; the breakdown is stored so the UI
// can explain the score.

const SOURCE_POINTS: Record<string, number> = {
  referral: 25, partner: 20, webinar: 18, event: 15, inbound_api: 15, website: 12, paid_ads: 10, social: 8, cold_outreach: 5, other: 5,
};
const SIZE_POINTS: Record<string, number> = { '1000+': 15, '501-1000': 13, '201-500': 12, '51-200': 10, '11-50': 6, '1-10': 3 };

export interface ScoreInput {
  source: string; title?: string | null; companySize?: string | null; email?: string | null; phone?: string | null;
  companyName?: string | null; message?: string | null; engagementCount?: number;
}

export function scoreLead(lead: ScoreInput) {
  const parts: { label: string; points: number }[] = [];
  parts.push({ label: `Source: ${lead.source.replace(/_/g, ' ')}`, points: SOURCE_POINTS[lead.source] ?? 5 });

  const title = (lead.title ?? '').toLowerCase();
  if (/\b(ceo|cto|cfo|coo|cmo|founder|co-founder|owner|president|chief|vp|vice president)\b/.test(title)) parts.push({ label: 'Decision-maker title', points: 25 });
  else if (/\b(director|head)\b/.test(title)) parts.push({ label: 'Director-level title', points: 18 });
  else if (/\b(manager|lead)\b/.test(title)) parts.push({ label: 'Manager-level title', points: 10 });
  else if (title) parts.push({ label: 'Has job title', points: 3 });

  if (lead.companySize && SIZE_POINTS[lead.companySize]) parts.push({ label: `Company size ${lead.companySize}`, points: SIZE_POINTS[lead.companySize] });
  if (lead.email && !/@(gmail|yahoo|hotmail|outlook|icloud)\./i.test(lead.email)) parts.push({ label: 'Business email', points: 6 });
  else if (lead.email) parts.push({ label: 'Has email', points: 3 });
  if (lead.phone) parts.push({ label: 'Has phone', points: 4 });
  if (lead.companyName) parts.push({ label: 'Company provided', points: 3 });
  if (lead.message) parts.push({ label: 'Left a message', points: 5 });
  const engagement = Math.min(20, (lead.engagementCount ?? 0) * 4);
  if (engagement) parts.push({ label: `Engagement (${lead.engagementCount} touchpoints)`, points: engagement });

  const score = Math.min(100, parts.reduce((s, p) => s + p.points, 0));
  return { score, breakdown: parts };
}

/** Recompute and persist a lead's score (call after edits or new activities). */
export async function rescoreLead(leadId: string) {
  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) return;
  const engagementCount = await prisma.activity.count({ where: { leadId, deletedAt: null, type: { in: ['call', 'email', 'meeting'] } } });
  const { score, breakdown } = scoreLead({ ...lead, engagementCount });
  await prisma.lead.update({ where: { id: leadId }, data: { score, scoreBreakdown: JSON.stringify(breakdown) } });
}
