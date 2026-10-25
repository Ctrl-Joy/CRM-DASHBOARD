import * as React from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { endOfDay, startOfDay, addDays } from 'date-fns';
import { toast } from 'sonner';
import { Bell, CheckSquare, Plus } from 'lucide-react';
import { TASK_PRIORITIES, type Paginated, type Task } from '@crm/shared';
import { api } from '@/lib/api';
import { cn, day, fullName, isOverdue, num } from '@/lib/utils';
import { useCan, useList } from '@/hooks/data';
import { Button } from '@/components/ui/button';
import { Card, EmptyState, PageHeader, Skeleton } from '@/components/ui/display';
import { Checkbox, Select } from '@/components/ui/form';
import { StatusBadge } from '@/components/records/badges';
import { UserChip } from '@/components/records/pickers';
import { TaskDialog } from '@/components/records/activity';

const OPEN = 'todo,in_progress';
const VIEWS = {
  overdue: { label: 'Overdue', params: () => ({ status: OPEN, dueDate_to: new Date(startOfDay(new Date()).getTime() - 1).toISOString(), sort: 'dueDate', order: 'asc' }) },
  today: { label: 'Today', params: () => ({ status: OPEN, dueDate_from: startOfDay(new Date()).toISOString(), dueDate_to: endOfDay(new Date()).toISOString() }) },
  upcoming: { label: 'Upcoming', params: () => ({ status: OPEN, dueDate_from: startOfDay(addDays(new Date(), 1)).toISOString(), sort: 'dueDate', order: 'asc' }) },
  open: { label: 'All open', params: () => ({ status: OPEN, sort: 'dueDate', order: 'asc' }) },
  done: { label: 'Completed', params: () => ({ status: 'done', sort: 'dueDate', order: 'desc' }) },
} as const;
type View = keyof typeof VIEWS;

export function TasksPage() {
  const can = useCan();
  const qc = useQueryClient();
  const [view, setView] = React.useState<View>('today');
  const [scope, setScope] = React.useState<'me' | 'all'>('me');
  const [priority, setPriority] = React.useState('');
  const [edit, setEdit] = React.useState<Task | null>(null);
  const [creating, setCreating] = React.useState(false);
  const base = { ...(scope === 'me' && { assigneeId: 'me' }), ...(priority && { priority }) };
  const params = { pageSize: 100, ...VIEWS[view].params(), ...base };
  const { data, isLoading } = useList<Task>('/tasks', params);
  const { data: overdue } = useList<Task>('/tasks', { pageSize: 1, ...VIEWS.overdue.params(), ...base });
  const { data: today } = useList<Task>('/tasks', { pageSize: 1, ...VIEWS.today.params(), ...base });
  const invalidate = [['/tasks'], ['dashboard'], ['calendar']];

  const toggle = async (t: Task, done: boolean) => {
    const key = ['/tasks', 'list', params];
    const prev = qc.getQueryData<Paginated<Task>>(key);
    qc.setQueryData<Paginated<Task>>(key, (o) => o && { ...o, data: o.data.map((x) => (x.id === t.id ? { ...x, status: done ? 'done' : 'todo' } : x)) });
    try {
      await api.patch(`/tasks/${t.id}`, { status: done ? 'done' : 'todo' });
      if (done) toast.success('Task completed', { action: { label: 'Undo', onClick: () => toggle(t, false) } });
      invalidate.forEach((k) => qc.invalidateQueries({ queryKey: k }));
    } catch (e) { qc.setQueryData(key, prev); toast.error((e as Error).message); }
  };

  return (
    <>
      <PageHeader title="Tasks" description="Your follow-ups, ordered by what's due." actions={<Button onClick={() => setCreating(true)}><Plus />New task</Button>} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="inline-flex flex-wrap gap-1 rounded-lg bg-muted p-1" role="tablist" aria-label="Task views">
          {(Object.keys(VIEWS) as View[]).map((v) => (
            <button key={v} role="tab" aria-selected={view === v} onClick={() => setView(v)}
              className={cn('inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-sm font-medium', view === v ? 'bg-card shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
              {VIEWS[v].label}
              {v === 'overdue' && !!overdue?.total && <span className="rounded-full bg-destructive px-1.5 text-[10px] text-destructive-foreground">{overdue.total}</span>}
              {v === 'today' && !!today?.total && <span className="rounded-full bg-primary/15 px-1.5 text-[10px] text-primary">{today.total}</span>}
            </button>
          ))}
        </div>
        <Select aria-label="Priority" className="w-36" value={priority} onChange={(e) => setPriority(e.target.value)}>
          <option value="">Any priority</option>{TASK_PRIORITIES.map((p) => <option key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</option>)}
        </Select>
        {(can('records:view_team') || can('records:view_all')) && (
          <Select aria-label="Whose tasks" className="w-36" value={scope} onChange={(e) => setScope(e.target.value as 'me' | 'all')}>
            <option value="me">My tasks</option><option value="all">Team tasks</option>
          </Select>
        )}
        {data && <span className="ml-auto text-sm text-muted-foreground">{num(data.total)} task{data.total === 1 ? '' : 's'}</span>}
      </div>
      <Card>
        {isLoading ? <div className="space-y-2 p-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
          : !data?.data.length ? (
            <EmptyState icon={CheckSquare} title={view === 'overdue' ? 'Nothing overdue' : view === 'today' ? 'Nothing due today' : 'No tasks here'}
              description={view === 'done' ? 'Completed tasks appear here.' : 'Plan your next steps so no deal goes cold.'}
              action={view !== 'done' && <Button onClick={() => setCreating(true)}><Plus />Add task</Button>} />
          ) : (
            <ul className="divide-y">
              {data.data.map((t) => {
                const about = t.deal ? { to: `/deals/${t.deal.id}`, label: t.deal.title } : t.contact ? { to: `/contacts/${t.contact.id}`, label: fullName(t.contact) } : t.company ? { to: `/companies/${t.company.id}`, label: t.company.name } : null;
                const late = t.status !== 'done' && isOverdue(t.dueDate);
                return (
                  <li key={t.id} className="flex items-center gap-3 px-4 py-3">
                    <Checkbox checked={t.status === 'done'} onCheckedChange={(c) => toggle(t, !!c)} aria-label={`Complete ${t.title}`} />
                    <div className="min-w-0 flex-1">
                      <button onClick={() => setEdit(t)} className={cn('block max-w-full truncate text-left text-sm font-medium hover:underline', t.status === 'done' && 'text-muted-foreground line-through')}>{t.title}</button>
                      <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                        {about && <Link to={about.to} className="hover:underline">{about.label}</Link>}
                        {t.reminderAt && <span className="inline-flex items-center gap-0.5"><Bell className="size-3" />reminder set</span>}
                        {t.status === 'in_progress' && <StatusBadge value="in_progress" />}
                      </p>
                    </div>
                    <StatusBadge value={t.priority} className="hidden sm:inline-flex" />
                    <span className={cn('w-20 text-right text-xs tabular', late ? 'font-semibold text-destructive' : 'text-muted-foreground')}>{day(t.dueDate)}</span>
                    {scope === 'all' && <span className="hidden w-36 truncate text-xs md:block"><UserChip user={t.assignee} /></span>}
                  </li>
                );
              })}
            </ul>
          )}
      </Card>
      <TaskDialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)} task={edit ?? undefined} invalidate={invalidate} />
      <TaskDialog open={creating} onOpenChange={setCreating} related={{}} invalidate={invalidate} />
    </>
  );
}
