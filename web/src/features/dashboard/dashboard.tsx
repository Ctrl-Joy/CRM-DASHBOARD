import * as React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Funnel, FunnelChart, LabelList, Legend, Pie, PieChart, PolarAngleAxis,
  RadialBar, RadialBarChart, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis,
} from 'recharts';
import {
  Activity as ActivityIcon, AlertTriangle, ArrowDownRight, ArrowUpRight, Briefcase, CalendarClock, CheckSquare, Clock, Flame,
  Gauge, LifeBuoy, ListChecks, Minus, Phone, Plus, Rocket, Target, TrendingUp, Users,
} from 'lucide-react';
import { startOfMonth, startOfQuarter, startOfYear, subDays } from 'date-fns';
import { labelize, type DashboardData, type Kpi, type NextBestAction } from '@crm/shared';
import { api } from '@/lib/api';
import { ago, cn, fullName, money, num, pct } from '@/lib/utils';
import { useCan, useMe, usePipelines, useTeams, useUsers } from '@/hooks/data';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, EmptyState, PageHeader, Skeleton, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/display';
import { Select } from '@/components/ui/form';
import { Tooltip } from '@/components/ui/overlay';
import { ACTIVITY_ICON, LogActivityDialog } from '@/components/records/activity';
import { useQuickCreate } from '@/features/forms';

type Dash = DashboardData & { view: 'my' | 'team'; canViewTeam: boolean; orgEmpty: boolean };
const COLORS = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))', 'hsl(var(--chart-6))'];
const PERIODS = {
  month: { label: 'This month', from: () => startOfMonth(new Date()) },
  last30: { label: 'Last 30 days', from: () => subDays(new Date(), 30) },
  quarter: { label: 'This quarter', from: () => startOfQuarter(new Date()) },
  year: { label: 'This year', from: () => startOfYear(new Date()) },
} as const;
type PeriodKey = keyof typeof PERIODS;
const LOWER_IS_BETTER = new Set(['velocity', 'response']);

function formatKpi(k: Kpi, currency: string) {
  switch (k.format) {
    case 'currency': return money(k.value, currency, true);
    case 'percent': return pct(k.value);
    case 'days': return k.value ? `${num(k.value, 1)} d` : '—';
    case 'hours': return k.value ? (k.value < 1 ? `${num(k.value * 60)} min` : `${num(k.value, 1)} h`) : '—';
    default: return num(k.value);
  }
}

function Trend({ k }: { k: Kpi }) {
  if (k.previous === null) return null;
  const prev = k.previous, cur = k.value;
  if (!prev && !cur) return <span className="text-xs text-muted-foreground">No change</span>;
  const change = prev ? ((cur - prev) / Math.abs(prev)) * 100 : 100;
  const up = change > 0.5, down = change < -0.5;
  const good = LOWER_IS_BETTER.has(k.key) ? down : up;
  const bad = LOWER_IS_BETTER.has(k.key) ? up : down;
  const Icon = up ? ArrowUpRight : down ? ArrowDownRight : Minus;
  return (
    <span className={cn('inline-flex items-center gap-0.5 text-xs font-medium', good && 'text-success', bad && 'text-destructive', !good && !bad && 'text-muted-foreground')}>
      <Icon className="size-3.5" aria-hidden />
      {prev ? `${num(Math.abs(change), 0)}%` : 'new'}
      <span className="sr-only">{up ? 'up' : down ? 'down' : 'flat'} versus previous period</span>
    </span>
  );
}

function KpiCard({ k, currency, icon: Icon, action }: { k: Kpi; currency: string; icon: typeof TrendingUp; action?: React.ReactNode }) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">{k.label}</p>
        <span className="rounded-md bg-primary/10 p-1.5 text-primary"><Icon className="size-3.5" aria-hidden /></span>
      </div>
      <p className="mt-1 text-2xl font-semibold tracking-tight tabular">{formatKpi(k, currency)}</p>
      <div className="mt-1 flex items-center justify-between gap-2"><span className="flex items-center gap-1.5"><Trend k={k} /><span className="text-xs text-muted-foreground">vs prev.</span></span>{action}</div>
    </Card>
  );
}

