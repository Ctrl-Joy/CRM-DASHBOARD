import { Router, type Request } from 'express';
import {
  reportConfigSchema, reportSchema, resolveRolePermissions, type DashboardData, type Kpi, type ReportConfig, type Role,
} from '@crm/shared';
import { prisma } from '../lib/prisma';
import { badRequest, dateParam, forbidden, handler, json, notFound, parse, str } from '../lib/http';
import { can, me, requirePermission, type AuthUser } from '../lib/auth';
import { scopeWhere, visibleOwnerIds } from '../lib/scope';
import { userSelect } from '../lib/records';
import { audit } from '../lib/audit';
import { effectiveProbability } from '../services/forecast';
import { evaluate } from '../services/automation';
import { ai } from '../services/ai';
import { emailProvider } from '../services/email';

const DAY = 864e5;
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const inRange = (d: Date | null | undefined, a: Date, b: Date) => !!d && d >= a && d <= b;

/** Which owners a dashboard/report covers, after view + filter params. */
async function ownerFilter(query: Request['query'], user: AuthUser): Promise<{ ids: string[] | 'all'; view: 'my' | 'team' }> {
  const wantsTeam = query.view === 'team';
  if (wantsTeam && !can(user, 'reports:team')) throw forbidden('Team dashboards need the "View team dashboards" permission');
  if (!wantsTeam) return { ids: [user.id], view: 'my' };
  let ids = await visibleOwnerIds(user);
  const narrow = async (where: Record<string, unknown>) => {
    const users = (await prisma.user.findMany({ where: { orgId: user.orgId, deletedAt: null, ...where }, select: { id: true } })).map((u) => u.id);
    ids = ids === 'all' ? users : ids.filter((id) => users.includes(id));
  };
  if (str(query.ownerId)) await narrow({ id: str(query.ownerId) });
  if (str(query.teamId)) await narrow({ teamId: str(query.teamId) });
  if (str(query.territory)) await narrow({ territory: str(query.territory) });
  return { ids, view: 'team' };
}
const ownedBy = (ids: string[] | 'all', field = 'ownerId') => (ids === 'all' ? {} : { [field]: { in: ids } });

function period(req: Request) {
  const now = new Date();
  const to = dateParam(req.query.to) ?? now;
  const from = dateParam(req.query.from) ?? new Date(now.getFullYear(), now.getMonth(), 1);
  if (from >= to) throw badRequest('"from" must be before "to"');
  const len = to.getTime() - from.getTime();
  return { from, to, prevFrom: new Date(from.getTime() - len), prevTo: new Date(from.getTime() - 1), len };
}

function buckets(from: Date, to: Date) {
  const days = (to.getTime() - from.getTime()) / DAY;
  const unit = days <= 45 ? 'day' : days <= 200 ? 'week' : 'month';
  const out: { start: Date; label: string }[] = [];
  const cur = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  if (unit === 'month') cur.setDate(1);
  while (cur <= to) {
    out.push({ start: new Date(cur), label: unit === 'month' ? cur.toISOString().slice(0, 7) : cur.toISOString().slice(0, 10) });
    if (unit === 'day') cur.setDate(cur.getDate() + 1);
    else if (unit === 'week') cur.setDate(cur.getDate() + 7);
    else cur.setMonth(cur.getMonth() + 1);
  }
  return out;
}
const bucketIndex = (bs: { start: Date }[], d: Date) => {
  let i = -1;
  for (let k = 0; k < bs.length && bs[k].start <= d; k++) i = k;
  return i;
};

export const dashboardRouter = Router();

