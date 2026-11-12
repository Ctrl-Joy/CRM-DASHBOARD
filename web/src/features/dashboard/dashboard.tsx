import * as React from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Activity as ActivityIcon, AlertTriangle, ArrowDownRight, ArrowRight, ArrowUpRight, Briefcase, CalendarClock, Check, CheckSquare, Clock, Flame,
  Gauge, LifeBuoy, ListChecks, Minus, Phone, Plus, Rocket, SlidersHorizontal, Target, Users,
} from 'lucide-react';
import { startOfMonth, startOfQuarter, startOfYear, subDays } from 'date-fns';
import { labelize, type DashboardData, type Kpi, type NextBestAction } from '@crm/shared';
import { api } from '@/lib/api';
import { ago, cn, fullName, money, num, pct } from '@/lib/utils';
import { useCan, useMe, usePipelines, useTeams, useUsers } from '@/hooks/data';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, EmptyState, PageHeader, Progress, Skeleton, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/display';
import { Field, Select } from '@/components/ui/form';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/overlay';
import { ACTIVITY_ICON, LogActivityDialog } from '@/components/records/activity';
import { useQuickCreate } from '@/features/forms';

const RevenueChart = React.lazy(() => import('./dashboard-charts').then((m) => ({ default: m.RevenueChart })));
const OwnerChart = React.lazy(() => import('./dashboard-charts').then((m) => ({ default: m.OwnerChart })));

type Dash = DashboardData & { view: 'my' | 'team'; canViewTeam: boolean; orgEmpty: boolean };
const PERIODS = {
  month: { label: 'This month', from: () => startOfMonth(new Date()) },
  last30: { label: 'Last 30 days', from: () => subDays(new Date(), 30) },
  quarter: { label: 'This quarter', from: () => startOfQuarter(new Date()) },
  year: { label: 'This year', from: () => startOfYear(new Date()) },
} as const;
type PeriodKey = keyof typeof PERIODS;
const LOWER_IS_BETTER = new Set(['velocity', 'response']);
const HEADLINE = ['revenue', 'pipeline', 'winRate', 'quota'];

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

// One meaning per colour: red is late, amber is at risk, green is money about
// to land, blue is new.
const ACTION_META: Record<NextBestAction['kind'], { icon: typeof Clock; tone: string; label: string; open: string }> = {
  overdue_task: { icon: Clock, tone: 'text-destructive', label: 'Overdue task', open: 'Open' },
  sla_breach: { icon: LifeBuoy, tone: 'text-destructive', label: 'Support SLA', open: 'Open ticket' },
  closing_soon: { icon: CalendarClock, tone: 'text-success', label: 'Closing soon', open: 'Open deal' },
  stalled_deal: { icon: AlertTriangle, tone: 'text-warning', label: 'Stalled deal', open: 'Open deal' },
  at_risk: { icon: AlertTriangle, tone: 'text-warning', label: 'At risk', open: 'Open deal' },
  lead_follow_up: { icon: Flame, tone: 'text-accent', label: 'New lead', open: 'Open lead' },
};

/** Marks a task done from the dashboard, with undo. */
function useCompleteTask() {
  const qc = useQueryClient();
  const set = async (id: string, done: boolean) => {
    try {
      await api.patch(`/tasks/${id}`, { status: done ? 'done' : 'todo' });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['/tasks'] });
      if (done) toast.success('Task completed', { action: { label: 'Undo', onClick: () => set(id, false) } });
    } catch (e) { toast.error((e as Error).message); }
  };
  return (id: string) => set(id, true);
}

