import * as React from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  DndContext, DragOverlay, KeyboardSensor, PointerSensor, closestCorners, pointerWithin, useDraggable, useDroppable, useSensor, useSensors,
  type CollisionDetection, type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core';

// Drop on whatever is under the pointer; keyboard drags (no pointer) fall back
// to the nearest column.
const collision: CollisionDetection = (args) => (args.pointerCoordinates ? pointerWithin(args) : closestCorners(args));
import { toast } from 'sonner';
import { Briefcase, CalendarDays, Columns3, List, Plus, Search, ThumbsDown, Trophy } from 'lucide-react';
import { DEAL_STATUSES, LOST_REASONS, type Deal, type Stage } from '@crm/shared';
import { api } from '@/lib/api';
import { cn, day, isOverdue, money } from '@/lib/utils';
import { useMe, usePipelines, useUsers } from '@/hooks/data';
import { useUi } from '@/stores/ui';
import { Button } from '@/components/ui/button';
import { Avatar, Card, EmptyState, PageHeader, Skeleton } from '@/components/ui/display';
import { Field, Input, Select } from '@/components/ui/form';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/overlay';
import { ListPage, type Column } from '@/components/data/list-page';
import { RiskFlag, StatusBadge } from '@/components/records/badges';
import { UserChip } from '@/components/records/pickers';
import { useQuickCreate } from '@/features/forms';

type BoardStage = Stage & { deals: Deal[]; count: number; value: number; weighted: number };
interface Board { pipeline: { id: string; name: string } | null; stages: BoardStage[] }

export function DealsPage() {
  const { dealsView, setDealsView } = useUi();
  const { data: pipelines = [] } = usePipelines();
  const [pipelineId, setPipelineId] = React.useState('');
  const quick = useQuickCreate((s) => s.open);
  const activePipeline = pipelineId || pipelines.find((p) => p.isDefault)?.id || pipelines[0]?.id || '';
  return (
    <>
      <PageHeader title="Deals" description="Drag deals between stages. Drop on Won or Lost to close them."
        actions={<>
          {pipelines.length > 1 && (
            <Select aria-label="Pipeline" value={activePipeline} onChange={(e) => setPipelineId(e.target.value)} className="w-44">
              {pipelines.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          )}
          <div className="inline-flex rounded-md border bg-card p-0.5" role="group" aria-label="Layout">
            <Button size="sm" variant={dealsView === 'board' ? 'secondary' : 'ghost'} aria-pressed={dealsView === 'board'} onClick={() => setDealsView('board')}><Columns3 />Board</Button>
            <Button size="sm" variant={dealsView === 'list' ? 'secondary' : 'ghost'} aria-pressed={dealsView === 'list'} onClick={() => setDealsView('list')}><List />List</Button>
          </div>
          <Button onClick={() => quick('deal', { pipelineId: activePipeline })}><Plus />New deal</Button>
        </>} />
      {dealsView === 'board' ? <BoardView pipelineId={activePipeline} /> : <DealList pipelineId={activePipeline} />}
    </>
  );
}

function BoardView({ pipelineId }: { pipelineId: string }) {
  const qc = useQueryClient();
  const { data: me } = useMe();
  const { data: users = [] } = useUsers();
  const quick = useQuickCreate((s) => s.open);
  const [ownerId, setOwnerId] = React.useState('');
  const [q, setQ] = React.useState('');
  const [debounced, setDebounced] = React.useState('');
  React.useEffect(() => { const t = setTimeout(() => setDebounced(q), 250); return () => clearTimeout(t); }, [q]);
  const key = ['/deals', 'board', pipelineId, ownerId, debounced];
  const { data, isLoading } = useQuery({ queryKey: key, queryFn: () => api.get<Board>('/deals/board', { pipelineId, ownerId, q: debounced }), enabled: !!pipelineId });
  const [active, setActive] = React.useState<Deal | null>(null);
  const [losing, setLosing] = React.useState<Deal | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor));
  const currency = me?.org.currency ?? 'USD';

  const moveLocal = (dealId: string, toStageId: string | null) => {
    qc.setQueryData<Board>(key, (old) => {
      if (!old) return old;
      const deal = old.stages.flatMap((s) => s.deals).find((d) => d.id === dealId);
      if (!deal) return old;
      return {
        ...old,
        stages: old.stages.map((s) => {
          let deals = s.deals.filter((d) => d.id !== dealId);
          if (s.id === toStageId) deals = [{ ...deal, stageId: s.id, stage: s, weightedValue: (deal.value * (deal.probability ?? s.probability)) / 100 }, ...deals];
          return { ...s, deals, count: deals.length, value: deals.reduce((a, d) => a + d.value, 0), weighted: deals.reduce((a, d) => a + (d.weightedValue ?? 0), 0) };
        }),
      };
    });
  };
  const refresh = () => { qc.invalidateQueries({ queryKey: ['/deals'] }); qc.invalidateQueries({ queryKey: ['dashboard'] }); };

  const onDragEnd = async (e: DragEndEvent) => {
    setActive(null);
    const deal = e.active.data.current?.deal as Deal | undefined;
    const target = e.over?.id as string | undefined;
    if (!deal || !target || target === deal.stageId) return;
    if (target === 'lost') { setLosing(deal); return; }
    const snapshot = qc.getQueryData<Board>(key);
    if (target === 'won') {
      moveLocal(deal.id, null);
      try { await api.post(`/deals/${deal.id}/close`, { status: 'won' }); toast.success(`🎉 ${deal.title} won`); refresh(); }
      catch (err) { qc.setQueryData(key, snapshot); toast.error((err as Error).message); }
      return;
    }
    moveLocal(deal.id, target); // optimistic
    try { await api.patch(`/deals/${deal.id}`, { stageId: target }); refresh(); }
    catch (err) { qc.setQueryData(key, snapshot); toast.error((err as Error).message); }
  };

  const totals = data?.stages.reduce((a, s) => ({ value: a.value + s.value, weighted: a.weighted + s.weighted, count: a.count + s.count }), { value: 0, weighted: 0, count: 0 });
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter deals…" className="pl-8" aria-label="Filter deals" />
        </div>
        <Select aria-label="Owner" value={ownerId} onChange={(e) => setOwnerId(e.target.value)} className="w-40">
          <option value="">All owners</option><option value="me">My deals</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </Select>
        {totals && (
          <p className="ml-auto text-sm text-muted-foreground">
            <span className="font-semibold text-foreground tabular">{totals.count}</span> open ·{' '}
            <span className="font-semibold text-foreground tabular">{money(totals.value, currency, true)}</span> pipeline ·{' '}
            <span className="font-semibold text-foreground tabular">{money(totals.weighted, currency, true)}</span> weighted forecast
          </p>
        )}
      </div>
      {isLoading || !data ? (
        <div className="flex gap-3 overflow-hidden">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-96 w-72 shrink-0" />)}</div>
      ) : !data.pipeline ? (
        <Card><EmptyState icon={Briefcase} title="No pipeline yet" description="Create one in Settings → Pipelines." /></Card>
      ) : (
        <DndContext sensors={sensors} collisionDetection={collision} onDragStart={(e: DragStartEvent) => setActive(e.active.data.current?.deal ?? null)} onDragEnd={onDragEnd} onDragCancel={() => setActive(null)}>
          <div className="-mx-3 flex gap-3 overflow-x-auto px-3 pb-4 sm:-mx-5 sm:px-5 scrollbar-thin" role="list" aria-label="Pipeline stages">
            {data.stages.map((s) => (
              <StageColumn key={s.id} stage={s} currency={currency} onAdd={() => quick('deal', { pipelineId: data.pipeline!.id, stageId: s.id })} />
            ))}
          </div>
          {active && (
            <div className="fixed inset-x-0 bottom-4 z-40 mx-auto flex w-[min(32rem,calc(100vw-2rem))] gap-3">
              <CloseZone id="won" label="Won" icon={Trophy} className="border-success text-success" />
              <CloseZone id="lost" label="Lost" icon={ThumbsDown} className="border-destructive text-destructive" />
            </div>
          )}
          <DragOverlay>{active && <DealCard deal={active} currency={currency} overlay />}</DragOverlay>
        </DndContext>
      )}
      <LostDialog deal={losing} onClose={() => setLosing(null)} onDone={refresh} />
    </>
  );
}