dashboardRouter.get('/', handler(async (req) => {
  const user = me(req);
  const { ids, view } = await ownerFilter(req.query, user);
  const { from, to, prevFrom, prevTo, len } = period(req);
  const pipelineId = str(req.query.pipelineId);
  const base = { orgId: user.orgId, deletedAt: null };

  const [deals, leads, users, activity, pipeline] = await Promise.all([
    prisma.deal.findMany({
      where: { ...base, ...ownedBy(ids), ...(pipelineId && { pipelineId }) },
      include: { stage: true, owner: { select: { id: true, name: true } } },
    }),
    prisma.lead.findMany({
      where: { ...base, ...ownedBy(ids), createdAt: { gte: prevFrom, lte: to } },
      select: { source: true, createdAt: true, convertedAt: true, firstResponseAt: true },
    }),
    prisma.user.findMany({ where: { orgId: user.orgId, deletedAt: null, active: true, ...(ids === 'all' ? {} : { id: { in: ids } }) }, select: { id: true, name: true, quota: true } }),
    prisma.activity.findMany({
      where: { ...base, ...ownedBy(ids) }, orderBy: { createdAt: 'desc' }, take: 15,
      include: { owner: { select: userSelect }, contact: { select: { id: true, firstName: true, lastName: true } }, deal: { select: { id: true, title: true } }, company: { select: { id: true, name: true } } },
    }),
    prisma.pipeline.findFirst({
      where: { orgId: user.orgId, deletedAt: null, ...(pipelineId ? { id: pipelineId } : {}) },
      orderBy: { isDefault: 'desc' }, include: { stages: { orderBy: { order: 'asc' } } },
    }),
  ]);

  const kpisFor = (a: Date, b: Date) => {
    const won = deals.filter((d) => d.status === 'won' && inRange(d.closedAt, a, b));
    const lost = deals.filter((d) => d.status === 'lost' && inRange(d.closedAt, a, b));
    const newLeads = leads.filter((l) => inRange(l.createdAt, a, b));
    // Pipeline as it stood at the end of the window.
    const openAt = deals.filter((d) => d.createdAt <= b && (d.status === 'open' || (d.closedAt && d.closedAt > b)));
    const revenue = won.reduce((s, d) => s + d.value, 0);
    const months = Math.max(1, (b.getTime() - a.getTime()) / (30.44 * DAY));
    const quota = users.reduce((s, u) => s + u.quota, 0) * months;
    const responses = newLeads.filter((l) => l.firstResponseAt).map((l) => (l.firstResponseAt!.getTime() - l.createdAt.getTime()) / 3600e3);
    return {
      revenue, winRate: won.length + lost.length ? (won.length / (won.length + lost.length)) * 100 : 0,
      pipeline: openAt.reduce((s, d) => s + d.value, 0),
      avgDeal: avg(won.map((d) => d.value)),
      newLeads: newLeads.length,
      conversion: newLeads.length ? (newLeads.filter((l) => l.convertedAt).length / newLeads.length) * 100 : 0,
      velocity: avg(won.map((d) => (d.closedAt!.getTime() - d.createdAt.getTime()) / DAY)),
      quota: quota ? (revenue / quota) * 100 : 0,
      response: avg(responses),
      forecast: openAt.reduce((s, d) => s + (d.value * (d.probability ?? d.stage.probability)) / 100, 0),
    };
  };
  const cur = kpisFor(from, to);
  const prev = kpisFor(prevFrom, prevTo);
  const k = (key: keyof typeof cur, label: string, format: Kpi['format']): Kpi => ({ key, label, value: cur[key], previous: prev[key], format });
  const kpis: Kpi[] = [
    k('revenue', 'Revenue won', 'currency'), k('pipeline', 'Open pipeline', 'currency'), k('winRate', 'Win rate', 'percent'),
    k('quota', 'Quota attainment', 'percent'), k('forecast', 'Weighted forecast', 'currency'), k('avgDeal', 'Avg deal size', 'currency'),
    k('newLeads', 'New leads', 'number'), k('conversion', 'Lead conversion', 'percent'), k('velocity', 'Deal velocity', 'days'),
    k('response', 'Lead response time', 'hours'),
  ];

  const bs = buckets(from, to);
  const series = bs.map((b) => ({ date: b.label, revenue: 0, previous: 0 }));
  for (const d of deals) {
    if (d.status !== 'won' || !d.closedAt) continue;
    if (inRange(d.closedAt, from, to)) { const i = bucketIndex(bs, d.closedAt); if (i >= 0) series[i].revenue += d.value; }
    else if (inRange(d.closedAt, prevFrom, prevTo)) { const i = bucketIndex(bs, new Date(d.closedAt.getTime() + len)); if (i >= 0) series[i].previous += d.value; }
  }

  const open = deals.filter((d) => d.status === 'open');
  const dealsByStage = (pipeline?.stages ?? []).map((s) => {
    const ds = open.filter((d) => d.stageId === s.id);
    return { stageId: s.id, name: s.name, count: ds.length, value: ds.reduce((a, d) => a + d.value, 0), weighted: ds.reduce((a, d) => a + (d.value * effectiveProbability(d)) / 100, 0) };
  });

  const ownerMap = new Map<string, { ownerId: string; name: string; won: number; open: number }>();
  for (const d of deals) {
    if (!d.owner) continue;
    const o = ownerMap.get(d.owner.id) ?? { ownerId: d.owner.id, name: d.owner.name, won: 0, open: 0 };
    if (d.status === 'won' && inRange(d.closedAt, from, to)) o.won += d.value;
    if (d.status === 'open') o.open += d.value;
    ownerMap.set(d.owner.id, o);
  }

  const sources = new Map<string, number>();
  leads.filter((l) => inRange(l.createdAt, from, to)).forEach((l) => sources.set(l.source, (sources.get(l.source) ?? 0) + 1));

  const months = Math.max(1, len / (30.44 * DAY));
  const data: DashboardData = {
    period: { from: from.toISOString(), to: to.toISOString(), previousFrom: prevFrom.toISOString(), previousTo: prevTo.toISOString() },
    kpis,
    revenueSeries: series,
    dealsByStage,
    dealsByOwner: [...ownerMap.values()].sort((a, b) => b.won + b.open - (a.won + a.open)).slice(0, 12),
    leadSources: [...sources.entries()].map(([source, count]) => ({ source, count })).sort((a, b) => b.count - a.count),
    coverage: {
      quota: users.reduce((s, u) => s + u.quota, 0) * months, won: cur.revenue,
      weightedPipeline: open.reduce((s, d) => s + (d.value * effectiveProbability(d)) / 100, 0),
      openPipeline: open.reduce((s, d) => s + d.value, 0),
    },
    actions: await ai.nextBestActions(user, { mineOnly: view === 'my', limit: 8 }),
    activity: activity as never,
  };
  // Brand-new workspaces get an onboarding checklist instead of empty charts.
  const orgEmpty = !(await prisma.contact.count({ where: base })) && !(await prisma.deal.count({ where: base })) && !(await prisma.lead.count({ where: base }));
  return { ...data, view, canViewTeam: can(user, 'reports:team'), orgEmpty };
}));