/** The single most useful thing to do right now, with the one action that does it. */
function NextHero({ action, position, total, onLogCall, onSkip }: {
  action: NextBestAction; position: number; total: number; onLogCall: (a: NextBestAction) => void; onSkip: () => void;
}) {
  const quick = useQuickCreate((s) => s.open);
  const complete = useCompleteTask();
  const meta = ACTION_META[action.kind];
  const canCall = action.entity.type === 'deal' || action.entity.type === 'lead';
  return (
    <Card className="p-5 sm:p-7">
      <div className="flex items-center justify-between gap-3 text-xs">
        <p className={cn('inline-flex items-center gap-1.5 font-medium', meta.tone)}><meta.icon className="size-3.5" aria-hidden />{meta.label}</p>
        <p className="text-muted-foreground tabular">{position} of {total}</p>
      </div>
      <h2 className="mt-3 font-display text-[1.75rem] leading-[1.1] tracking-tight sm:text-4xl">{action.title}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{action.reason}</p>
      <div className="mt-5 flex flex-wrap items-center gap-2 [&>*]:flex-1 sm:[&>*]:flex-none [&>*:first-child]:basis-full sm:[&>*:first-child]:basis-auto">
        {action.entity.type === 'task' ? (
          <Button onClick={() => complete(action.entity.id)}><Check />Mark done</Button>
        ) : canCall ? (
          <Button onClick={() => onLogCall(action)}><Phone />Log a call</Button>
        ) : (
          <Button asChild><Link to={action.link}>{meta.open}<ArrowRight /></Link></Button>
        )}
        {(action.entity.type === 'task' || canCall) && <Button asChild variant="outline"><Link to={action.link}>{meta.open}</Link></Button>}
        {action.entity.type !== 'task' && (
          <Button variant="ghost" onClick={() => quick('task', { [`${action.entity.type}Id`]: action.entity.id, title: `Follow up: ${action.title}` })}><CheckSquare />Add task</Button>
        )}
        {total > 1 && <Button variant="ghost" className="sm:ml-auto" onClick={onSkip}>Skip</Button>}
      </div>
    </Card>
  );
}

function NextActions({ actions, onPick }: { actions: NextBestAction[]; onPick: (a: NextBestAction) => void }) {
  if (!actions.length) return <p className="py-6 text-center text-sm text-muted-foreground">Nothing else is waiting.</p>;
  return (
    <ul className="divide-y">
      {actions.map((a) => {
        const meta = ACTION_META[a.kind];
        return (
          <li key={a.id}>
            <button onClick={() => onPick(a)} className="flex w-full items-center gap-3 py-3 text-left">
              <meta.icon className={cn('size-4 shrink-0', meta.tone)} aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{a.title}</span>
                <span className="block truncate text-xs text-muted-foreground">{meta.label} · {a.reason}</span>
              </span>
            </button>
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
    <Card className="p-5 sm:p-7">
      <p className="inline-flex items-center gap-1.5 text-xs font-medium text-accent"><Rocket className="size-3.5" aria-hidden />Getting started</p>
      <h2 className="mt-3 font-display text-[1.75rem] leading-[1.1] tracking-tight sm:text-4xl">Add your first contact</h2>
      <p className="mt-2 text-sm text-muted-foreground">Your workspace is empty. Once it has people, deals and tasks, this card tells you what to do next.</p>
      <div className="mt-5">
        <ol className="grid gap-2 sm:grid-cols-2">
          {steps.map((s, i) => {
            const inner = <><span className="flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-medium text-muted-foreground">{i + 1}</span><s.icon className="size-4 text-muted-foreground" aria-hidden /><span className="text-left">{s.title}</span></>;
            const cls = 'flex h-full min-h-11 w-full items-center gap-2 rounded-lg border bg-card p-3 text-sm font-medium transition-colors hover:bg-secondary';
            return <li key={s.title}>{s.to ? <Link to={s.to} className={cls}>{inner}</Link> : <button onClick={s.action} className={cls}>{inner}</button>}</li>;
          })}
        </ol>
      </div>
    </Card>
  );
}

/** Renders its children (and so downloads their code) only once they are about to scroll into view. */
function WhenVisible({ children, fallback }: { children: React.ReactNode; fallback: React.ReactNode }) {
  const [seen, setSeen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (seen || !ref.current) return;
    const io = new IntersectionObserver((e) => { if (e.some((x) => x.isIntersecting)) setSeen(true); }, { rootMargin: '300px' });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [seen]);
  if (!seen) return <><div ref={ref} className="-mb-5 h-px" aria-hidden />{fallback}</>;
  return <React.Suspense fallback={fallback}>{children}</React.Suspense>;
}

/** Simple labelled bars: no charting library needed for a ranked list. */
function BarList({ rows }: { rows: { label: string; value: number; detail: string }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.label}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate">{r.label}</span><span className="shrink-0 text-xs text-muted-foreground tabular">{r.detail}</span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-chart-1" style={{ width: `${(r.value / max) * 100}%` }} /></div>
        </li>
      ))}
    </ul>
  );
}