function StageColumn({ stage, currency, onAdd }: { stage: BoardStage; currency: string; onAdd: () => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  return (
    <section ref={setNodeRef} role="listitem" aria-label={`${stage.name}: ${stage.count} deals`}
      className={cn('flex w-72 shrink-0 flex-col rounded-xl border bg-muted/40 transition-colors', isOver && 'border-primary bg-primary/5')}>
      <header className="border-b px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="truncate text-sm font-semibold">{stage.name}</h2>
          <span className="rounded-full bg-background px-2 text-xs font-medium tabular">{stage.count}</span>
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground tabular">{money(stage.value, currency, true)} · {stage.probability}% · {money(stage.weighted, currency, true)} weighted</p>
      </header>
      <div className="flex min-h-[8rem] flex-1 flex-col gap-2 p-2">
        {stage.deals.map((d) => <DraggableDeal key={d.id} deal={d} currency={currency} />)}
        <button onClick={onAdd} className="rounded-md border border-dashed py-2 text-xs text-muted-foreground hover:border-primary hover:text-primary"><Plus className="mr-1 inline size-3" />Add deal</button>
      </div>
    </section>
  );
}

function DraggableDeal({ deal, currency }: { deal: Deal; currency: string }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: deal.id, data: { deal } });
  return (
    <div ref={setNodeRef} {...listeners} {...attributes} aria-roledescription="Draggable deal" className={cn('touch-none', isDragging && 'opacity-30')}>
      <DealCard deal={deal} currency={currency} />
    </div>
  );
}

