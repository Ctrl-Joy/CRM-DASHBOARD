import * as React from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle, Briefcase, Check, History, RotateCcw, ThumbsDown, Trophy } from 'lucide-react';
import type { Activity, Attachment, Deal, Quote, Stage, Task, UserRef } from '@crm/shared';
import { api } from '@/lib/api';
import { cn, dateTime, day, fullName, money } from '@/lib/utils';
import { useAction, useRecord } from '@/hooks/data';
import { Button } from '@/components/ui/button';
import { Card, CardBody, DetailList, EmptyState, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/display';
import { Attachments, Timeline } from '@/components/records/activity';
import { StatusBadge } from '@/components/records/badges';
import { UserChip } from '@/components/records/pickers';
import { CustomFieldList, DetailHeader, DetailSkeleton, EngagementActions, SideCard, TaskList, useDeleteRecord } from '@/components/records/detail';
import { EntityFormDialog } from '@/features/forms';
import { LostDialog } from './deals';
import { QuotesPanel } from './quotes';

interface Overview {
  deal: Deal; stages: Stage[]; quotes: Quote[]; activities: Activity[]; tasks: Task[]; attachments: Attachment[];
  history: { id: string; fromStage: { name: string } | null; toStage: { name: string }; changedBy: UserRef | null; changedAt: string }[];
}

export function DealDetailPage() {
  const { id } = useParams();
  const qc = useQueryClient();
  const { data, isLoading, isError } = useRecord<Overview>('/deals', id, '/overview');
  const [editing, setEditing] = React.useState(false);
  const [losing, setLosing] = React.useState(false);
  const remove = useDeleteRecord('/deals', 'Deal', '/deals');
  const invalidate = [['/deals'], ['dashboard']];
  const close = useAction((status: 'won' | 'open') => api.post(`/deals/${id}/close`, { status }), {
    success: (r: any) => (r.status === 'won' ? '🎉 Deal won!' : 'Deal reopened'), invalidate,
  });
  if (isLoading) return <DetailSkeleton />;
  if (isError || !data) return <EmptyState icon={Briefcase} title="Deal not found" />;
  const { deal: d, stages, quotes, activities, tasks, attachments, history } = data;
  const currentIdx = stages.findIndex((s) => s.id === d.stageId);

  const moveTo = async (stage: Stage) => {
    if (stage.id === d.stageId || d.status !== 'open') return;
    const key = ['/deals', id, '/overview'];
    const prev = qc.getQueryData<Overview>(key);
    qc.setQueryData<Overview>(key, (o) => o && { ...o, deal: { ...o.deal, stageId: stage.id, stage } }); // optimistic
    try {
      await api.patch(`/deals/${d.id}`, { stageId: stage.id });
      toast.success(`Moved to ${stage.name}`);
      invalidate.forEach((k) => qc.invalidateQueries({ queryKey: k }));
    } catch (e) { qc.setQueryData(key, prev); toast.error((e as Error).message); }
  };

  return (
    <>
      <DetailHeader back={{ to: '/deals', label: 'Deals' }} title={d.title}
        subtitle={<>{money(d.value, d.currency)} · {d.pipeline?.name}{d.company && <> · <Link className="hover:underline" to={`/companies/${d.company.id}`}>{d.company.name}</Link></>}</>}
        badges={<StatusBadge value={d.status} />}
        actions={<>
          {d.status === 'open' ? (
            <>
              <Button size="sm" variant="success" loading={close.isPending} onClick={() => close.mutate('won')}><Trophy />Won</Button>
              <Button size="sm" variant="outline" className="text-destructive" onClick={() => setLosing(true)}><ThumbsDown />Lost</Button>
            </>
          ) : <Button size="sm" variant="outline" onClick={() => close.mutate('open')}><RotateCcw />Reopen</Button>}
          <EngagementActions related={{ dealId: d.id, contactId: d.contactId, companyId: d.companyId }} email={d.contact?.email} invalidate={invalidate}
            vars={{ first_name: d.contact?.firstName, last_name: d.contact?.lastName, full_name: d.contact ? fullName(d.contact) : '', company_name: d.company?.name, deal_title: d.title, deal_value: d.value }}
            onEdit={() => setEditing(true)} onDelete={() => remove(d.id, d.title)} />
        </>} />

      {/* stage path */}
      <nav aria-label="Deal stage" className="mb-5 overflow-x-auto">
        <ol className="flex min-w-max gap-1">
          {stages.map((s, i) => {
            const done = d.status === 'won' || i < currentIdx, current = d.status === 'open' && i === currentIdx;
            return (
              <li key={s.id} className="flex-1">
                <button onClick={() => moveTo(s)} disabled={d.status !== 'open'} aria-current={current ? 'step' : undefined}
                  className={cn('flex w-full min-w-28 items-center justify-center gap-1 px-3 py-2 text-xs font-medium transition-colors first:rounded-l-lg last:rounded-r-lg [clip-path:polygon(0_0,calc(100%-8px)_0,100%_50%,calc(100%-8px)_100%,0_100%,8px_50%)] first:[clip-path:polygon(0_0,calc(100%-8px)_0,100%_50%,calc(100%-8px)_100%,0_100%)]',
                    current ? 'bg-primary text-primary-foreground' : done ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground hover:bg-secondary', d.status === 'lost' && 'opacity-60')}>
                  {done && <Check className="size-3" />}{s.name}<span className="opacity-70">{s.probability}%</span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-5">
          {d.risk && d.risk.level !== 'low' && (
            <Card className={cn('border-l-4 p-4', d.risk.level === 'high' ? 'border-l-destructive' : 'border-l-warning')}>
              <p className="flex items-center gap-2 text-sm font-semibold"><AlertTriangle className="size-4" />{d.risk.level === 'high' ? 'This deal is at risk' : 'Keep an eye on this deal'}</p>
              <ul className="mt-2 list-disc pl-5 text-sm text-muted-foreground">{d.risk.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
            </Card>
          )}
          <SideCard title="Deal details" icon={Briefcase}>
            <DetailList className="sm:grid-cols-2" items={[
              { label: 'Value', value: money(d.value, d.currency) },
              { label: 'Weighted', value: `${money(d.weightedValue, d.currency)} (${d.effectiveProbability}%)` },
              { label: 'Expected close', value: day(d.expectedCloseDate) },
              { label: 'Stage', value: d.stage?.name },
              { label: 'Contact', value: d.contact ? <Link className="text-primary hover:underline" to={`/contacts/${d.contact.id}`}>{fullName(d.contact)}</Link> : null },
              { label: 'Company', value: d.company ? <Link className="text-primary hover:underline" to={`/companies/${d.company.id}`}>{d.company.name}</Link> : null },
              { label: 'Owner', value: <UserChip user={d.owner} /> },
              { label: 'Created', value: day(d.createdAt) },
              ...(d.status !== 'open' ? [{ label: 'Closed', value: day(d.closedAt) }] : []),
              ...(d.lostReason ? [{ label: 'Lost reason', value: d.lostReason }] : []),
            ]} />
            <CustomFieldList entityType="deal" values={d.customFields} />
          </SideCard>
          <Attachments files={attachments} related={{ dealId: d.id }} invalidate={invalidate} />
        </div>
        <Card className="lg:col-span-2">
          <CardBody className="pt-4">
            <Tabs defaultValue="timeline">
              <TabsList>
                <TabsTrigger value="timeline">Timeline ({activities.length})</TabsTrigger>
                <TabsTrigger value="tasks">Tasks ({tasks.filter((t) => t.status !== 'done').length})</TabsTrigger>
                <TabsTrigger value="quotes">Quotes ({quotes.length})</TabsTrigger>
                <TabsTrigger value="history"><History />Stage history</TabsTrigger>
              </TabsList>
              <TabsContent value="timeline"><Timeline activities={activities} invalidate={invalidate} /></TabsContent>
              <TabsContent value="tasks"><TaskList tasks={tasks} invalidate={invalidate} related={{ dealId: d.id, contactId: d.contactId }} /></TabsContent>
              <TabsContent value="quotes"><QuotesPanel dealId={d.id} currency={d.currency} quotes={quotes} invalidate={invalidate} /></TabsContent>
              <TabsContent value="history">
                <ol className="space-y-3">
                  {history.map((h) => (
                    <li key={h.id} className="flex items-start gap-3 text-sm">
                      <span className="mt-1.5 size-2 rounded-full bg-primary" aria-hidden />
                      <div>
                        <p>{h.fromStage ? <>Moved from <b>{h.fromStage.name}</b> to <b>{h.toStage.name}</b></> : <>Created in <b>{h.toStage.name}</b></>}</p>
                        <p className="text-xs text-muted-foreground">{h.changedBy?.name ?? 'System'} · {dateTime(h.changedAt)}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </TabsContent>
            </Tabs>
          </CardBody>
        </Card>
      </div>
      <EntityFormDialog kind="deal" open={editing} onOpenChange={setEditing} record={d} />
      <LostDialog deal={losing ? d : null} onClose={() => setLosing(false)} onDone={() => invalidate.forEach((k) => qc.invalidateQueries({ queryKey: k }))} />
    </>
  );
}