export function DashboardPage() {
  const { data: me } = useMe();
  const { data: pipelines = [] } = usePipelines();
  const { data: teams = [] } = useTeams();
  const { data: users = [] } = useUsers();
  const quick = useQuickCreate((s) => s.open);
  // Role-based default: managers and executives land on the team view.
  const [view, setView] = React.useState<'my' | 'team'>(() =>
    me?.permissions.includes('reports:team') && me.role !== 'rep' ? 'team' : 'my');
  const [period, setPeriod] = React.useState<PeriodKey>('month');
  const [filters, setFilters] = React.useState({ ownerId: '', teamId: '', pipelineId: '', territory: '' });
  const [showAll, setShowAll] = React.useState(false);
  const [logFor, setLogFor] = React.useState<NextBestAction | null>(null);
  const [focusId, setFocusId] = React.useState<string | null>(null);
  const currency = me?.org.currency ?? 'USD';
  const canTeam = !!me?.permissions.includes('reports:team');

  const params = { view, from: PERIODS[period].from().toISOString(), ...(view === 'team' ? filters : { pipelineId: filters.pipelineId }) };
  const { data, isLoading, isError, error, refetch } = useQuery({ queryKey: ['dashboard', params], queryFn: () => api.get<Dash>('/dashboard', params), refetchInterval: 60_000 });
  const territories = [...new Set(users.map((u) => u.territory).filter(Boolean))] as string[];
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const isEmpty = !!data?.orgEmpty;
  const actions = data?.actions ?? [];
  const focusIndex = Math.max(0, actions.findIndex((a) => a.id === focusId));
  const focus = actions[focusIndex];
  const activeFilters = Object.entries(filters).filter(([k, v]) => v && (view === 'team' || k === 'pipelineId')).length;
  const hasFilters = pipelines.length > 1 || view === 'team';

  return (
    <>
      <PageHeader title={`${greet}, ${me?.name.split(' ')[0] ?? ''}`}
        description={view === 'my' ? 'Here is what needs you, most urgent first.' : 'Here is what needs the team, most urgent first.'}
        actions={
          <>
            {canTeam && (
              <div className="inline-flex rounded-md border bg-card p-0.5" role="group" aria-label="Dashboard view">
                {(['my', 'team'] as const).map((v) => (
                  <button key={v} onClick={() => setView(v)} aria-pressed={view === v}
                    className={cn('rounded px-3 py-1 text-sm font-medium', view === v ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground')}>
                    {v === 'my' ? 'Mine' : 'Team'}
                  </button>
                ))}
              </div>
            )}
            <Select aria-label="Date range" value={period} onChange={(e) => setPeriod(e.target.value as PeriodKey)} className="w-40 sm:w-36">
              {Object.entries(PERIODS).map(([k, p]) => <option key={k} value={k}>{p.label}</option>)}
            </Select>
            {hasFilters && (
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="icon" aria-label={`Filters${activeFilters ? `, ${activeFilters} active` : ''}`} className="relative">
                    <SlidersHorizontal />
                    {activeFilters > 0 && <span className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-accent text-[10px] font-semibold text-accent-foreground">{activeFilters}</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-64 space-y-3">
                  {pipelines.length > 1 && (
                    <Field label="Pipeline"><Select value={filters.pipelineId} onChange={(e) => setFilters({ ...filters, pipelineId: e.target.value })}>
                      <option value="">Default pipeline</option>{pipelines.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </Select></Field>
                  )}
                  {view === 'team' && (
                    <>
                      <Field label="Owner"><Select value={filters.ownerId} onChange={(e) => setFilters({ ...filters, ownerId: e.target.value })}>
                        <option value="">All owners</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                      </Select></Field>
                      {teams.length > 0 && (
                        <Field label="Team"><Select value={filters.teamId} onChange={(e) => setFilters({ ...filters, teamId: e.target.value })}>
                          <option value="">All teams</option>{teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </Select></Field>
                      )}
                      {territories.length > 0 && (
                        <Field label="Territory"><Select value={filters.territory} onChange={(e) => setFilters({ ...filters, territory: e.target.value })}>
                          <option value="">All territories</option>{territories.map((t) => <option key={t}>{t}</option>)}
                        </Select></Field>
                      )}
                    </>
                  )}
                  {activeFilters > 0 && <Button variant="ghost" size="sm" className="w-full" onClick={() => setFilters({ ownerId: '', teamId: '', pipelineId: '', territory: '' })}>Clear filters</Button>}
                </PopoverContent>
              </Popover>
            )}
          </>
        } />

      {isError && (
        <Card className="mb-5"><EmptyState icon={AlertTriangle} title="Couldn't load the dashboard" description={(error as Error).message}
          action={<Button variant="outline" onClick={() => refetch()}>Try again</Button>} /></Card>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* What to do next: the reason this screen exists */}
        <section aria-label="What to do next" className="space-y-5 lg:col-span-2">
          {isLoading ? <Skeleton className="h-56 rounded-xl" />
            : isEmpty ? <Onboarding />
            : focus ? <NextHero action={focus} position={focusIndex + 1} total={actions.length} onLogCall={setLogFor}
                onSkip={() => setFocusId(actions[(focusIndex + 1) % actions.length].id)} />
            : !isError && (
              <Card><EmptyState icon={ListChecks} title="You're all caught up" description="Nothing is overdue, stalled or waiting on a reply. New items appear here as they come up."
                action={<Button onClick={() => quick('deal')}><Plus />New deal</Button>} /></Card>
            )}

          {!isEmpty && (
            <Card>
              <Tabs defaultValue="actions">
                <CardHeader title="Up next" description="Ranked by urgency and deal value"
                  action={<TabsList className="shrink-0"><TabsTrigger value="actions">Queue{actions.length > 1 ? ` (${actions.length - 1})` : ''}</TabsTrigger><TabsTrigger value="activity">Activity</TabsTrigger></TabsList>} />
                <CardBody className="pt-1">
                  {isLoading ? <Skeleton className="h-48" /> : (
                    <>
                      <TabsContent value="actions" className="mt-0">
                        <NextActions actions={actions.filter((a) => a.id !== focus?.id)} onPick={(a) => { setFocusId(a.id); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />
                      </TabsContent>
                      <TabsContent value="activity" className="mt-3"><ActivityFeed items={data?.activity ?? []} /></TabsContent>
                    </>
                  )}
                </CardBody>
              </Tabs>
            </Card>
          )}

          {data && !isEmpty && <WhenVisible fallback={<Skeleton className="h-80 rounded-xl" />}><RevenueChart data={data} currency={currency} /></WhenVisible>}
        </section>

        {/* Numbers */}
        <aside aria-label="Key metrics" className="space-y-5">
          <Card>
            {isLoading || !data ? <Skeleton className="m-5 h-40" /> : (
              <>
                <dl className="grid grid-cols-2">
                  {data.kpis.filter((k) => showAll || HEADLINE.includes(k.key)).map((k, i) => (
                    <div key={k.key} className={cn('px-5 py-4', i % 2 === 1 && 'border-l', i > 1 && 'border-t')}>
                      <dt className="truncate text-xs text-muted-foreground">{k.label}</dt>
                      <dd className="mt-1"><span className="block text-2xl font-semibold tracking-tight tabular">{formatKpi(k, currency)}</span><Trend k={k} /></dd>
                    </div>
                  ))}
                </dl>
                {data.kpis.length > HEADLINE.length && (
                  <button className="w-full border-t px-5 py-2.5 text-left text-xs font-medium text-muted-foreground hover:text-foreground" onClick={() => setShowAll((v) => !v)} aria-expanded={showAll}>
                    {showAll ? 'Show fewer' : `Show all ${data.kpis.length} metrics`}
                  </button>
                )}
              </>
            )}
          </Card>

          <Card>
            <CardHeader title="Quota" description={PERIODS[period].label} />
            <CardBody>{isLoading || !data ? <Skeleton className="h-24" /> : <Coverage data={data} currency={currency} />}</CardBody>
          </Card>

          {data && !isEmpty && (
            <>
            <Card>
              <CardHeader title="Pipeline by stage" description="Open deals" action={<Button asChild size="sm" variant="ghost"><Link to="/deals">Board</Link></Button>} />
              <CardBody>
                {!data.dealsByStage.some((st) => st.count)
                  ? <EmptyState icon={Briefcase} title="No open deals" action={<Button size="sm" onClick={() => quick('deal')}><Plus />New deal</Button>} className="py-6" />
                  : <BarList rows={data.dealsByStage.map((st) => ({ label: st.name, value: st.value, detail: `${st.count} · ${money(st.value, currency, true)}` }))} />}
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Lead sources" description="New leads this period" />
              <CardBody>
                {!data.leadSources.length
                  ? <EmptyState icon={Target} title="No new leads" description="Share your lead form from Settings → Lead capture." className="py-6" />
                  : <BarList rows={data.leadSources.map((l) => ({ label: labelize(l.source), value: l.count, detail: String(l.count) }))} />}
              </CardBody>
            </Card>
            <WhenVisible fallback={<Skeleton className="h-80 rounded-xl" />}><OwnerChart data={data} currency={currency} /></WhenVisible>
            </>
          )}
        </aside>

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
        action={canManageUsers && <Button asChild size="sm" variant="outline"><Link to="/settings/users">Set quotas</Link></Button>} className="py-4" />
    );
  }
  return (
    <div>
      <p className="text-sm"><span className="text-2xl font-semibold tracking-tight tabular">{pct(attainment)}</span> <span className="text-muted-foreground">of {money(quota, currency, true)}</span></p>
      <Progress label="Quota attainment" value={attainment} tone={attainment >= 100 ? 'success' : 'primary'} className="mt-3 h-1.5" />
      <dl className="mt-4 grid grid-cols-3 gap-2 text-xs">
        <div><dt className="text-muted-foreground">Won</dt><dd className="mt-0.5 text-sm font-medium tabular">{money(won, currency, true)}</dd></div>
        <div><dt className="text-muted-foreground">Weighted</dt><dd className="mt-0.5 text-sm font-medium tabular">{money(weightedPipeline, currency, true)}</dd></div>
        <div><dt className="text-muted-foreground">Coverage</dt><dd className={cn('mt-0.5 text-sm font-medium tabular', coverage !== null && coverage < 3 && 'text-warning')}>{coverage === null ? 'Met' : `${num(coverage, 1)}×`}</dd></div>
      </dl>
      {coverage !== null && coverage < 3 && <p className="mt-3 text-xs text-warning">Pipeline covers less than 3× the remaining quota.</p>}
    </div>
  );
}
