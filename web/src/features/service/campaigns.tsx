import * as React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Megaphone, Plus } from 'lucide-react';
import { CAMPAIGN_CHANNELS, CAMPAIGN_STATUSES, type Campaign, type Lead, type Paginated } from '@crm/shared';
import { api } from '@/lib/api';
import { cn, day, fullName, money, num, pct } from '@/lib/utils';
import { useCan, useList, useMe } from '@/hooks/data';
import { Button } from '@/components/ui/button';
import { Card, EmptyState, PageHeader, Progress, Skeleton } from '@/components/ui/display';
import { Select } from '@/components/ui/form';
import { Dialog, SheetContent } from '@/components/ui/overlay';
import { ScoreBadge, StatusBadge } from '@/components/records/badges';
import { EntityFormDialog } from '@/features/forms';

export function CampaignsPage() {
  const can = useCan();
  const { data: me } = useMe();
  const currency = me?.org.currency ?? 'USD';
  const [status, setStatus] = React.useState('');
  const [channel, setChannel] = React.useState('');
  const [editing, setEditing] = React.useState<Campaign | null | 'new'>(null);
  const [open, setOpen] = React.useState<Campaign | null>(null);
  const { data, isLoading } = useList<Campaign>('/campaigns', { status, channel, pageSize: 100 });
  const campaigns = data?.data ?? [];
  const totals = campaigns.reduce((a, c) => ({ budget: a.budget + c.budget, leads: a.leads + (c.stats?.leads ?? 0), revenue: a.revenue + (c.stats?.wonRevenue ?? 0) }), { budget: 0, leads: 0, revenue: 0 });
  return (
    <>
      <PageHeader title="Campaigns" description="Attribute leads and revenue to marketing spend."
        actions={can('campaigns:manage') && <Button onClick={() => setEditing('new')}><Plus />New campaign</Button>} />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[['Total budget', money(totals.budget, currency, true)], ['Leads generated', num(totals.leads)], ['Won revenue', money(totals.revenue, currency, true)],
          ['Blended ROI', totals.budget ? pct(((totals.revenue - totals.budget) / totals.budget) * 100) : '—']].map(([l, v]) => (
          <Card key={l} className="p-4"><p className="text-xs text-muted-foreground">{l}</p><p className="mt-1 text-xl font-semibold tabular">{v}</p></Card>
        ))}
      </div>
      <div className="mb-3 flex gap-2">
        <Select aria-label="Status" className="w-36" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Any status</option>{CAMPAIGN_STATUSES.map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}</Select>
        <Select aria-label="Channel" className="w-40" value={channel} onChange={(e) => setChannel(e.target.value)}><option value="">Any channel</option>{CAMPAIGN_CHANNELS.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}</Select>
      </div>
      {isLoading ? <Skeleton className="h-64" /> : !campaigns.length ? (
        <Card><EmptyState icon={Megaphone} title="No campaigns yet" description="Create a campaign, then link leads and deals to it to measure ROI." action={can('campaigns:manage') && <Button onClick={() => setEditing('new')}><Plus />New campaign</Button>} /></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {campaigns.map((c) => {
            const s = c.stats!;
            const conv = s.leads ? (s.convertedLeads / s.leads) * 100 : 0;
            return (
              <Card key={c.id} className="flex flex-col p-4">
                <div className="flex items-start justify-between gap-2">
                  <button onClick={() => setOpen(c)} className="text-left font-semibold hover:underline">{c.name}</button>
                  <StatusBadge value={c.status} />
                </div>
                <p className="mt-0.5 text-xs capitalize text-muted-foreground">{c.channel.replace('_', ' ')} · {day(c.startDate)} – {day(c.endDate)}</p>
                <dl className="mt-4 grid grid-cols-3 gap-2 text-sm">
                  <div><dt className="text-xs text-muted-foreground">Leads</dt><dd className="font-semibold tabular">{s.leads}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Deals won</dt><dd className="font-semibold tabular">{s.wonDeals}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Revenue</dt><dd className="font-semibold tabular">{money(s.wonRevenue, currency, true)}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Budget</dt><dd className="tabular">{money(c.budget, currency, true)}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Cost / lead</dt><dd className="tabular">{s.costPerLead === null ? '—' : money(s.costPerLead, currency)}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">ROI</dt><dd className={cn('font-semibold tabular', s.roi !== null && (s.roi >= 0 ? 'text-success' : 'text-destructive'))}>{s.roi === null ? '—' : pct(s.roi)}</dd></div>
                </dl>
                <div className="mt-4"><p className="mb-1 flex justify-between text-xs text-muted-foreground"><span>Lead → contact conversion</span><span>{pct(conv)}</span></p><Progress value={conv} tone="success" /></div>
                {can('campaigns:manage') && <Button size="sm" variant="ghost" className="mt-3 self-start" onClick={() => setEditing(c)}>Edit</Button>}
              </Card>
            );
          })}
        </div>
      )}
      <EntityFormDialog kind="campaign" open={editing !== null} onOpenChange={(o) => !o && setEditing(null)} record={editing && editing !== 'new' ? editing : undefined} />
      <CampaignLeads campaign={open} onClose={() => setOpen(null)} />
    </>
  );
}

function CampaignLeads({ campaign, onClose }: { campaign: Campaign | null; onClose: () => void }) {
  const { data } = useQuery({
    queryKey: ['/leads', 'campaign', campaign?.id], enabled: !!campaign,
    queryFn: () => api.get<Paginated<Lead>>('/leads', { campaignId: campaign!.id, pageSize: 100, sort: 'score', order: 'desc' }),
  });
  return (
    <Dialog open={!!campaign} onOpenChange={(o) => !o && onClose()}>
      <SheetContent title={campaign?.name ?? 'Campaign'}>
        <div className="border-b p-5"><p className="text-lg font-semibold">{campaign?.name}</p><p className="text-sm text-muted-foreground">{campaign?.description ?? 'Leads attributed to this campaign'}</p></div>
        <ul className="flex-1 divide-y overflow-y-auto">
          {!data?.data.length && <li className="p-6 text-center text-sm text-muted-foreground">No leads linked yet. Pick this campaign on a lead to attribute it.</li>}
          {data?.data.map((l) => (
            <li key={l.id} className="flex items-center gap-3 px-5 py-3 text-sm">
              <Link to={`/leads/${l.id}`} className="min-w-0 flex-1 truncate font-medium hover:underline" onClick={onClose}>{fullName(l)}<span className="block truncate text-xs font-normal text-muted-foreground">{l.companyName}</span></Link>
              <ScoreBadge score={l.score} /><StatusBadge value={l.status} />
            </li>
          ))}
        </ul>
      </SheetContent>
    </Dialog>
  );
}