const ACTION_META: Record<NextBestAction['kind'], { icon: typeof Clock; tone: string; label: string }> = {
  overdue_task: { icon: Clock, tone: 'text-destructive bg-destructive/10', label: 'Overdue task' },
  sla_breach: { icon: LifeBuoy, tone: 'text-destructive bg-destructive/10', label: 'Support SLA' },
  closing_soon: { icon: CalendarClock, tone: 'text-success bg-success/10', label: 'Closing soon' },
  stalled_deal: { icon: AlertTriangle, tone: 'text-warning bg-warning/10', label: 'Stalled deal' },
  at_risk: { icon: AlertTriangle, tone: 'text-warning bg-warning/10', label: 'At risk' },
  lead_follow_up: { icon: Flame, tone: 'text-chart-4 bg-chart-4/10', label: 'Lead follow-up' },
};

function NextActions({ actions, onLogCall }: { actions: NextBestAction[]; onLogCall: (a: NextBestAction) => void }) {
  const quick = useQuickCreate((s) => s.open);
  if (!actions.length) {
    return <EmptyState icon={ListChecks} title="You're all caught up" description="Nothing urgent right now. New overdue tasks, stalled deals and hot leads will appear here." className="py-8" />;
  }
  return (
    <ul className="divide-y">
      {actions.map((a) => {
        const meta = ACTION_META[a.kind];
        return (
          <li key={a.id} className="group flex items-center gap-3 py-2.5">
            <span className={cn('rounded-md p-1.5', meta.tone)}><meta.icon className="size-4" aria-hidden /></span>
            <div className="min-w-0 flex-1">
              <Link to={a.link} className="block truncate text-sm font-medium hover:underline">{a.title}</Link>
              <p className="truncate text-xs text-muted-foreground"><span className="font-medium">{meta.label}</span> · {a.reason}</p>
            </div>
            <div className="flex shrink-0 gap-1 opacity-100 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
              {(a.entity.type === 'deal' || a.entity.type === 'lead') && (
                <Tooltip content="Log a call"><Button size="icon-sm" variant="ghost" onClick={() => onLogCall(a)} aria-label={`Log call for ${a.title}`}><Phone /></Button></Tooltip>
              )}
              {a.entity.type !== 'task' && (
                <Tooltip content="Create follow-up task">
                  <Button size="icon-sm" variant="ghost" aria-label={`Create task for ${a.title}`}
                    onClick={() => quick('task', { [`${a.entity.type}Id`]: a.entity.id, title: `Follow up: ${a.title}` })}><CheckSquare /></Button>
                </Tooltip>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function ActivityFeed({ items }: { items: DashboardData['activity'] }) {
  if (!items.length) return <EmptyState icon={ActivityIcon} title="No activity yet" description="Calls, emails, meetings and notes your team logs will show up here." className="py-8" />;
  return (
    <ul className="space-y-3">
      {items.map((a) => {
        const Icon = ACTIVITY_ICON[a.type] ?? ActivityIcon;
        const about = a.deal?.title ?? (a.contact ? fullName(a.contact) : a.company?.name);
        const link = a.deal ? `/deals/${a.deal.id}` : a.contact ? `/contacts/${a.contact.id}` : a.company ? `/companies/${a.company.id}` : undefined;
        return (
          <li key={a.id} className="flex gap-3 text-sm">
            <span className="mt-0.5 rounded-full bg-muted p-1.5"><Icon className="size-3.5 text-muted-foreground" aria-hidden /></span>
            <div className="min-w-0">
              <p className="truncate"><span className="font-medium">{a.owner?.name}</span> logged {a.type === 'note' ? 'a note' : `a ${a.type}`}: {a.subject}</p>
              <p className="text-xs text-muted-foreground">{link ? <Link to={link} className="hover:underline">{about}</Link> : about}{about && ' · '}{ago(a.createdAt)}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function Onboarding() {
  const quick = useQuickCreate((s) => s.open);
  const steps = [
    { icon: Users, title: 'Add your first contact', action: () => quick('contact') },
    { icon: Briefcase, title: 'Create a deal in your pipeline', action: () => quick('deal') },
    { icon: Target, title: 'Capture or import leads', to: '/leads' },
    { icon: Gauge, title: 'Invite your team and set quotas', to: '/settings/users' },
    { icon: Rocket, title: 'Automate a follow-up', to: '/automations' },
  ];
  return (
    <Card className="mb-5 border-primary/30 bg-gradient-to-r from-primary/5 via-transparent to-transparent">
      <CardHeader title="Welcome to your new CRM" description="Your workspace is empty and ready. These steps get you to a useful dashboard fast." icon={Rocket} />
      <CardBody>
        <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {steps.map((s, i) => {
            const inner = <><span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{i + 1}</span><s.icon className="size-4 text-muted-foreground" aria-hidden /><span className="text-left">{s.title}</span></>;
            const cls = 'flex h-full w-full items-center gap-2 rounded-lg border bg-card p-3 text-sm font-medium transition-colors hover:border-primary hover:bg-primary/5';
            return <li key={s.title}>{s.to ? <Link to={s.to} className={cls}>{inner}</Link> : <button onClick={s.action} className={cls}>{inner}</button>}</li>;
          })}
        </ol>
      </CardBody>
    </Card>
  );
}

/** Running totals, so this period and the previous one compare as trend lines. */
function cumulative(series: DashboardData['revenueSeries']) {
  let rev = 0, prev = 0;
  return series.map((p) => ({ date: p.date, revenue: (rev += p.revenue), previous: (prev += p.previous) }));
}

const tooltipStyle = { contentStyle: { background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12, color: 'hsl(var(--popover-foreground))' } };

export function DashboardPage() {
  const { data: me } = useMe();
  const { data: pipelines = [] } = usePipelines();
  const { data: teams = [] } = useTeams();
  const { data: users = [] } = useUsers();
  const navigate = useNavigate();
  const quick = useQuickCreate((s) => s.open);
  // Role-based default: managers and executives land on the team view.
  const [view, setView] = React.useState<'my' | 'team'>(() =>
    me?.permissions.includes('reports:team') && me.role !== 'rep' ? 'team' : 'my');
  const [period, setPeriod] = React.useState<PeriodKey>('month');
  const [filters, setFilters] = React.useState({ ownerId: '', teamId: '', pipelineId: '', territory: '' });
  const [showAll, setShowAll] = React.useState(false);
  const [logFor, setLogFor] = React.useState<NextBestAction | null>(null);
  const currency = me?.org.currency ?? 'USD';
  const canTeam = !!me?.permissions.includes('reports:team');

  const params = { view, from: PERIODS[period].from().toISOString(), ...(view === 'team' ? filters : { pipelineId: filters.pipelineId }) };
  const { data, isLoading, isError, error } = useQuery({ queryKey: ['dashboard', params], queryFn: () => api.get<Dash>('/dashboard', params), refetchInterval: 60_000 });
  const territories = [...new Set(users.map((u) => u.territory).filter(Boolean))] as string[];
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const isEmpty = !!data?.orgEmpty;
  const kpi = (key: string) => data?.kpis.find((k) => k.key === key);

  return (
    <>
      <PageHeader title={`${greet}, ${me?.name.split(' ')[0] ?? ''}`} description={view === 'my' ? 'Your numbers and what needs your attention.' : 'How the team is tracking.'}
        actions={
          <>
            {canTeam && (
              <div className="inline-flex rounded-md border bg-card p-0.5" role="group" aria-label="Dashboard view">
                {(['my', 'team'] as const).map((v) => (
                  <button key={v} onClick={() => setView(v)} aria-pressed={view === v}
                    className={cn('rounded px-3 py-1 text-sm font-medium', view === v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}>
                    {v === 'my' ? 'My dashboard' : 'Team dashboard'}
                  </button>
                ))}
              </div>
            )}
            <Select aria-label="Date range" value={period} onChange={(e) => setPeriod(e.target.value as PeriodKey)} className="w-36">
              {Object.entries(PERIODS).map(([k, p]) => <option key={k} value={k}>{p.label}</option>)}
            </Select>
            {pipelines.length > 1 && (
              <Select aria-label="Pipeline" value={filters.pipelineId} onChange={(e) => setFilters({ ...filters, pipelineId: e.target.value })} className="w-40">
                <option value="">Default pipeline</option>{pipelines.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            )}
            {view === 'team' && (
              <>
                <Select aria-label="Owner" value={filters.ownerId} onChange={(e) => setFilters({ ...filters, ownerId: e.target.value })} className="w-36">
                  <option value="">All owners</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </Select>
                {teams.length > 0 && (
                  <Select aria-label="Team" value={filters.teamId} onChange={(e) => setFilters({ ...filters, teamId: e.target.value })} className="w-32">
                    <option value="">All teams</option>{teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </Select>
                )}
                {territories.length > 0 && (
                  <Select aria-label="Territory" value={filters.territory} onChange={(e) => setFilters({ ...filters, territory: e.target.value })} className="w-36">
                    <option value="">All territories</option>{territories.map((t) => <option key={t}>{t}</option>)}
                  </Select>
                )}
              </>
            )}
          </>
        } />

      {isError && <Card><EmptyState icon={AlertTriangle} title="Couldn't load the dashboard" description={(error as Error).message} /></Card>}
      {isEmpty && <Onboarding />}

      {/* KPIs: most critical, top-left */}
      <section aria-label="Key metrics" className="mb-5">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {isLoading || !data ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[104px] rounded-xl" />) : (
            <>
              <KpiCard k={kpi('revenue')!} currency={currency} icon={TrendingUp} />
              <KpiCard k={kpi('pipeline')!} currency={currency} icon={Briefcase} action={<Button size="sm" variant="ghost" className="h-6 px-1.5 text-xs" onClick={() => quick('deal')}><Plus className="size-3" />Deal</Button>} />
              <KpiCard k={kpi('winRate')!} currency={currency} icon={Target} />
              <KpiCard k={kpi('quota')!} currency={currency} icon={Gauge} />
            </>
          )}
        </div>
        {data && (
          <>
            {showAll && (
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                {data.kpis.filter((k) => !['revenue', 'pipeline', 'winRate', 'quota'].includes(k.key)).map((k) => (
                  <Card key={k.key} className="p-3">
                    <p className="truncate text-xs text-muted-foreground">{k.label}</p>
                    <p className="mt-0.5 text-lg font-semibold tabular">{formatKpi(k, currency)}</p>
                    <Trend k={k} />
                  </Card>
                ))}
              </div>
            )}
            <button className="mt-2 text-xs font-medium text-primary hover:underline" onClick={() => setShowAll((s) => !s)} aria-expanded={showAll}>
              {showAll ? 'Show fewer metrics' : 'Show all 10 metrics'}
            </button>
          </>
        )}
      </section>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Next best actions + activity */}
        <Card className="lg:col-span-2">
          <Tabs defaultValue="actions">
            <CardHeader title="What to do next" description="Ranked by urgency and deal value" icon={ListChecks}
              action={<TabsList className="shrink-0"><TabsTrigger value="actions">Actions{data?.actions.length ? ` (${data.actions.length})` : ''}</TabsTrigger><TabsTrigger value="activity">Activity</TabsTrigger></TabsList>} />
            <CardBody className="pt-1">
              {isLoading ? <Skeleton className="h-64" /> : (
                <>
                  <TabsContent value="actions" className="mt-0"><NextActions actions={data?.actions ?? []} onLogCall={setLogFor} /></TabsContent>
                  <TabsContent value="activity" className="mt-2"><ActivityFeed items={data?.activity ?? []} /></TabsContent>
                </>
              )}
            </CardBody>
          </Tabs>
        </Card>

        {/* Coverage gauge */}
        <Card>
          <CardHeader title="Quota & pipeline coverage" icon={Gauge} description={PERIODS[period].label}
            action={<Button size="sm" variant="ghost" onClick={() => navigate('/deals')}>Pipeline</Button>} />
          <CardBody>
            {isLoading || !data ? <Skeleton className="h-56" /> : <Coverage data={data} currency={currency} />}
          </CardBody>
        </Card>

        {/* Revenue trend */}
        <Card className="lg:col-span-2">
          <CardHeader title="Revenue over time" description="Cumulative won revenue vs the previous period" icon={TrendingUp}
            action={<Button size="sm" variant="ghost" onClick={() => quick('deal')}><Plus />Add deal</Button>} />
          <CardBody className="h-72">
            {isLoading || !data ? <Skeleton className="h-full" /> : data.revenueSeries.every((p) => !p.revenue && !p.previous)
              ? <EmptyState icon={TrendingUp} title="No won deals in this period" description="Revenue appears here when deals are marked won." className="py-10" />
              : (
                <ResponsiveContainer>
                  <AreaChart data={cumulative(data.revenueSeries)} margin={{ left: 0, right: 8, top: 8 }}>
                    <defs><linearGradient id="rev" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="hsl(var(--chart-1))" stopOpacity={0.3} /><stop offset="100%" stopColor="hsl(var(--chart-1))" stopOpacity={0} /></linearGradient></defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} minTickGap={24} tickFormatter={(d: string) => d.length > 7 ? d.slice(5) : d} />
                    <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} width={56} tickFormatter={(v: number) => money(v, currency, true)} />
                    <RTooltip {...tooltipStyle} formatter={(v: number, n: string) => [money(v, currency), n === 'revenue' ? 'This period' : 'Previous period']} />
                    <Area type="stepAfter" dataKey="previous" stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" fill="none" strokeWidth={1.5} />
                    <Area type="stepAfter" dataKey="revenue" stroke="hsl(var(--chart-1))" fill="url(#rev)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              )}
          </CardBody>
        </Card>

        {/* Funnel */}
        <Card>
          <CardHeader title="Pipeline by stage" description="Open deals (count)" icon={Briefcase} action={<Button size="sm" variant="ghost" onClick={() => navigate('/deals')}>Board</Button>} />
          <CardBody className="h-72">
            {isLoading || !data ? <Skeleton className="h-full" /> : !data.dealsByStage.some((s) => s.count)
              ? <EmptyState icon={Briefcase} title="No open deals" action={<Button size="sm" onClick={() => quick('deal')}><Plus />New deal</Button>} className="py-8" />
              : (
                <ResponsiveContainer>
                  <FunnelChart>
                    <RTooltip {...tooltipStyle} formatter={(_v, _n, p) => {
                      const s = p.payload as DashboardData['dealsByStage'][number];
                      return [`${s.count} deals · ${money(s.value, currency, true)}`, s.name];
                    }} />
                    <Funnel dataKey="count" data={data.dealsByStage.filter((s) => s.count).map((s, i) => ({ ...s, fill: COLORS[i % COLORS.length] }))} isAnimationActive={false}>
                      <LabelList position="center" dataKey="name" fill="#fff" stroke="none" fontSize={11} fontWeight={600} />
                    </Funnel>
                  </FunnelChart>
                </ResponsiveContainer>
              )}
          </CardBody>
        </Card>

        {/* By owner */}
        <Card className="lg:col-span-2">
          <CardHeader title="Deals by owner" description="Won this period vs open pipeline" icon={Users} />
          <CardBody className="h-72">
            {isLoading || !data ? <Skeleton className="h-full" /> : !data.dealsByOwner.length
              ? <EmptyState icon={Users} title="No deals yet" description="Each rep's won and open value appears here." className="py-10" />
              : (
                <ResponsiveContainer>
                  <BarChart data={data.dealsByOwner} margin={{ left: 0, right: 8, top: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} interval={0} />
                    <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} width={56} tickFormatter={(v: number) => money(v, currency, true)} />
                    <RTooltip {...tooltipStyle} cursor={{ fill: 'hsl(var(--muted))' }} formatter={(v: number, n: string) => [money(v, currency), labelize(n)]} />
                    <Legend wrapperStyle={{ fontSize: 12 }} formatter={(v: string) => labelize(v)} />
                    <Bar dataKey="won" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="open" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
          </CardBody>
        </Card>

        {/* Lead sources */}
        <Card>
          <CardHeader title="Lead sources" description="New leads this period" icon={Target} action={<Button size="sm" variant="ghost" onClick={() => quick('lead')}><Plus />Lead</Button>} />
          <CardBody className="h-72">
            {isLoading || !data ? <Skeleton className="h-full" /> : !data.leadSources.length
              ? <EmptyState icon={Target} title="No new leads" description="Share your lead form from Settings → Lead capture." className="py-8" />
              : (
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={data.leadSources} dataKey="count" nameKey="source" innerRadius="55%" outerRadius="80%" paddingAngle={2}>
                      {data.leadSources.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <RTooltip {...tooltipStyle} formatter={(v: number, n: string) => [`${v} leads`, labelize(n)]} />
                    <Legend wrapperStyle={{ fontSize: 12 }} formatter={(v: string) => labelize(v)} />
                  </PieChart>
                </ResponsiveContainer>
              )}
          </CardBody>
        </Card>
      </div>

      {logFor && (
        <LogActivityDialog open onOpenChange={(o) => !o && setLogFor(null)} type="call"
          related={{ [`${logFor.entity.type}Id`]: logFor.entity.id }} invalidate={[['dashboard']]} />
      )}
    </>
  );
}

function Coverage({ data, currency }: { data: DashboardData; currency: string }) {
  const canManageUsers = useCan()('users:manage');
  const { quota, won, weightedPipeline, openPipeline } = data.coverage;
  const attainment = quota ? (won / quota) * 100 : 0;
  const remaining = Math.max(0, quota - won);
  const coverage = remaining ? openPipeline / remaining : null;
  if (!quota) {
    return (
      <EmptyState icon={Gauge} title="No quota set"
        description={canManageUsers ? 'Set monthly quotas per user to track attainment and coverage.' : 'Ask an admin to set your monthly quota to track attainment.'}
        action={canManageUsers && <Button asChild size="sm" variant="outline"><Link to="/settings/users">Set quotas</Link></Button>} className="py-6" />
    );
  }
  return (
    <div>
      <div className="relative h-40">
        <ResponsiveContainer>
          <RadialBarChart innerRadius="72%" outerRadius="100%" data={[{ value: Math.min(100, attainment) }]} startAngle={210} endAngle={-30}>
            <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
            <RadialBar dataKey="value" cornerRadius={8} fill={attainment >= 100 ? 'hsl(var(--success))' : 'hsl(var(--chart-1))'} background={{ fill: 'hsl(var(--muted))' }} />
          </RadialBarChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <p className="text-2xl font-semibold tabular">{pct(attainment)}</p>
          <p className="text-xs text-muted-foreground">of {money(quota, currency, true)} quota</p>
        </div>
      </div>
      <dl className="mt-2 grid grid-cols-3 gap-2 text-center text-xs">
        <div><dt className="text-muted-foreground">Won</dt><dd className="font-semibold tabular">{money(won, currency, true)}</dd></div>
        <div><dt className="text-muted-foreground">Weighted</dt><dd className="font-semibold tabular">{money(weightedPipeline, currency, true)}</dd></div>
        <div><dt className="text-muted-foreground">Coverage</dt><dd className={cn('font-semibold tabular', coverage !== null && coverage < 3 && 'text-warning')}>{coverage === null ? 'Met' : `${num(coverage, 1)}×`}</dd></div>
      </dl>
      {coverage !== null && coverage < 3 && <p className="mt-3 rounded-md bg-warning/10 px-3 py-2 text-xs text-warning">Pipeline covers less than 3× the remaining quota. Add or advance deals.</p>}
    </div>
  );
}