// ---------- reports ----------
export const reportsRouter = Router();

reportsRouter.get('/sales-by-rep', handler(async (req) => {
  const user = me(req);
  const { ids } = await ownerFilter({ ...req.query, view: can(user, 'reports:team') ? 'team' : 'my' }, user);
  const { from, to } = period(req);
  const [users, deals, activities] = await Promise.all([
    prisma.user.findMany({ where: { orgId: user.orgId, deletedAt: null, ...(ids === 'all' ? {} : { id: { in: ids } }) }, select: { id: true, name: true, quota: true } }),
    prisma.deal.findMany({ where: { orgId: user.orgId, deletedAt: null, ...ownedBy(ids) }, include: { stage: true } }),
    prisma.activity.groupBy({ by: ['ownerId'], where: { orgId: user.orgId, deletedAt: null, ...ownedBy(ids), createdAt: { gte: from, lte: to } }, _count: true }),
  ]);
  const months = Math.max(1, (to.getTime() - from.getTime()) / (30.44 * DAY));
  return {
    data: users.map((u) => {
      const mine = deals.filter((d) => d.ownerId === u.id);
      const won = mine.filter((d) => d.status === 'won' && inRange(d.closedAt, from, to));
      const lost = mine.filter((d) => d.status === 'lost' && inRange(d.closedAt, from, to));
      const open = mine.filter((d) => d.status === 'open');
      const revenue = won.reduce((s, d) => s + d.value, 0);
      return {
        ownerId: u.id, name: u.name, wonCount: won.length, revenue, lostCount: lost.length,
        winRate: won.length + lost.length ? (won.length / (won.length + lost.length)) * 100 : null,
        avgDeal: avg(won.map((d) => d.value)), openPipeline: open.reduce((s, d) => s + d.value, 0),
        weighted: open.reduce((s, d) => s + (d.value * effectiveProbability(d)) / 100, 0),
        activities: activities.find((a) => a.ownerId === u.id)?._count ?? 0,
        quotaAttainment: u.quota ? (revenue / (u.quota * months)) * 100 : null,
      };
    }).sort((a, b) => b.revenue - a.revenue),
  };
}));

