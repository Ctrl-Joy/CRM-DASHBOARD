import { campaignSchema } from '@crm/shared';
import { prisma } from '../lib/prisma';
import { resourceRouter, type Row } from '../lib/resource';
import { round2 } from '@crm/shared';

/** Attribution: leads tagged with the campaign, and deals linked directly or via a converted lead. */
async function withStats(rows: Row[]) {
  if (!rows.length) return rows;
  const ids = rows.map((r) => r.id);
  const [leads, converted, deals] = await Promise.all([
    prisma.lead.groupBy({ by: ['campaignId'], where: { campaignId: { in: ids }, deletedAt: null }, _count: true }),
    prisma.lead.groupBy({ by: ['campaignId'], where: { campaignId: { in: ids }, deletedAt: null, convertedAt: { not: null } }, _count: true }),
    prisma.deal.findMany({ where: { campaignId: { in: ids }, deletedAt: null }, select: { campaignId: true, status: true, value: true } }),
  ]);
  return rows.map((c) => {
    const ds = deals.filter((d) => d.campaignId === c.id);
    const wonRevenue = ds.filter((d) => d.status === 'won').reduce((s, d) => s + d.value, 0);
    const leadCount = leads.find((l) => l.campaignId === c.id)?._count ?? 0;
    return {
      ...c,
      stats: {
        leads: leadCount,
        convertedLeads: converted.find((l) => l.campaignId === c.id)?._count ?? 0,
        deals: ds.length,
        wonDeals: ds.filter((d) => d.status === 'won').length,
        wonRevenue,
        pipeline: ds.filter((d) => d.status === 'open').reduce((s, d) => s + d.value, 0),
        roi: c.budget > 0 ? round2(((wonRevenue - c.budget) / c.budget) * 100) : null,
        costPerLead: c.budget > 0 && leadCount ? round2(c.budget / leadCount) : null,
      },
    };
  });
}

export const campaignsRouter = resourceRouter({
  model: 'campaign',
  entityType: 'campaign',
  label: 'Campaign',
  ownerField: null,
  schema: campaignSchema,
  writePermission: 'campaigns:manage',
  deletePermission: 'campaigns:manage',
  decorate: withStats,
  list: {
    searchFields: ['name', 'description'],
    filters: { channel: 'enum', status: 'enum', startDate: 'date' },
    sortable: ['name', 'startDate', 'endDate', 'budget', 'status', 'createdAt'],
    defaultSort: { field: 'startDate', order: 'desc' },
  },
  csv: [
    { key: 'name', label: 'Name' }, { key: 'channel', label: 'Channel' }, { key: 'status', label: 'Status' },
    { key: 'startDate', label: 'Start' }, { key: 'endDate', label: 'End' }, { key: 'budget', label: 'Budget' },
  ],
});
