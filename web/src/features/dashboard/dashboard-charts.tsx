import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from 'recharts';
import { TrendingUp, Users } from 'lucide-react';
import { labelize, type DashboardData } from '@crm/shared';
import { money } from '@/lib/utils';
import { Card, CardBody, CardHeader, EmptyState } from '@/components/ui/display';

/** Running totals, so this period and the previous one compare as trend lines. */
function cumulative(series: DashboardData['revenueSeries']) {
  let rev = 0, prev = 0;
  return series.map((p) => ({ date: p.date, revenue: (rev += p.revenue), previous: (prev += p.previous) }));
}

const tooltipStyle = { contentStyle: { background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12, color: 'hsl(var(--popover-foreground))' } };
const tick = { fontSize: 11, fill: 'hsl(var(--muted-foreground))' };

// The two charts that need a charting library. Loaded when they scroll into view.
type Props = { data: DashboardData; currency: string };

export function RevenueChart({ data, currency }: Props) {
  return (
      <Card>
        <CardHeader title="Revenue" description="Cumulative won revenue against the previous period" />
        <CardBody className="h-64">
          {data.revenueSeries.every((p) => !p.revenue && !p.previous)
            ? <EmptyState icon={TrendingUp} title="No won deals in this period" description="Revenue appears here when deals are marked won." className="py-8" />
            : (
              <ResponsiveContainer>
                <AreaChart data={cumulative(data.revenueSeries)} margin={{ left: 0, right: 8, top: 8 }}>
                  <defs><linearGradient id="rev" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="hsl(var(--chart-1))" stopOpacity={0.18} /><stop offset="100%" stopColor="hsl(var(--chart-1))" stopOpacity={0} /></linearGradient></defs>
                  <CartesianGrid stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="date" tick={tick} tickLine={false} axisLine={false} minTickGap={32} tickFormatter={(d: string) => d.length > 7 ? d.slice(5) : d} />
                  <YAxis tick={tick} tickLine={false} axisLine={false} width={52} tickFormatter={(v: number) => money(v, currency, true)} />
                  <RTooltip {...tooltipStyle} formatter={(v: number, n: string) => [money(v, currency), n === 'revenue' ? 'This period' : 'Previous period']} />
                  <Area type="stepAfter" dataKey="previous" stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" fill="none" strokeWidth={1.5} isAnimationActive={false} />
                  <Area type="stepAfter" dataKey="revenue" stroke="hsl(var(--chart-1))" fill="url(#rev)" strokeWidth={2} isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            )}
        </CardBody>
      </Card>
  );
}

export function OwnerChart({ data, currency }: Props) {
  return (
      <Card>
        <CardHeader title="By owner" description="Won this period and open pipeline" />
        <CardBody className="h-64">
          {!data.dealsByOwner.length
            ? <EmptyState icon={Users} title="No deals yet" description="Each rep's won and open value appears here." className="py-8" />
            : (
              <ResponsiveContainer>
                <BarChart data={data.dealsByOwner} margin={{ left: 0, right: 8, top: 8 }}>
                  <CartesianGrid stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="name" tick={tick} tickLine={false} axisLine={false} tickFormatter={(n: string) => n.split(' ')[0]} />
                  <YAxis tick={tick} tickLine={false} axisLine={false} width={52} tickFormatter={(v: number) => money(v, currency, true)} />
                  <RTooltip {...tooltipStyle} cursor={{ fill: 'hsl(var(--muted))' }} formatter={(v: number, n: string) => [money(v, currency), labelize(n)]} />
                  <Legend wrapperStyle={{ fontSize: 12 }} formatter={(v: string) => labelize(v)} />
                  <Bar dataKey="won" fill="hsl(var(--success))" radius={[3, 3, 0, 0]} isAnimationActive={false} />
                  <Bar dataKey="open" fill="hsl(var(--chart-1))" radius={[3, 3, 0, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            )}
        </CardBody>
      </Card>
  );
}