reportsRouter.get('/pipeline-health', handler(async (req) => {
  const user = me(req);
  const scope = await scopeWhere(user, 'ownerId');
  const pipeline = await prisma.pipeline.findFirst({
    where: { orgId: user.orgId, deletedAt: null, ...(str(req.query.pipelineId) ? { id: str(req.query.pipelineId) } : {}) },
    orderBy: { isDefault: 'desc' }, include: { stages: { orderBy: { order: 'asc' } } },
  });
  if (!pipeline) return { data: [] };
  const deals = await prisma.deal.findMany({ where: { AND: [scope, { pipelineId: pipeline.id, status: 'open' }] } });
  const now = Date.now();
  return {
    pipeline: { id: pipeline.id, name: pipeline.name },
    data: pipeline.stages.map((s) => {
      const ds = deals.filter((d) => d.stageId === s.id);
      return {
        stage: s.name, probability: s.probability, count: ds.length, value: ds.reduce((a, d) => a + d.value, 0),
        avgAgeDays: Math.round(avg(ds.map((d) => (now - d.stageChangedAt.getTime()) / DAY))),
        stalled: ds.filter((d) => (now - (d.lastActivityAt ?? d.createdAt).getTime()) / DAY >= 14).length,
        overdue: ds.filter((d) => d.expectedCloseDate && d.expectedCloseDate.getTime() < now).length,
      };
    }),
  };
}));

reportsRouter.get('/funnel', handler(async (req) => {
  const user = me(req);
  const { from, to } = period(req);
  const scope = await scopeWhere(user, 'ownerId');
  const leads = await prisma.lead.findMany({ where: { AND: [scope, { createdAt: { gte: from, lte: to } }] }, select: { status: true, convertedAt: true, convertedDealId: true } });
  const dealIds = leads.map((l) => l.convertedDealId).filter((x): x is string => !!x);
  const won = dealIds.length ? await prisma.deal.count({ where: { id: { in: dealIds }, status: 'won' } }) : 0;
  return {
    data: [
      { stage: 'Leads created', count: leads.length },
      { stage: 'Contacted', count: leads.filter((l) => l.status !== 'new').length },
      { stage: 'Qualified', count: leads.filter((l) => l.status === 'qualified').length },
      { stage: 'Converted to deal', count: dealIds.length },
      { stage: 'Won', count: won },
    ],
  };
}));

reportsRouter.get('/activity', handler(async (req) => {
  const user = me(req);
  const { from, to } = period(req);
  const scope = await scopeWhere(user, 'ownerId');
  const rows = await prisma.activity.findMany({ where: { AND: [scope, { createdAt: { gte: from, lte: to } }] }, select: { type: true, owner: { select: { id: true, name: true } } } });
  const map = new Map<string, Record<string, number | string>>();
  for (const r of rows) {
    const m = map.get(r.owner.id) ?? { name: r.owner.name, call: 0, email: 0, meeting: 0, note: 0, task: 0, total: 0 };
    m[r.type] = (m[r.type] as number) + 1;
    m.total = (m.total as number) + 1;
    map.set(r.owner.id, m);
  }
  return { data: [...map.values()].sort((a, b) => (b.total as number) - (a.total as number)) };
}));

reportsRouter.get('/lost-reasons', handler(async (req) => {
  const user = me(req);
  const { from, to } = period(req);
  const scope = await scopeWhere(user, 'ownerId');
  const rows = await prisma.deal.findMany({ where: { AND: [scope, { status: 'lost', closedAt: { gte: from, lte: to } }] }, select: { lostReason: true, value: true } });
  const map = new Map<string, { reason: string; count: number; value: number }>();
  for (const r of rows) {
    const key = r.lostReason ?? 'Unspecified';
    const m = map.get(key) ?? { reason: key, count: 0, value: 0 };
    m.count++; m.value += r.value;
    map.set(key, m);
  }
  return { data: [...map.values()].sort((a, b) => b.count - a.count) };
}));

