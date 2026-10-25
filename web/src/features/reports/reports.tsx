import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Bar, BarChart, CartesianGrid, Cell, Funnel, FunnelChart, LabelList, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer,
  Tooltip as RTooltip, XAxis, YAxis,
} from 'recharts';
import { BarChart3, Download, Mail, Play, Plus, Printer, Save, Trash2, X } from 'lucide-react';
import { startOfQuarter, startOfYear, subDays } from 'date-fns';
import { labelize, REPORT_ENTITIES, WORKFLOW_OPERATORS, type ReportConfig, type SavedReport } from '@crm/shared';
import { api } from '@/lib/api';
import { money, num, pct } from '@/lib/utils';
import { useAction, useCan, useMe } from '@/hooks/data';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, EmptyState, PageHeader, Skeleton, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/display';
import { Field, Input, Select } from '@/components/ui/form';
import { confirm, Dialog, DialogContent, DialogFooter } from '@/components/ui/overlay';

const COLORS = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))', 'hsl(var(--chart-6))'];
const tip = { contentStyle: { background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 } };
const axis = { tick: { fontSize: 11, fill: 'hsl(var(--muted-foreground))' }, tickLine: false, axisLine: false } as const;
const RANGES = { '30d': ['Last 30 days', () => subDays(new Date(), 30)], quarter: ['This quarter', () => startOfQuarter(new Date())], year: ['This year', () => startOfYear(new Date())], '365d': ['Last 12 months', () => subDays(new Date(), 365)] } as const;

