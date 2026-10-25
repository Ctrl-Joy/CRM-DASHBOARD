import * as React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  addDays, addMonths, addWeeks, eachDayOfInterval, endOfDay, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, isToday,
  startOfDay, startOfMonth, startOfWeek, subDays, subMonths, subWeeks,
} from 'date-fns';
import { CalendarPlus, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { api } from '@/lib/api';
import { cn, fullName } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, PageHeader } from '@/components/ui/display';
import { ACTIVITY_ICON, LogActivityDialog } from '@/components/records/activity';
import { useQuickCreate } from '@/features/forms';

interface Event {
  id: string; kind: 'task' | 'activity'; type: string; title: string; start: string; durationMin: number | null; done: boolean; priority: string | null;
  owner: { name: string } | null; deal: { id: string; title: string } | null; contact: { id: string; firstName: string; lastName: string | null } | null;
}
type Mode = 'month' | 'week' | 'day';
const TONE: Record<string, string> = {
  meeting: 'bg-chart-4/15 text-chart-4 border-chart-4/30', call: 'bg-chart-2/15 text-chart-2 border-chart-2/30', task: 'bg-chart-1/10 text-chart-1 border-chart-1/30',
  email: 'bg-chart-1/10 text-chart-1 border-chart-1/30', note: 'bg-chart-3/15 text-chart-3 border-chart-3/30',
};

function range(mode: Mode, cursor: Date) {
  if (mode === 'month') return { from: startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 }), to: endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 }) };
  if (mode === 'week') return { from: startOfWeek(cursor, { weekStartsOn: 1 }), to: endOfWeek(cursor, { weekStartsOn: 1 }) };
  return { from: startOfDay(cursor), to: endOfDay(cursor) };
}

function EventChip({ e, compact }: { e: Event; compact?: boolean }) {
  const Icon = ACTIVITY_ICON[e.type] ?? ACTIVITY_ICON.task;
  const link = e.deal ? `/deals/${e.deal.id}` : e.contact ? `/contacts/${e.contact.id}` : e.kind === 'task' ? '/tasks' : undefined;
  const body = (
    <span className={cn('flex items-center gap-1 truncate rounded border px-1.5 py-0.5 text-[11px] font-medium', TONE[e.type] ?? TONE.task, e.done && 'line-through opacity-60')}>
      <Icon className="size-3 shrink-0" aria-hidden />
      {!compact && e.kind === 'activity' && <span className="tabular">{format(new Date(e.start), 'HH:mm')}</span>}
      <span className="truncate">{e.title}</span>
    </span>
  );
  return link ? <Link to={link} title={e.title}>{body}</Link> : body;
}