// ---------- custom report builder ----------
type Grouper = { label: string; get: (r: any) => string };
const month = (d: Date | null) => (d ? d.toISOString().slice(0, 7) : 'None');
const ownerName = (r: any) => r.owner?.name ?? r.assignee?.name ?? 'Unassigned';
const ENTITY_DEFS: Record<ReportConfig['entity'], { ownerField: string; date: string; include?: object; metrics: string[]; groups: Record<string, Grouper> }> = {
  deal: {
    ownerField: 'ownerId', date: 'createdAt', include: { stage: true, owner: { select: { name: true } }, pipeline: { select: { name: true } }, company: { select: { name: true } } },
    metrics: ['value', 'probability'],
    groups: {
      stage: { label: 'Stage', get: (r) => r.stage.name }, status: { label: 'Status', get: (r) => r.status }, owner: { label: 'Owner', get: ownerName },
      pipeline: { label: 'Pipeline', get: (r) => r.pipeline.name }, lostReason: { label: 'Lost reason', get: (r) => r.lostReason ?? 'None' },
      company: { label: 'Company', get: (r) => r.company?.name ?? 'None' }, createdMonth: { label: 'Month created', get: (r) => month(r.createdAt) },
      closedMonth: { label: 'Month closed', get: (r) => month(r.closedAt) }, closeMonth: { label: 'Expected close month', get: (r) => month(r.expectedCloseDate) },
    },
  },
  lead: {
    ownerField: 'ownerId', date: 'createdAt', include: { owner: { select: { name: true } } }, metrics: ['score'],
    groups: {
      source: { label: 'Source', get: (r) => r.source }, status: { label: 'Status', get: (r) => r.status }, owner: { label: 'Owner', get: ownerName },
      territory: { label: 'Territory', get: (r) => r.territory ?? 'None' }, companySize: { label: 'Company size', get: (r) => r.companySize ?? 'Unknown' },
      createdMonth: { label: 'Month created', get: (r) => month(r.createdAt) },
    },
  },
  contact: {
    ownerField: 'ownerId', date: 'createdAt', include: { owner: { select: { name: true } } }, metrics: [],
    groups: {
      lifecycleStage: { label: 'Lifecycle stage', get: (r) => r.lifecycleStage }, status: { label: 'Status', get: (r) => r.status },
      source: { label: 'Source', get: (r) => r.source ?? 'Unknown' }, owner: { label: 'Owner', get: ownerName }, createdMonth: { label: 'Month created', get: (r) => month(r.createdAt) },
    },
  },
  company: {
    ownerField: 'ownerId', date: 'createdAt', include: { owner: { select: { name: true } } }, metrics: [],
    groups: {
      industry: { label: 'Industry', get: (r) => r.industry ?? 'Unknown' }, size: { label: 'Size', get: (r) => r.size ?? 'Unknown' },
      territory: { label: 'Territory', get: (r) => r.territory ?? 'None' }, owner: { label: 'Owner', get: ownerName },
    },
  },
  activity: {
    ownerField: 'ownerId', date: 'createdAt', include: { owner: { select: { name: true } } }, metrics: ['durationMin'],
    groups: {
      type: { label: 'Type', get: (r) => r.type }, owner: { label: 'Owner', get: ownerName }, outcome: { label: 'Outcome', get: (r) => r.outcome ?? 'None' },
      createdMonth: { label: 'Month', get: (r) => month(r.createdAt) },
    },
  },
  task: {
    ownerField: 'assigneeId', date: 'createdAt', include: { assignee: { select: { name: true } } }, metrics: [],
    groups: {
      status: { label: 'Status', get: (r) => r.status }, priority: { label: 'Priority', get: (r) => r.priority }, assignee: { label: 'Assignee', get: ownerName },
      dueMonth: { label: 'Due month', get: (r) => month(r.dueDate) },
    },
  },
  ticket: {
    ownerField: 'assigneeId', date: 'createdAt', include: { assignee: { select: { name: true } } }, metrics: [],
    groups: {
      status: { label: 'Status', get: (r) => r.status }, priority: { label: 'Priority', get: (r) => r.priority }, channel: { label: 'Channel', get: (r) => r.channel },
      assignee: { label: 'Assignee', get: ownerName }, createdMonth: { label: 'Month created', get: (r) => month(r.createdAt) },
    },
  },
};

reportsRouter.get('/builder/schema', handler(async () => ({
  entities: Object.fromEntries(Object.entries(ENTITY_DEFS).map(([k, v]) => [k, {
    metrics: v.metrics, groups: Object.fromEntries(Object.entries(v.groups).map(([g, d]) => [g, d.label])),
  }])),
})));