function DealCard({ deal, currency, overlay }: { deal: Deal; currency: string; overlay?: boolean }) {
  return (
    <article className={cn('rounded-lg border bg-card p-3 shadow-sm transition-shadow hover:shadow-md', overlay && 'rotate-2 shadow-xl ring-2 ring-primary')}>
      <div className="flex items-start justify-between gap-2">
        <Link to={`/deals/${deal.id}`} className="line-clamp-2 text-sm font-medium hover:underline" onPointerDown={(e) => e.stopPropagation()}>{deal.title}</Link>
        <RiskFlag risk={deal.risk} />
      </div>
      {deal.company && <p className="mt-0.5 truncate text-xs text-muted-foreground">{deal.company.name}</p>}
      <div className="mt-2 flex items-center justify-between gap-2 text-xs">
        <span className="font-semibold tabular">{money(deal.value, deal.currency || currency)}</span>
        {deal.expectedCloseDate && (
          <span className={cn('inline-flex items-center gap-1', isOverdue(deal.expectedCloseDate) ? 'font-medium text-destructive' : 'text-muted-foreground')}>
            <CalendarDays className="size-3" aria-hidden />{day(deal.expectedCloseDate)}
          </span>
        )}
        {deal.owner && <Avatar name={deal.owner.name} src={deal.owner.avatarUrl} size="xs" />}
      </div>
    </article>
  );
}

function CloseZone({ id, label, icon: Icon, className }: { id: string; label: string; icon: typeof Trophy; className: string }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={cn('flex flex-1 items-center justify-center gap-2 rounded-xl border-2 border-dashed bg-card/95 py-4 text-sm font-semibold shadow-lg backdrop-blur', className, isOver && 'scale-105 bg-card')}>
      <Icon className="size-5" />{label}
    </div>
  );
}

export function LostDialog({ deal, onClose, onDone }: { deal: Pick<Deal, 'id' | 'title'> | null; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = React.useState<string>(LOST_REASONS[0]);
  const [busy, setBusy] = React.useState(false);
  return (
    <Dialog open={!!deal} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="Mark deal as lost" description={deal?.title} size="sm">
        <Field label="Why was it lost?"><Select value={reason} onChange={(e) => setReason(e.target.value)}>{LOST_REASONS.map((r) => <option key={r}>{r}</option>)}</Select></Field>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="destructive" loading={busy} onClick={async () => {
            setBusy(true);
            try { await api.post(`/deals/${deal!.id}/close`, { status: 'lost', lostReason: reason }); toast.success('Deal marked lost'); onDone(); onClose(); }
            catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
          }}>Mark lost</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DealList({ pipelineId }: { pipelineId: string }) {
  const { data: pipelines = [] } = usePipelines();
  const stages = pipelines.find((p) => p.id === pipelineId)?.stages ?? [];
  const quick = useQuickCreate((s) => s.open);
  const columns: Column<Deal>[] = [
    { key: 'title', header: 'Deal', sortKey: 'title', cell: (d) => <span>{d.title}{d.company && <span className="block text-xs font-normal text-muted-foreground">{d.company.name}</span>}</span> },
    { key: 'value', header: 'Value', sortKey: 'value', cell: (d) => <span className="tabular">{money(d.value, d.currency)}</span> },
    {
      key: 'stage', header: 'Stage', sortKey: 'stage.order', cell: (d) => d.stage?.name,
      edit: stages.length ? { field: 'stageId', options: stages.map((s) => ({ value: s.id, label: s.name })), value: (d) => d.stageId } : undefined,
    },
    { key: 'status', header: 'Status', cell: (d) => <span className="flex items-center gap-1"><StatusBadge value={d.status} /><RiskFlag risk={d.risk} /></span>, hideBelow: 'sm' },
    { key: 'weighted', header: 'Weighted', cell: (d) => <span className="tabular text-muted-foreground">{money(d.weightedValue, d.currency)} ({d.effectiveProbability}%)</span>, hideBelow: 'md' },
    { key: 'close', header: 'Expected close', sortKey: 'expectedCloseDate', cell: (d) => <span className={cn(d.status === 'open' && isOverdue(d.expectedCloseDate) && 'font-medium text-destructive')}>{day(d.expectedCloseDate)}</span>, hideBelow: 'md' },
    { key: 'owner', header: 'Owner', cell: (d) => <UserChip user={d.owner} />, hideBelow: 'lg' },
  ];
  return (
    <ListPage<Deal>
        key={pipelineId} entityType="deal" path="/deals" columns={columns} rowLink={(d) => `/deals/${d.id}`}
        filters={[
          { key: 'status', label: 'Status', type: 'select', options: DEAL_STATUSES },
          { key: 'stageId', label: 'Stage', type: 'select', options: stages.map((s) => ({ value: s.id, label: s.name })) },
          { key: 'ownerId', label: 'Owner', type: 'user' },
          { key: 'close', label: 'Expected close', type: 'date', field: 'expectedCloseDate' },
        ]}
        importable={{ columns: 'Title, Value, Currency, Expected close (added to the default pipeline\'s first stage)' }}
        empty={{ icon: Briefcase, title: 'No deals yet', description: 'Create a deal or convert a lead to start your pipeline.', action: <Button onClick={() => quick('deal')}><Plus />New deal</Button> }}
      />
  );
}
