import * as React from 'react';
import { Link } from 'react-router-dom';
import {
  CalendarClock, CheckCircle2, Download, FileText, Mail, MessageSquare, Paperclip, Phone, Sparkles, StickyNote, Trash2, Upload, Users,
  type LucideIcon,
} from 'lucide-react';
import {
  activitySchema, CALL_OUTCOMES, labelize, MERGE_TAGS, renderTemplate, sendEmailSchema, TASK_PRIORITIES, TASK_STATUSES, taskSchema,
  type Activity, type Attachment,
} from '@crm/shared';
import { api } from '@/lib/api';
import { ago, cn, dateTime, day, fullName, isOverdue } from '@/lib/utils';
import { useAction, useMe, useTemplates } from '@/hooks/data';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, EmptyState } from '@/components/ui/display';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { confirm, Dialog, DialogContent, DialogFooter, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/overlay';
import { RecordFormDialog, toFormValues, type FieldDef } from './record-form';
import { StatusBadge } from './badges';

export type Related = Partial<Record<'contactId' | 'dealId' | 'companyId' | 'leadId' | 'ticketId', string | null>>;

export const ACTIVITY_ICON: Record<string, LucideIcon> = { call: Phone, email: Mail, meeting: Users, note: StickyNote, task: CheckCircle2 };
const ICON_TONE: Record<string, string> = {
  call: 'bg-chart-2/15 text-chart-2', email: 'bg-chart-1/15 text-chart-1', meeting: 'bg-chart-4/15 text-chart-4', note: 'bg-chart-3/15 text-chart-3', task: 'bg-muted text-muted-foreground',
};

// ---------- timeline ----------
export function Timeline({ activities, invalidate, emptyAction }: { activities: Activity[]; invalidate: unknown[][]; emptyAction?: React.ReactNode }) {
  const [type, setType] = React.useState<string>('all');
  const complete = useAction((id: string) => api.patch(`/activities/${id}`, { completed: true }), { success: 'Marked as done', invalidate });
  const shown = activities.filter((a) => type === 'all' || a.type === type);
  if (!activities.length) return <EmptyState icon={MessageSquare} title="No activity yet" description="Log a call, email, meeting or note to start the timeline." action={emptyAction} />;
  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-1" role="group" aria-label="Filter timeline">
        {['all', 'call', 'email', 'meeting', 'note'].map((t) => (
          <button key={t} onClick={() => setType(t)} aria-pressed={type === t}
            className={cn('rounded-full border px-2.5 py-0.5 text-xs font-medium', type === t ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-secondary')}>
            {t === 'all' ? 'All' : `${labelize(t)}s`}
          </button>
        ))}
      </div>
      <ol className="relative space-y-4 before:absolute before:bottom-2 before:left-4 before:top-2 before:w-px before:bg-border">
        {shown.map((a) => {
          const Icon = ACTIVITY_ICON[a.type] ?? StickyNote;
          const scheduled = !a.completed && a.dueAt;
          return (
            <li key={a.id} className="relative flex gap-3 pl-0">
              <span className={cn('relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full ring-4 ring-card', ICON_TONE[a.type])}><Icon className="size-4" aria-hidden /></span>
              <div className="min-w-0 flex-1 rounded-lg border bg-card p-3">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <p className="font-medium">{a.subject}</p>
                  {a.outcome && <StatusBadge value={a.outcome} />}
                  {scheduled && <span className={cn('inline-flex items-center gap-1 text-xs font-medium', isOverdue(a.dueAt) ? 'text-destructive' : 'text-warning')}><CalendarClock className="size-3" />{dateTime(a.dueAt)}</span>}
                  <span className="ml-auto text-xs text-muted-foreground">{ago(a.createdAt)}</span>
                </div>
                {a.body && <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground line-clamp-6">{a.body}</p>}
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span>{a.owner?.name}</span>
                  {a.emailTo && <span>to {a.emailTo}</span>}
                  {a.durationMin ? <span>{a.durationMin} min</span> : null}
                  {a.deal && <Link className="hover:underline" to={`/deals/${a.deal.id}`}>{a.deal.title}</Link>}
                  {a.contact && <Link className="hover:underline" to={`/contacts/${a.contact.id}`}>{fullName(a.contact)}</Link>}
                  {scheduled && <Button size="sm" variant="outline" className="ml-auto h-6 px-2" onClick={() => complete.mutate(a.id)}>Mark done</Button>}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// ---------- log activity ----------
const activityFields = (type: string): FieldDef[] => [
  { name: 'type', label: 'Type', type: 'select', options: ['call', 'email', 'meeting', 'note'] },
  { name: 'subject', label: 'Subject', type: 'text', required: true, placeholder: type === 'call' ? 'Discovery call' : type === 'meeting' ? 'Demo meeting' : 'Summary' },
  ...(type === 'call' ? [{ name: 'outcome', label: 'Outcome', type: 'select', options: CALL_OUTCOMES, allowEmpty: '—' } as FieldDef] : []),
  ...(type === 'call' || type === 'meeting' ? [{ name: 'durationMin', label: 'Duration (minutes)', type: 'number' } as FieldDef] : []),
  ...(type === 'meeting' || type === 'call' ? [
    { name: 'dueAt', label: 'Scheduled for', type: 'datetime', hint: 'Leave empty if it already happened' } as FieldDef,
  ] : []),
  { name: 'body', label: type === 'note' ? 'Note' : 'Details', type: 'textarea' },
];

export function LogActivityDialog({ open, onOpenChange, related, type: initialType = 'call', invalidate }: {
  open: boolean; onOpenChange: (o: boolean) => void; related: Related; type?: string; invalidate: unknown[][];
}) {
  const [type, setType] = React.useState(initialType);
  React.useEffect(() => { if (open) setType(initialType); }, [open, initialType]);
  const save = useAction((v: Record<string, unknown>) => api.post('/activities', { ...related, ...v, type, completed: !v.dueAt || new Date(v.dueAt as string) <= new Date() }), {
    success: type === 'note' ? 'Note added' : 'Activity logged', invalidate,
  });
  const fields = activityFields(type).filter((f) => f.name !== 'type');
  return (
    <RecordFormDialog open={open} onOpenChange={onOpenChange} title={`Log ${type}`} schema={activitySchema} fields={fields}
      defaultValues={toFormValues(fields, undefined, { type, ...related, completed: true })} onSubmit={(v) => save.mutateAsync(v)} submitLabel="Save" size="md">
      <div className="mt-4 flex flex-wrap gap-1" role="group" aria-label="Activity type">
        {['call', 'meeting', 'note'].map((t) => {
          const Icon = ACTIVITY_ICON[t];
          return (
            <button key={t} type="button" onClick={() => setType(t)} aria-pressed={type === t}
              className={cn('inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium', type === t ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-secondary')}>
              <Icon className="size-3.5" />{labelize(t)}
            </button>
          );
        })}
      </div>
    </RecordFormDialog>
  );
}

// ---------- task ----------
export const taskFields: FieldDef[] = [
  { name: 'title', label: 'Task', type: 'text', required: true, span: 2 },
  { name: 'dueDate', label: 'Due date', type: 'date' },
  { name: 'priority', label: 'Priority', type: 'select', options: TASK_PRIORITIES },
  { name: 'status', label: 'Status', type: 'select', options: TASK_STATUSES },
  { name: 'assigneeId', label: 'Assignee', type: 'user' },
  { name: 'reminderAt', label: 'Remind me at', type: 'datetime' },
  { name: 'description', label: 'Notes', type: 'textarea' },
];

export function TaskDialog({ open, onOpenChange, related = {}, task, invalidate }: {
  open: boolean; onOpenChange: (o: boolean) => void; related?: Related; task?: Record<string, any>; invalidate: unknown[][];
}) {
  const { data: me } = useMe();
  const save = useAction((v: Record<string, unknown>) => (task ? api.patch(`/tasks/${task.id}`, v) : api.post('/tasks', { ...related, ...v })), {
    success: task ? 'Task updated' : 'Task created', invalidate,
  });
  return (
    <RecordFormDialog open={open} onOpenChange={onOpenChange} title={task ? 'Edit task' : 'New task'} schema={task ? taskSchema.partial() : taskSchema}
      fields={taskFields} size="md"
      defaultValues={toFormValues(taskFields, task, { priority: 'medium', status: 'todo', assigneeId: me?.id, ...related })}
      onSubmit={(v) => save.mutateAsync(v)} />
  );
}

// ---------- email ----------
export function EmailComposer({ open, onOpenChange, to, related, vars, invalidate }: {
  open: boolean; onOpenChange: (o: boolean) => void; to?: string | null; related: Related;
  vars: Record<string, string | number | null | undefined>; invalidate: unknown[][];
}) {
  const { data: me } = useMe();
  const { data: templates = [] } = useTemplates();
  const [form, setForm] = React.useState({ to: to ?? '', subject: '', body: '', templateId: '' });
  const [preview, setPreview] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const bodyRef = React.useRef<HTMLTextAreaElement>(null);
  React.useEffect(() => { if (open) { setForm({ to: to ?? '', subject: '', body: '', templateId: '' }); setPreview(false); setErrors({}); } }, [open, to]);
  const allVars = { ...vars, email: form.to, sender_name: me?.name, sender_email: me?.email };
  const send = useAction(() => api.post<{ provider: string }>('/email/send', { ...form, ...related, templateId: form.templateId || null }), {
    success: (r) => (r.provider === 'console' ? 'Email logged (dev mode: delivery is stubbed)' : 'Email sent'), invalidate, onSuccess: () => onOpenChange(false),
  });
  const insertTag = (tag: string) => {
    const el = bodyRef.current;
    const pos = el?.selectionStart ?? form.body.length;
    setForm((f) => ({ ...f, body: `${f.body.slice(0, pos)}{{${tag}}}${f.body.slice(pos)}` }));
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="New email" size="lg">
        <form noValidate onSubmit={(e) => {
          e.preventDefault();
          const r = sendEmailSchema.safeParse({ ...form, ...related, templateId: form.templateId || null });
          if (!r.success) { setErrors(Object.fromEntries(r.error.issues.map((i) => [String(i.path[0]), i.message]))); return; }
          send.mutate(undefined);
        }} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="To" required error={errors.to}><Input type="email" value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} /></Field>
            <Field label="Template">
              <Select value={form.templateId} onChange={(e) => {
                const t = templates.find((x) => x.id === e.target.value);
                setForm({ ...form, templateId: e.target.value, ...(t && { subject: t.subject, body: t.body }) });
              }}>
                <option value="">No template</option>
                {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </Select>
            </Field>
          </div>
          <Field label="Subject" required error={errors.subject}><Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} /></Field>
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-sm font-medium">Message <span className="text-destructive">*</span></span>
              <div className="flex gap-1">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild><Button type="button" size="sm" variant="ghost">Insert merge tag</Button></DropdownMenuTrigger>
                  <DropdownMenuContent align="end">{MERGE_TAGS.map((m) => <DropdownMenuItem key={m.tag} onSelect={() => insertTag(m.tag)}><code className="text-xs">{`{{${m.tag}}}`}</code><span className="text-xs text-muted-foreground">{m.label}</span></DropdownMenuItem>)}</DropdownMenuContent>
                </DropdownMenu>
                <Button type="button" size="sm" variant={preview ? 'secondary' : 'ghost'} onClick={() => setPreview((p) => !p)} aria-pressed={preview}>Preview</Button>
              </div>
            </div>
            {preview ? (
              <div className="min-h-[200px] rounded-md border bg-muted/30 p-3 text-sm">
                <p className="mb-2 font-semibold">{renderTemplate(form.subject, allVars)}</p>
                <p className="whitespace-pre-wrap">{renderTemplate(form.body, allVars)}</p>
              </div>
            ) : (
              <Textarea ref={bodyRef} rows={9} value={form.body} aria-label="Message" aria-invalid={!!errors.body} onChange={(e) => setForm({ ...form, body: e.target.value })}
                placeholder={'Hi {{first_name}},\n\n…'} />
            )}
            {errors.body && <p className="mt-1 text-xs font-medium text-destructive">{errors.body}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" loading={send.isPending}><Mail />Send</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------- attachments ----------
export function Attachments({ files, related, invalidate }: { files: Attachment[]; related: Related; invalidate: unknown[][] }) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const upload = useAction((file: File) => {
    const fd = new FormData();
    Object.entries(related).forEach(([k, v]) => v && fd.append(k, v));
    fd.append('file', file);
    return api.post('/files', fd);
  }, { success: 'File uploaded', invalidate });
  const remove = useAction((id: string) => api.del(`/files/${id}`), { success: 'File deleted', invalidate });
  return (
    <Card>
      <CardHeader title="Files" icon={Paperclip} action={
        <>
          <input ref={inputRef} type="file" className="sr-only" aria-label="Upload file" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload.mutate(f); e.target.value = ''; }} />
          <Button size="sm" variant="ghost" loading={upload.isPending} onClick={() => inputRef.current?.click()}><Upload />Upload</Button>
        </>
      } />
      <CardBody>
        {files.length === 0 ? <p className="text-sm text-muted-foreground">No files yet. Max 10 MB per file.</p> : (
          <ul className="space-y-1.5">
            {files.map((f) => (
              <li key={f.id} className="flex items-center gap-2 text-sm">
                <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <a href={`/api/files/${f.id}/download`} className="min-w-0 flex-1 truncate hover:underline">{f.fileName}</a>
                <span className="text-xs text-muted-foreground">{(f.size / 1024).toFixed(0)} KB · {day(f.createdAt)}</span>
                <a href={`/api/files/${f.id}/download`} className="rounded p-1 text-muted-foreground hover:bg-secondary" aria-label={`Download ${f.fileName}`}><Download className="size-3.5" /></a>
                <button className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-destructive" aria-label={`Delete ${f.fileName}`}
                  onClick={async () => { if (await confirm({ title: 'Delete this file?', description: f.fileName, destructive: true, confirmLabel: 'Delete' })) remove.mutate(f.id); }}>
                  <Trash2 className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

export function AISummary({ text }: { text: string }) {
  return (
    <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-transparent">
      <CardHeader title="AI summary" icon={Sparkles} description="Generated from this record's recent timeline" />
      <CardBody><p className="text-sm leading-relaxed">{text}</p></CardBody>
    </Card>
  );
}