export async function runReport(user: AuthUser, config: ReportConfig) {
  const def = ENTITY_DEFS[config.entity];
  const group = def.groups[config.groupBy];
  if (!group) throw badRequest('Choose a valid "group by" field');
  if (config.metric !== 'count' && (!config.metricField || !def.metrics.includes(config.metricField))) throw badRequest('Choose a numeric field for the metric');
  const scope = await scopeWhere(user, def.ownerField);
  const rows: any[] = await (prisma as any)[config.entity].findMany({
    where: { AND: [scope, { [def.date]: { ...(config.from && { gte: config.from }), ...(config.to && { lte: config.to }) } }] },
    include: def.include, take: 20000,
  });
  const filtered = rows.filter((r) => config.filters.every((f) => evaluate(f, r)));
  const map = new Map<string, number[]>();
  for (const r of filtered) {
    const key = String(group.get(r));
    map.set(key, [...(map.get(key) ?? []), config.metric === 'count' ? 1 : Number(r[config.metricField!] ?? 0)]);
  }
  const data = [...map.entries()].map(([key, xs]) => ({
    key, value: config.metric === 'count' ? xs.length : config.metric === 'sum' ? xs.reduce((a, b) => a + b, 0) : avg(xs),
  })).sort((a, b) => (/^\d{4}-\d{2}$/.test(a.key) ? a.key.localeCompare(b.key) : b.value - a.value));
  return { data, rowsScanned: filtered.length, groupLabel: group.label };
}

reportsRouter.post('/run', handler(async (req) => runReport(me(req), parse(reportConfigSchema, req.body))));

const serReport = (r: { config: string }) => ({ ...r, config: json(r.config, null) });
reportsRouter.get('/saved', handler(async (req) => ({
  data: (await prisma.report.findMany({ where: { orgId: me(req).orgId, deletedAt: null }, orderBy: { createdAt: 'desc' } })).map(serReport),
})));
reportsRouter.post('/saved', requirePermission('reports:build'), handler(async (req, res) => {
  const input = parse(reportSchema, req.body);
  const r = await prisma.report.create({ data: { ...input, config: JSON.stringify(input.config), orgId: me(req).orgId, ownerId: me(req).id } });
  res.status(201);
  return serReport(r);
}));
async function ownReport(req: Request) {
  const r = await prisma.report.findFirst({ where: { id: req.params.id, orgId: me(req).orgId, deletedAt: null } });
  if (!r) throw notFound('Report');
  if (r.ownerId !== me(req).id && !can(me(req), 'settings:manage')) throw forbidden();
  return r;
}
reportsRouter.put('/saved/:id', requirePermission('reports:build'), handler(async (req) => {
  const r = await ownReport(req);
  const input = parse(reportSchema, req.body);
  return serReport(await prisma.report.update({ where: { id: r.id }, data: { ...input, config: JSON.stringify(input.config) } }));
}));
reportsRouter.delete('/saved/:id', handler(async (req) => {
  const r = await ownReport(req);
  await prisma.report.update({ where: { id: r.id }, data: { deletedAt: new Date() } });
  return { ok: true };
}));

/** Email a saved report now (the scheduler calls the same function). */
export async function deliverReport(reportId: string) {
  const report = await prisma.report.findUniqueOrThrow({ where: { id: reportId } });
  const owner = await prisma.user.findUniqueOrThrow({ where: { id: report.ownerId }, include: { org: true } });
  const recipients = (report.recipients ?? owner.email).split(/[,;\s]+/).filter((e) => /@/.test(e));
  const role = owner.role as Role;
  const permissions = new Set(resolveRolePermissions(json(owner.org.rolePermissions, null))[role]);
  const authUser: AuthUser = { id: owner.id, orgId: owner.orgId, name: owner.name, email: owner.email, role, teamId: owner.teamId, permissions };
  const result = await runReport(authUser, json(report.config, {} as ReportConfig));
  const text = [`${report.name}`, '', ...result.data.map((d) => `${d.key}: ${Math.round(d.value * 100) / 100}`)].join('\n');
  for (const to of recipients) await emailProvider.send({ from: owner.email, to, subject: `Report: ${report.name}`, text });
  await prisma.report.update({ where: { id: report.id }, data: { lastSentAt: new Date() } });
  return recipients.length;
}
reportsRouter.post('/saved/:id/send', handler(async (req) => {
  const r = await ownReport(req);
  const sent = await deliverReport(r.id);
  await audit(req, 'send_report', 'report', r.id, { recipients: sent });
  return { sent, provider: emailProvider.name };
}));