export function downloadCsv(rows: Record<string, unknown>[], filename: string) {
  if (!rows.length) return;
  const cols = Object.keys(rows[0]);
  const cell = (v: unknown) => { let s = v == null ? '' : String(v); if (/^[=+\-@]/.test(s)) s = `'${s}`; return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const csv = [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' }));
  a.download = `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function ReportCard({ title, description, rows, filename, children }: { title: string; description: string; rows?: Record<string, unknown>[]; filename: string; children: React.ReactNode }) {
  return (
    <Card className="break-inside-avoid">
      <CardHeader title={title} description={description} action={rows?.length ? <Button size="sm" variant="ghost" className="no-print" onClick={() => downloadCsv(rows, filename)}><Download />CSV</Button> : undefined} />
      <CardBody>{children}</CardBody>
    </Card>
  );
}

function useReport<T>(path: string, params: Record<string, string>) {
  return useQuery({ queryKey: ['reports', path, params], queryFn: () => api.get<{ data: T[] }>(`/reports/${path}`, params).then((r) => r.data) });
}

export function ReportsPage() {
  const can = useCan();
  return (
    <>
      <PageHeader title="Reports" description="Pre-built analytics and your own custom reports." actions={<Button variant="outline" className="no-print" onClick={() => window.print()}><Printer />Export PDF</Button>} />
      <Tabs defaultValue="prebuilt">
        <TabsList className="no-print">
          <TabsTrigger value="prebuilt">Pre-built</TabsTrigger>
          <TabsTrigger value="builder">Report builder</TabsTrigger>
          <TabsTrigger value="saved">Saved reports</TabsTrigger>
        </TabsList>
        <TabsContent value="prebuilt"><Prebuilt /></TabsContent>
        <TabsContent value="builder"><Builder canSave={can('reports:build')} /></TabsContent>
        <TabsContent value="saved"><Saved /></TabsContent>
      </Tabs>
    </>
  );
}

function Prebuilt() {
  const { data: me } = useMe();
  const currency = me?.org.currency ?? 'USD';
  const [range, setRange] = React.useState<keyof typeof RANGES>('quarter');
  const params = { from: RANGES[range][1]().toISOString() };
  const reps = useReport<any>('sales-by-rep', params);
  const health = useReport<any>('pipeline-health', {});
  const funnel = useReport<{ stage: string; count: number }>('funnel', params);
  const activity = useReport<any>('activity', params);
  const lost = useReport<{ reason: string; count: number; value: number }>('lost-reasons', params);
  const forecast = useQuery({ queryKey: ['/deals', 'forecast'], queryFn: () => api.get<{ data: any[] }>('/deals/forecast').then((r) => r.data) });
  const empty = (msg: string) => <EmptyState icon={BarChart3} title="No data yet" description={msg} className="py-8" />;

  return (
    <>
      <div className="no-print mb-4 flex items-center gap-2">
        <Select aria-label="Date range" className="w-44" value={range} onChange={(e) => setRange(e.target.value as keyof typeof RANGES)}>
          {Object.entries(RANGES).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}
        </Select>
      </div>
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <div className="xl:col-span-2">
          <ReportCard title="Sales by rep" description="Won revenue, win rate, pipeline and activity per owner" filename="sales-by-rep" rows={reps.data}>
            {reps.isLoading ? <Skeleton className="h-40" /> : !reps.data?.length ? empty('Closed deals appear here.') : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-muted-foreground"><tr>{['Rep', 'Won', 'Revenue', 'Win rate', 'Avg deal', 'Open pipeline', 'Weighted', 'Activities', 'Quota'].map((h) => <th key={h} className="whitespace-nowrap px-2 py-2 font-medium">{h}</th>)}</tr></thead>
                  <tbody className="divide-y">{reps.data.map((r) => (
                    <tr key={r.ownerId}>
                      <td className="px-2 py-2 font-medium">{r.name}</td><td className="px-2 tabular">{r.wonCount}</td><td className="px-2 tabular">{money(r.revenue, currency)}</td>
                      <td className="px-2 tabular">{r.winRate === null ? '—' : pct(r.winRate)}</td><td className="px-2 tabular">{money(r.avgDeal, currency)}</td>
                      <td className="px-2 tabular">{money(r.openPipeline, currency)}</td><td className="px-2 tabular">{money(r.weighted, currency)}</td>
                      <td className="px-2 tabular">{r.activities}</td><td className="px-2 tabular">{r.quotaAttainment === null ? '—' : pct(r.quotaAttainment)}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </ReportCard>
        </div>
        <ReportCard title="Pipeline health" description="Open deals by stage: age, stalls and overdue close dates" filename="pipeline-health" rows={health.data}>
          {health.isLoading ? <Skeleton className="h-40" /> : !health.data?.some((s: any) => s.count) ? empty('Add deals to your pipeline.') : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground"><tr>{['Stage', 'Deals', 'Value', 'Avg days in stage', 'Stalled', 'Overdue'].map((h) => <th key={h} className="px-2 py-2 font-medium">{h}</th>)}</tr></thead>
              <tbody className="divide-y">{health.data.map((s: any) => (
                <tr key={s.stage}><td className="px-2 py-2 font-medium">{s.stage} <span className="text-xs text-muted-foreground">{s.probability}%</span></td><td className="px-2 tabular">{s.count}</td><td className="px-2 tabular">{money(s.value, currency, true)}</td>
                  <td className="px-2 tabular">{s.avgAgeDays}</td><td className={`px-2 tabular ${s.stalled ? 'font-semibold text-warning' : ''}`}>{s.stalled}</td><td className={`px-2 tabular ${s.overdue ? 'font-semibold text-destructive' : ''}`}>{s.overdue}</td></tr>
              ))}</tbody>
            </table>
          )}
        </ReportCard>
        <ReportCard title="Conversion funnel" description="Leads created in the period and how far they got" filename="conversion-funnel" rows={funnel.data}>
          <div className="h-64">
            {funnel.isLoading ? <Skeleton className="h-full" /> : !funnel.data?.[0]?.count ? empty('Leads created in this period appear here.') : (
              <ResponsiveContainer><FunnelChart><RTooltip {...tip} /><Funnel dataKey="count" nameKey="stage" isAnimationActive={false}
                data={funnel.data.map((d, i) => ({ ...d, fill: COLORS[i % COLORS.length] }))}><LabelList position="right" dataKey="stage" fill="hsl(var(--foreground))" stroke="none" fontSize={11} /></Funnel></FunnelChart></ResponsiveContainer>
            )}
          </div>
        </ReportCard>
        <ReportCard title="Activity report" description="Calls, emails, meetings and notes per rep" filename="activity" rows={activity.data}>
          <div className="h-64">
            {activity.isLoading ? <Skeleton className="h-full" /> : !activity.data?.length ? empty('Logged activities appear here.') : (
              <ResponsiveContainer><BarChart data={activity.data}><CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} /><XAxis dataKey="name" {...axis} /><YAxis {...axis} width={30} allowDecimals={false} /><RTooltip {...tip} /><Legend wrapperStyle={{ fontSize: 12 }} />
                {['call', 'email', 'meeting', 'note'].map((t, i) => <Bar key={t} dataKey={t} stackId="a" fill={COLORS[i]} name={labelize(t)} />)}</BarChart></ResponsiveContainer>
            )}
          </div>
        </ReportCard>
        <ReportCard title="Forecast" description="Open pipeline by expected close month (weighted, best case ≥50%, commit ≥75%)" filename="forecast" rows={forecast.data}>
          <div className="h-64">
            {forecast.isLoading ? <Skeleton className="h-full" /> : !forecast.data?.length ? empty('Open deals with close dates appear here.') : (
              <ResponsiveContainer><BarChart data={forecast.data}><CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} /><XAxis dataKey="month" {...axis} /><YAxis {...axis} width={56} tickFormatter={(v: number) => money(v, currency, true)} />
                <RTooltip {...tip} formatter={(v: number) => money(v, currency)} /><Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="weighted" name="Weighted" fill={COLORS[0]} radius={[4, 4, 0, 0]} /><Bar dataKey="commit" name="Commit" fill={COLORS[1]} radius={[4, 4, 0, 0]} /><Bar dataKey="bestCase" name="Best case" fill={COLORS[2]} radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer>
            )}
          </div>
        </ReportCard>
        <ReportCard title="Lost-reason analysis" description="Why deals were lost in the period" filename="lost-reasons" rows={lost.data}>
          <div className="h-64">
            {lost.isLoading ? <Skeleton className="h-full" /> : !lost.data?.length ? empty('Deals marked lost (with a reason) appear here.') : (
              <ResponsiveContainer><PieChart><Pie data={lost.data} dataKey="count" nameKey="reason" innerRadius="50%" outerRadius="80%" paddingAngle={2}>{lost.data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Pie>
                <RTooltip {...tip} formatter={(v: number, _n, p) => [`${v} deals · ${money((p.payload as { value: number }).value, currency)}`, (p.payload as { reason: string }).reason]} /><Legend wrapperStyle={{ fontSize: 12 }} /></PieChart></ResponsiveContainer>
            )}
          </div>
        </ReportCard>
      </div>
    </>
  );
}

// ---------- builder ----------
interface BuilderSchema { entities: Record<string, { metrics: string[]; groups: Record<string, string> }> }
const defaultConfig: ReportConfig = { entity: 'deal', metric: 'sum', metricField: 'value', groupBy: 'stage', filters: [], chartType: 'bar' };

export function ReportResult({ config, result }: { config: ReportConfig; result: { data: { key: string; value: number }[]; groupLabel: string } }) {
  const { data: me } = useMe();
  const isMoney = config.metric !== 'count' && config.metricField === 'value';
  const fmt = (v: number) => (isMoney ? money(v, me?.org.currency ?? 'USD') : num(v, 2));
  const rows = result.data.map((d) => ({ ...d, label: labelize(d.key) || d.key }));
  if (!rows.length) return <EmptyState icon={BarChart3} title="No matching records" description="Adjust the filters or date range." className="py-8" />;
  return (
    <div>
      {config.chartType !== 'table' && (
        <div className="h-72">
          <ResponsiveContainer>
            {config.chartType === 'donut' ? (
              <PieChart><Pie data={rows} dataKey="value" nameKey="label" innerRadius="50%" outerRadius="80%" paddingAngle={2}>{rows.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Pie><RTooltip {...tip} formatter={(v: number) => fmt(v)} /><Legend wrapperStyle={{ fontSize: 12 }} /></PieChart>
            ) : config.chartType === 'line' ? (
              <LineChart data={rows}><CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} /><XAxis dataKey="label" {...axis} angle={-30} textAnchor="end" height={64} /><YAxis {...axis} width={60} tickFormatter={fmt} /><RTooltip {...tip} formatter={(v: number) => fmt(v)} /><Line dataKey="value" stroke={COLORS[0]} strokeWidth={2} dot /></LineChart>
            ) : (
              <BarChart data={rows}><CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} /><XAxis dataKey="label" {...axis} interval={0} angle={-30} textAnchor="end" height={64} /><YAxis {...axis} width={60} tickFormatter={fmt} /><RTooltip {...tip} formatter={(v: number) => fmt(v)} cursor={{ fill: 'hsl(var(--muted))' }} /><Bar dataKey="value" fill={COLORS[0]} radius={[4, 4, 0, 0]} /></BarChart>
            )}
          </ResponsiveContainer>
        </div>
      )}
      <table className="mt-4 w-full text-sm">
        <thead className="text-left text-xs text-muted-foreground"><tr><th className="py-2">{result.groupLabel}</th><th className="py-2 text-right">{config.metric === 'count' ? 'Count' : `${labelize(config.metric)} of ${labelize(config.metricField ?? '')}`}</th></tr></thead>
        <tbody className="divide-y">{rows.map((r) => <tr key={r.key}><td className="py-1.5">{r.label}</td><td className="py-1.5 text-right tabular">{fmt(r.value)}</td></tr>)}</tbody>
      </table>
    </div>
  );
}

function Builder({ canSave, initial }: { canSave: boolean; initial?: SavedReport }) {
  const { data: schema } = useQuery({ queryKey: ['reports', 'schema'], queryFn: () => api.get<BuilderSchema>('/reports/builder/schema') });
  const [config, setConfig] = React.useState<ReportConfig>(initial?.config ?? defaultConfig);
  const [range, setRange] = React.useState<keyof typeof RANGES | 'all'>('all');
  const [saving, setSaving] = React.useState(false);
  const run = useAction((c: ReportConfig) => api.post<{ data: { key: string; value: number }[]; groupLabel: string; rowsScanned: number }>('/reports/run', {
    ...c, ...(range !== 'all' && { from: RANGES[range][1]().toISOString() }),
  }));
  const ent = schema?.entities[config.entity];
  const set = (patch: Partial<ReportConfig>) => setConfig((c) => ({ ...c, ...patch }));
  React.useEffect(() => { if (schema) run.mutate(config); }, [schema]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[20rem_1fr]">
      <Card className="no-print h-fit">
        <CardHeader title="Configure" />
        <CardBody className="space-y-3">
          <Field label="Records"><Select value={config.entity} onChange={(e) => {
            const entity = e.target.value as ReportConfig['entity'];
            const groups = Object.keys(schema?.entities[entity].groups ?? {});
            set({ entity, groupBy: groups[0], metric: 'count', metricField: undefined, filters: [] });
          }}>{REPORT_ENTITIES.map((e) => <option key={e} value={e}>{labelize(e)}s</option>)}</Select></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Metric"><Select value={config.metric} onChange={(e) => set({ metric: e.target.value as ReportConfig['metric'], metricField: e.target.value === 'count' ? undefined : ent?.metrics[0] })}>
              <option value="count">Count</option>{!!ent?.metrics.length && <><option value="sum">Sum</option><option value="avg">Average</option></>}
            </Select></Field>
            {config.metric !== 'count' && <Field label="Of"><Select value={config.metricField} onChange={(e) => set({ metricField: e.target.value })}>{ent?.metrics.map((m) => <option key={m} value={m}>{labelize(m)}</option>)}</Select></Field>}
          </div>
          <Field label="Group by"><Select value={config.groupBy} onChange={(e) => set({ groupBy: e.target.value })}>{Object.entries(ent?.groups ?? {}).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
          <Field label="Created"><Select value={range} onChange={(e) => setRange(e.target.value as typeof range)}><option value="all">Any time</option>{Object.entries(RANGES).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
          <div>
            <p className="mb-1.5 text-sm font-medium">Filters</p>
            {config.filters.map((f, i) => (
              <div key={i} className="mb-2 flex gap-1">
                <Input aria-label="Field" value={f.field} placeholder="field (e.g. status)" onChange={(e) => set({ filters: config.filters.map((x, j) => (j === i ? { ...x, field: e.target.value } : x)) })} />
                <Select aria-label="Operator" className="w-28 shrink-0" value={f.operator} onChange={(e) => set({ filters: config.filters.map((x, j) => (j === i ? { ...x, operator: e.target.value as never } : x)) })}>{WORKFLOW_OPERATORS.map((o) => <option key={o} value={o}>{labelize(o)}</option>)}</Select>
                <Input aria-label="Value" value={f.value} onChange={(e) => set({ filters: config.filters.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)) })} />
                <Button variant="ghost" size="icon" aria-label="Remove filter" onClick={() => set({ filters: config.filters.filter((_, j) => j !== i) })}><X /></Button>
              </div>
            ))}
            <Button size="sm" variant="ghost" onClick={() => set({ filters: [...config.filters, { field: 'status', operator: 'equals', value: '' }] })}><Plus />Add filter</Button>
          </div>
          <Field label="Chart"><Select value={config.chartType} onChange={(e) => set({ chartType: e.target.value as ReportConfig['chartType'] })}>
            {['bar', 'line', 'donut', 'table'].map((c) => <option key={c} value={c}>{labelize(c)}</option>)}</Select></Field>
          <div className="flex gap-2 pt-1">
            <Button className="flex-1" loading={run.isPending} onClick={() => run.mutate(config)}><Play />Run</Button>
            {canSave && <Button variant="outline" onClick={() => setSaving(true)}><Save />Save</Button>}
          </div>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Result" description={run.data ? `${num(run.data.rowsScanned)} records` : undefined}
          action={run.data?.data.length ? <Button size="sm" variant="ghost" className="no-print" onClick={() => downloadCsv(run.data!.data, 'custom-report')}><Download />CSV</Button> : undefined} />
        <CardBody>{run.data ? <ReportResult config={config} result={run.data} /> : <Skeleton className="h-72" />}</CardBody>
      </Card>
      <SaveDialog open={saving} onOpenChange={setSaving} config={config} />
    </div>
  );
}

function SaveDialog({ open, onOpenChange, config }: { open: boolean; onOpenChange: (o: boolean) => void; config: ReportConfig }) {
  const { data: me } = useMe();
  const [form, setForm] = React.useState({ name: '', schedule: 'none', recipients: '' });
  React.useEffect(() => { if (open) setForm({ name: '', schedule: 'none', recipients: me?.email ?? '' }); }, [open, me]);
  const save = useAction(() => api.post('/reports/saved', { ...form, config }), { success: 'Report saved', invalidate: [['reports', 'saved']], onSuccess: () => onOpenChange(false) });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Save report" size="sm">
        <div className="space-y-3">
          <Field label="Name" required><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Email schedule"><Select value={form.schedule} onChange={(e) => setForm({ ...form, schedule: e.target.value })}>{['none', 'daily', 'weekly', 'monthly'].map((s) => <option key={s} value={s}>{s === 'none' ? 'Don\'t schedule' : labelize(s)}</option>)}</Select></Field>
          {form.schedule !== 'none' && <Field label="Recipients" hint="Comma-separated emails"><Input value={form.recipients} onChange={(e) => setForm({ ...form, recipients: e.target.value })} /></Field>}
        </div>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button disabled={!form.name.trim()} loading={save.isPending} onClick={() => save.mutate(undefined)}>Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Saved() {
  const { data, isLoading } = useQuery({ queryKey: ['reports', 'saved'], queryFn: () => api.get<{ data: SavedReport[] }>('/reports/saved').then((r) => r.data) });
  const [open, setOpen] = React.useState<SavedReport | null>(null);
  const send = useAction((id: string) => api.post<{ sent: number; provider: string }>(`/reports/saved/${id}/send`), { success: (r) => `Sent to ${r.sent} recipient${r.sent === 1 ? '' : 's'}${r.provider === 'console' ? ' (dev: email stubbed)' : ''}` });
  const remove = useAction((id: string) => api.del(`/reports/saved/${id}`), { success: 'Report deleted', invalidate: [['reports', 'saved']] });
  const run = useAction((c: ReportConfig) => api.post<{ data: { key: string; value: number }[]; groupLabel: string }>('/reports/run', c));
  if (isLoading) return <Skeleton className="h-40" />;
  if (!data?.length) return <Card><EmptyState icon={Save} title="No saved reports" description="Build a report and save it to reuse or schedule it by email." /></Card>;
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {data.map((r) => (
          <Card key={r.id} className="p-4">
            <p className="font-semibold">{r.name}</p>
            <p className="mt-1 text-xs text-muted-foreground">{labelize(r.config.metric)} of {labelize(r.config.entity)}s by {labelize(r.config.groupBy)} · {r.schedule === 'none' ? 'not scheduled' : `emailed ${r.schedule}`}</p>
            <div className="mt-3 flex flex-wrap gap-1">
              <Button size="sm" variant="outline" onClick={() => { setOpen(r); run.mutate(r.config); }}><Play />Run</Button>
              <Button size="sm" variant="ghost" loading={send.isPending} onClick={() => send.mutate(r.id)}><Mail />Email now</Button>
              <Button size="sm" variant="ghost" className="text-destructive" onClick={async () => { if (await confirm({ title: `Delete "${r.name}"?`, destructive: true, confirmLabel: 'Delete' })) remove.mutate(r.id); }}><Trash2 /></Button>
            </div>
          </Card>
        ))}
      </div>
      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent title={open?.name ?? ''} size="lg">{open && run.data ? <ReportResult config={open.config} result={run.data} /> : <Skeleton className="h-72" />}</DialogContent>
      </Dialog>
    </>
  );
}