export function CalendarPage() {
  const [mode, setMode] = React.useState<Mode>('month');
  const [cursor, setCursor] = React.useState(new Date());
  const [mine, setMine] = React.useState(true);
  const [meeting, setMeeting] = React.useState(false);
  const quick = useQuickCreate((s) => s.open);
  const { from, to } = range(mode, cursor);
  const { data } = useQuery({
    queryKey: ['calendar', mode, from.toISOString(), mine],
    queryFn: () => api.get<{ data: Event[] }>('/calendar', { from: from.toISOString(), to: to.toISOString(), mine: String(mine) }).then((r) => r.data),
  });
  const events = (data ?? []).sort((a, b) => a.start.localeCompare(b.start));
  const on = (d: Date) => events.filter((e) => isSameDay(new Date(e.start), d));
  const step = (dir: 1 | -1) => setCursor((c) => (mode === 'month' ? (dir > 0 ? addMonths : subMonths)(c, 1) : mode === 'week' ? (dir > 0 ? addWeeks : subWeeks)(c, 1) : (dir > 0 ? addDays : subDays)(c, 1)));
  const title = mode === 'month' ? format(cursor, 'MMMM yyyy') : mode === 'week' ? `${format(from, 'd MMM')} – ${format(to, 'd MMM yyyy')}` : format(cursor, 'EEEE, d MMMM yyyy');

  return (
    <>
      <PageHeader title="Calendar" description="Meetings, scheduled calls and task due dates."
        actions={<><Button variant="outline" onClick={() => setMeeting(true)}><CalendarPlus />Schedule meeting</Button><Button onClick={() => quick('task')}><Plus />Task</Button></>} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button variant="outline" size="icon" onClick={() => step(-1)} aria-label="Previous"><ChevronLeft /></Button>
        <Button variant="outline" onClick={() => setCursor(new Date())}>Today</Button>
        <Button variant="outline" size="icon" onClick={() => step(1)} aria-label="Next"><ChevronRight /></Button>
        <h2 className="ml-2 text-lg font-semibold" aria-live="polite">{title}</h2>
        <div className="ml-auto flex gap-2">
          <div className="inline-flex rounded-md border bg-card p-0.5" role="group" aria-label="Whose calendar">
            {[true, false].map((m) => <button key={String(m)} aria-pressed={mine === m} onClick={() => setMine(m)} className={cn('rounded px-3 py-1 text-sm font-medium', mine === m ? 'bg-secondary' : 'text-muted-foreground')}>{m ? 'Mine' : 'Team'}</button>)}
          </div>
          <div className="inline-flex rounded-md border bg-card p-0.5" role="group" aria-label="Calendar view">
            {(['month', 'week', 'day'] as Mode[]).map((m) => <button key={m} aria-pressed={mode === m} onClick={() => setMode(m)} className={cn('rounded px-3 py-1 text-sm font-medium capitalize', mode === m ? 'bg-secondary' : 'text-muted-foreground')}>{m}</button>)}
          </div>
        </div>
      </div>

      {mode === 'month' && (
        <Card className="overflow-hidden">
          <div className="grid grid-cols-7 border-b bg-muted/50 text-center text-xs font-medium text-muted-foreground">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <div key={d} className="py-2">{d}</div>)}
          </div>
          <div className="grid grid-cols-7">
            {eachDayOfInterval({ start: from, end: to }).map((d) => {
              const evs = on(d);
              return (
                <div key={d.toISOString()} className={cn('group min-h-[6.5rem] border-b border-r p-1.5 [&:nth-child(7n)]:border-r-0', !isSameMonth(d, cursor) && 'bg-muted/30')}>
                  <div className="mb-1 flex items-center justify-between">
                    <button onClick={() => { setCursor(d); setMode('day'); }} className={cn('flex size-6 items-center justify-center rounded-full text-xs', isToday(d) ? 'bg-primary font-semibold text-primary-foreground' : 'text-muted-foreground hover:bg-secondary', !isSameMonth(d, cursor) && 'opacity-50')}>{format(d, 'd')}</button>
                    <button onClick={() => quick('task', { dueDate: format(d, 'yyyy-MM-dd') })} className="rounded p-0.5 text-muted-foreground opacity-0 hover:bg-secondary focus:opacity-100 group-hover:opacity-100" aria-label={`Add task on ${format(d, 'd MMMM')}`}><Plus className="size-3" /></button>
                  </div>
                  <div className="space-y-0.5">
                    {evs.slice(0, 3).map((e) => <EventChip key={e.id} e={e} compact />)}
                    {evs.length > 3 && <button onClick={() => { setCursor(d); setMode('day'); }} className="px-1 text-[11px] text-muted-foreground hover:underline">+{evs.length - 3} more</button>}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {mode === 'week' && (
        <div className="grid gap-3 md:grid-cols-7">
          {eachDayOfInterval({ start: from, end: to }).map((d) => (
            <Card key={d.toISOString()} className={cn('min-h-48 p-2', isToday(d) && 'ring-2 ring-primary')}>
              <p className="mb-2 text-xs font-semibold">{format(d, 'EEE d')}</p>
              <div className="space-y-1">{on(d).map((e) => <EventChip key={e.id} e={e} />)}</div>
            </Card>
          ))}
        </div>
      )}

      {mode === 'day' && (
        <Card className="p-4">
          {on(cursor).length === 0 ? <p className="py-10 text-center text-sm text-muted-foreground">Nothing scheduled.</p> : (
            <ol className="space-y-2">
              {on(cursor).map((e) => (
                <li key={e.id} className="flex items-start gap-3 rounded-lg border p-3">
                  <span className="w-14 shrink-0 text-sm font-semibold tabular">{e.kind === 'task' ? 'Due' : format(new Date(e.start), 'HH:mm')}</span>
                  <div className="min-w-0 flex-1">
                    <EventChip e={e} />
                    <p className="mt-1 text-xs text-muted-foreground">
                      {[e.owner?.name, e.durationMin && `${e.durationMin} min`, e.deal?.title, e.contact && fullName(e.contact)].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Card>
      )}
      <LogActivityDialog open={meeting} onOpenChange={setMeeting} type="meeting" related={{}} invalidate={[['calendar'], ['dashboard']]} />
    </>
  );
}
