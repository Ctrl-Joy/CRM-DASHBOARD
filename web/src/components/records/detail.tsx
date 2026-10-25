import * as React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckSquare, Mail, MoreHorizontal, Pencil, Phone, StickyNote, Trash2, Users } from 'lucide-react';
import type { CustomValues } from '@crm/shared';
import { api } from '@/lib/api';
import { cn, day, isOverdue } from '@/lib/utils';
import { useAction, useCan, useCustomFields } from '@/hooks/data';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, DetailList, EmptyState, Skeleton } from '@/components/ui/display';
import { Checkbox } from '@/components/ui/form';
import { confirm, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/overlay';
import { StatusBadge } from './badges';
import { UserChip } from './pickers';
import { EmailComposer, LogActivityDialog, TaskDialog, type Related } from './activity';

export function DetailSkeleton() {
  return (
    <div className="space-y-4" aria-busy>
      <Skeleton className="h-16 w-2/3" />
      <div className="grid gap-4 lg:grid-cols-3"><Skeleton className="h-80" /><Skeleton className="h-80 lg:col-span-2" /></div>
    </div>
  );
}

export function DetailHeader({ back, title, subtitle, avatar, badges, actions }: {
  back: { to: string; label: string }; title: React.ReactNode; subtitle?: React.ReactNode; avatar?: React.ReactNode; badges?: React.ReactNode; actions?: React.ReactNode;
}) {
  return (
    <div className="mb-5">
      <Link to={back.to} className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />{back.label}</Link>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          {avatar}
          <div className="min-w-0">
            <h1 className="flex flex-wrap items-center gap-2 font-display text-3xl leading-tight tracking-tight sm:text-4xl">{title}<span className="flex items-center gap-1.5 font-body">{badges}</span></h1>
            {subtitle && <p className="mt-0.5 truncate text-sm text-muted-foreground">{subtitle}</p>}
          </div>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

/** Standard engagement actions for a record: log call/meeting/note, email, task. */
export function EngagementActions({ related, email, vars, invalidate, onEdit, onDelete, extra }: {
  related: Related; email?: string | null; vars: Record<string, string | number | null | undefined>; invalidate: unknown[][];
  onEdit?: () => void; onDelete?: () => void; extra?: React.ReactNode;
}) {
  const [log, setLog] = React.useState<string | null>(null);
  const [mail, setMail] = React.useState(false);
  const [task, setTask] = React.useState(false);
  const can = useCan();
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setLog('call')}><Phone />Log call</Button>
      <Button size="sm" variant="outline" onClick={() => setMail(true)}><Mail />Email</Button>
      <Button size="sm" variant="outline" onClick={() => setTask(true)}><CheckSquare />Task</Button>
      {extra}
      <DropdownMenu>
        <DropdownMenuTrigger asChild><Button size="icon-sm" variant="outline" aria-label="More actions"><MoreHorizontal /></Button></DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setLog('meeting')}><Users />Log meeting</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setLog('note')}><StickyNote />Add note</DropdownMenuItem>
          {onEdit && <DropdownMenuItem onSelect={onEdit}><Pencil />Edit</DropdownMenuItem>}
          {onDelete && can('records:delete') && <DropdownMenuItem destructive onSelect={onDelete}><Trash2 />Delete</DropdownMenuItem>}
        </DropdownMenuContent>
      </DropdownMenu>
      <LogActivityDialog open={!!log} onOpenChange={(o) => !o && setLog(null)} type={log ?? 'call'} related={related} invalidate={invalidate} />
      <EmailComposer open={mail} onOpenChange={setMail} to={email} related={related} vars={vars} invalidate={invalidate} />
      <TaskDialog open={task} onOpenChange={setTask} related={related} invalidate={invalidate} />
    </>
  );
}

export function useDeleteRecord(path: string, label: string, after: string) {
  const navigate = useNavigate();
  const del = useAction((id: string) => api.del(`${path}/${id}`), { success: `${label} deleted`, invalidate: [[path], ['dashboard']], onSuccess: () => navigate(after) });
  return async (id: string, name: string) => {
    if (await confirm({ title: `Delete ${label.toLowerCase()} "${name}"?`, description: 'It will disappear from lists and reports. The deletion is recorded in the audit log.', destructive: true, confirmLabel: 'Delete' })) del.mutate(id);
  };
}

export function CustomFieldList({ entityType, values }: { entityType: string; values: CustomValues }) {
  const { data: defs } = useCustomFields(entityType);
  if (!defs.length) return null;
  return (
    <DetailList className="mt-4 border-t pt-4" items={defs.map((d) => {
      const v = values?.[d.key];
      return { label: d.label, value: v == null || v === '' ? '—' : d.type === 'checkbox' ? (v ? 'Yes' : 'No') : d.type === 'date' ? day(String(v)) : String(v) };
    })} />
  );
}

export function TaskList({ tasks, invalidate, related }: { tasks: any[]; invalidate: unknown[][]; related?: Related }) {
  const [edit, setEdit] = React.useState<any | null>(null);
  const [creating, setCreating] = React.useState(false);
  const toggle = useAction((t: { id: string; done: boolean }) => api.patch(`/tasks/${t.id}`, { status: t.done ? 'done' : 'todo' }), { invalidate });
  return (
    <div>
      {tasks.length === 0 ? (
        <EmptyState icon={CheckSquare} title="No tasks" description="Plan the next step so nothing slips." action={related && <Button size="sm" onClick={() => setCreating(true)}>Add task</Button>} className="py-8" />
      ) : (
        <ul className="divide-y">
          {tasks.map((t) => (
            <li key={t.id} className="flex items-center gap-3 py-2">
              <Checkbox checked={t.status === 'done'} onCheckedChange={(c) => toggle.mutate({ id: t.id, done: !!c })} aria-label={`Complete ${t.title}`} />
              <button className={cn('min-w-0 flex-1 truncate text-left text-sm', t.status === 'done' && 'text-muted-foreground line-through')} onClick={() => setEdit(t)}>{t.title}</button>
              <StatusBadge value={t.priority} />
              <span className={cn('w-20 text-right text-xs', t.status !== 'done' && isOverdue(t.dueDate) ? 'font-semibold text-destructive' : 'text-muted-foreground')}>{day(t.dueDate)}</span>
              <span className="hidden w-32 truncate text-xs sm:block"><UserChip user={t.assignee} /></span>
            </li>
          ))}
        </ul>
      )}
      {related && tasks.length > 0 && <Button size="sm" variant="ghost" className="mt-2" onClick={() => setCreating(true)}>+ Add task</Button>}
      <TaskDialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)} task={edit ?? undefined} invalidate={invalidate} />
      <TaskDialog open={creating} onOpenChange={setCreating} related={related} invalidate={invalidate} />
    </div>
  );
}

export function SideCard({ title, icon, action, children }: { title: string; icon?: React.ComponentProps<typeof CardHeader>['icon']; action?: React.ReactNode; children: React.ReactNode }) {
  return <Card><CardHeader title={title} icon={icon} action={action} /><CardBody>{children}</CardBody></Card>;
}
