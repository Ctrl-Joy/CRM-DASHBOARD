import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, History, Pencil, Plus, Trash2, Workflow as WorkflowIcon, X, Zap } from 'lucide-react';
import {
  labelize, LEAD_STATUSES, LIFECYCLE_STAGES, CONTACT_STATUSES, TASK_PRIORITIES, TICKET_PRIORITIES, TICKET_STATUSES,
  WORKFLOW_ACTIONS, WORKFLOW_OPERATORS, WORKFLOW_TRIGGER_LABELS, WORKFLOW_TRIGGERS, workflowSchema,
  type Workflow, type WorkflowInput, type WorkflowRun, type WorkflowTrigger,
} from '@crm/shared';
import { api } from '@/lib/api';
import { ago, cn, dateTime } from '@/lib/utils';
import { useAction, useCan, useTemplates, useUsers } from '@/hooks/data';
import { Button } from '@/components/ui/button';
import { Badge, Card, EmptyState, PageHeader, Skeleton } from '@/components/ui/display';
import { Field, Input, Select, Switch } from '@/components/ui/form';
import { confirm, Dialog, DialogContent, DialogFooter } from '@/components/ui/overlay';

const entityOf = (t: string) => t.split('.')[0] as 'deal' | 'lead' | 'contact' | 'ticket';
const FIELDS: Record<string, { value: string; label: string }[]> = {
  deal: [{ value: 'stage.name', label: 'Stage name' }, { value: 'value', label: 'Value' }, { value: 'title', label: 'Title' }, { value: 'status', label: 'Status' }, { value: 'currency', label: 'Currency' }],
  lead: [{ value: 'source', label: 'Source' }, { value: 'score', label: 'Score' }, { value: 'status', label: 'Status' }, { value: 'territory', label: 'Territory' }, { value: 'companySize', label: 'Company size' }],
  contact: [{ value: 'lifecycleStage', label: 'Lifecycle stage' }, { value: 'source', label: 'Source' }, { value: 'title', label: 'Job title' }],
  ticket: [{ value: 'priority', label: 'Priority' }, { value: 'status', label: 'Status' }, { value: 'channel', label: 'Channel' }],
};
const UPDATABLE: Record<string, Record<string, readonly string[] | 'number'>> = {
  deal: { probability: 'number' }, lead: { status: LEAD_STATUSES },
  contact: { lifecycleStage: LIFECYCLE_STAGES, status: CONTACT_STATUSES }, ticket: { priority: TICKET_PRIORITIES, status: TICKET_STATUSES },
};

const RECIPES: { name: string; input: WorkflowInput }[] = [
  { name: 'Follow up when a deal reaches Negotiation', input: { name: 'Negotiation follow-up', trigger: 'deal.stage_changed', active: true, conditions: [{ field: 'stage.name', operator: 'equals', value: 'Negotiation' }], actions: [{ type: 'create_task', params: { title: 'Send contract to {{company_name}}', dueInDays: '2', priority: 'high', assignee: 'owner' } }] } },
  { name: 'Alert the manager about big new deals', input: { name: 'Big deal alert', trigger: 'deal.created', active: true, conditions: [{ field: 'value', operator: 'greater_than', value: '50000' }], actions: [{ type: 'notify_user', params: { recipient: 'manager', message: 'New big deal: {{name}} ({{deal_value}})' } }] } },
  { name: 'Fast-track hot inbound leads', input: { name: 'Hot lead fast-track', trigger: 'lead.created', active: true, conditions: [{ field: 'score', operator: 'greater_than', value: '69' }], actions: [{ type: 'create_task', params: { title: 'Call {{full_name}} within the hour', dueInDays: '0', priority: 'urgent', assignee: 'owner' } }] } },
  { name: 'Escalate urgent tickets', input: { name: 'Urgent ticket escalation', trigger: 'ticket.created', active: true, conditions: [{ field: 'priority', operator: 'equals', value: 'urgent' }], actions: [{ type: 'notify_user', params: { recipient: 'manager', message: 'Urgent ticket: {{title}}' } }] } },
  { name: 'Mark contacts as customers on win', input: { name: 'Won → customer onboarding', trigger: 'deal.won', active: true, conditions: [], actions: [{ type: 'create_task', params: { title: 'Kick off onboarding for {{company_name}}', dueInDays: '1', priority: 'medium', assignee: 'owner' } }] } },
];

function describe(w: Pick<Workflow, 'trigger' | 'conditions' | 'actions'>) {
  const when = WORKFLOW_TRIGGER_LABELS[w.trigger as WorkflowTrigger] ?? w.trigger;
  const iff = w.conditions.map((c) => `${c.field} ${labelize(c.operator).toLowerCase()} "${c.value}"`).join(' and ');
  const then = w.actions.map((a) => labelize(a.type).toLowerCase()).join(', then ');
  return `When ${when.toLowerCase()}${iff ? ` and ${iff}` : ''} → ${then}`;
}

export function AutomationsPage() {
  const can = useCan();
  const manage = can('workflows:manage');
  const { data, isLoading } = useQuery({ queryKey: ['workflows'], queryFn: () => api.get<{ data: Workflow[] }>('/workflows').then((r) => r.data) });
  const [editing, setEditing] = React.useState<{ id?: string; input: WorkflowInput } | null>(null);
  const [runsFor, setRunsFor] = React.useState<Workflow | null>(null);
  const toggle = useAction((w: { id: string; active: boolean }) => api.patch(`/workflows/${w.id}/active`, { active: w.active }), { invalidate: [['workflows']] });
  const remove = useAction((id: string) => api.del(`/workflows/${id}`), { success: 'Workflow deleted', invalidate: [['workflows']] });
  const blank: WorkflowInput = { name: '', trigger: 'deal.stage_changed', active: true, conditions: [], actions: [{ type: 'create_task', params: { title: 'Follow up on {{name}}', dueInDays: '1', priority: 'medium', assignee: 'owner' } }] };

  return (
    <>
      <PageHeader title="Automations" description="Trigger → condition → action rules that do the busywork for your team."
        actions={manage && <Button onClick={() => setEditing({ input: blank })}><Plus />New workflow</Button>} />
      {isLoading ? <Skeleton className="h-40" /> : (
        <>
          {!data?.length ? (
            <Card className="mb-5"><EmptyState icon={WorkflowIcon} title="No automations yet" description={manage ? 'Start from a recipe below or build your own.' : 'Ask a manager to set up automations.'} /></Card>
          ) : (
            <div className="mb-6 space-y-3">
              {data.map((w) => (
                <Card key={w.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                  <span className={cn('rounded-lg p-2', w.active ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground')}><Zap className="size-5" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{w.name} {!w.active && <Badge variant="secondary" className="ml-1">Paused</Badge>}</p>
                    <p className="text-sm text-muted-foreground">{describe(w)}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">Ran {w.runCount} time{w.runCount === 1 ? '' : 's'}{w.lastRunAt && ` · last ${ago(w.lastRunAt)}`}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    {manage && <Switch checked={w.active} onCheckedChange={(c) => toggle.mutate({ id: w.id, active: c })} aria-label={`${w.active ? 'Pause' : 'Activate'} ${w.name}`} />}
                    <Button size="sm" variant="ghost" onClick={() => setRunsFor(w)}><History />Runs</Button>
                    {manage && <Button size="icon-sm" variant="ghost" aria-label={`Edit ${w.name}`} onClick={() => setEditing({ id: w.id, input: { name: w.name, trigger: w.trigger as WorkflowTrigger, active: w.active, conditions: w.conditions as never, actions: w.actions as never } })}><Pencil /></Button>}
                    {manage && <Button size="icon-sm" variant="ghost" className="text-destructive" aria-label={`Delete ${w.name}`} onClick={async () => { if (await confirm({ title: `Delete "${w.name}"?`, destructive: true, confirmLabel: 'Delete' })) remove.mutate(w.id); }}><Trash2 /></Button>}
                  </div>
                </Card>
              ))}
            </div>
          )}
          {manage && (
            <>
              <h2 className="mb-3 text-sm font-semibold text-muted-foreground">Recipes</h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {RECIPES.map((r) => (
                  <button key={r.name} onClick={() => setEditing({ input: r.input })} className="rounded-xl border bg-card p-4 text-left shadow-sm transition-colors hover:border-primary">
                    <p className="font-medium">{r.name}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{describe(r.input)}</p>
                  </button>
                ))}
              </div>
            </>
          )}
        </>
      )}
      {editing && <WorkflowEditor initial={editing} onClose={() => setEditing(null)} />}
      <RunsDialog workflow={runsFor} onClose={() => setRunsFor(null)} />
    </>
  );
}

function WorkflowEditor({ initial, onClose }: { initial: { id?: string; input: WorkflowInput }; onClose: () => void }) {
  const [w, setW] = React.useState<WorkflowInput>(initial.input);
  const [error, setError] = React.useState('');
  const { data: users = [] } = useUsers();
  const { data: templates = [] } = useTemplates();
  const entity = entityOf(w.trigger);
  const save = useAction(() => (initial.id ? api.put(`/workflows/${initial.id}`, w) : api.post('/workflows', w)), { success: 'Workflow saved', invalidate: [['workflows']], onSuccess: onClose });
  const setAction = (i: number, patch: Partial<WorkflowInput['actions'][number]>) => setW({ ...w, actions: w.actions.map((a, j) => (j === i ? { ...a, ...patch } : a)) });
  const setParam = (i: number, k: string, v: string) => setAction(i, { params: { ...w.actions[i].params, [k]: v } });
  const recipient = (i: number, key: string, label: string, options: { value: string; label: string }[]) => (
    <Field label={label}><Select value={w.actions[i].params[key] ?? options[0].value} onChange={(e) => setParam(i, key, e.target.value)}>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
    </Select></Field>
  );
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={initial.id ? 'Edit workflow' : 'New workflow'} size="xl">
        {error && <p role="alert" className="mb-3 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" required><Input value={w.name} onChange={(e) => setW({ ...w, name: e.target.value })} /></Field>
          <Field label="Active"><div className="flex h-9 items-center"><Switch checked={w.active} onCheckedChange={(c) => setW({ ...w, active: c })} aria-label="Active" /></div></Field>
        </div>
        <section className="mt-5 rounded-lg border p-4">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-primary">1 · When</p>
          <Select aria-label="Trigger" value={w.trigger} onChange={(e) => setW({ ...w, trigger: e.target.value as WorkflowTrigger, conditions: [] })}>
            {WORKFLOW_TRIGGERS.map((t) => <option key={t} value={t}>{WORKFLOW_TRIGGER_LABELS[t]}</option>)}
          </Select>
        </section>
        <section className="mt-3 rounded-lg border p-4">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-primary">2 · Only if (optional)</p>
          {w.conditions.map((c, i) => (
            <div key={i} className="mb-2 flex flex-wrap gap-2">
              <Select aria-label="Field" className="w-44" value={c.field} onChange={(e) => setW({ ...w, conditions: w.conditions.map((x, j) => (j === i ? { ...x, field: e.target.value } : x)) })}>
                {FIELDS[entity].map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
              </Select>
              <Select aria-label="Operator" className="w-40" value={c.operator} onChange={(e) => setW({ ...w, conditions: w.conditions.map((x, j) => (j === i ? { ...x, operator: e.target.value as never } : x)) })}>
                {WORKFLOW_OPERATORS.map((o) => <option key={o} value={o}>{labelize(o)}</option>)}
              </Select>
              <Input aria-label="Value" className="w-auto flex-1" value={c.value} onChange={(e) => setW({ ...w, conditions: w.conditions.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)) })} />
              <Button variant="ghost" size="icon" aria-label="Remove condition" onClick={() => setW({ ...w, conditions: w.conditions.filter((_, j) => j !== i) })}><X /></Button>
            </div>
          ))}
          <Button size="sm" variant="ghost" onClick={() => setW({ ...w, conditions: [...w.conditions, { field: FIELDS[entity][0].value, operator: 'equals', value: '' }] })}><Plus />Add condition</Button>
        </section>
        <section className="mt-3 rounded-lg border p-4">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-primary">3 · Then</p>
          {w.actions.map((a, i) => (
            <div key={i} className="mb-3 rounded-md bg-muted/40 p-3">
              <div className="mb-3 flex items-center gap-2">
                {i > 0 && <ArrowRight className="size-4 text-muted-foreground" />}
                <Select aria-label="Action" className="w-56" value={a.type} onChange={(e) => setAction(i, { type: e.target.value as never, params: {} })}>
                  {WORKFLOW_ACTIONS.map((t) => <option key={t} value={t}>{labelize(t)}</option>)}
                </Select>
                <Button variant="ghost" size="icon" className="ml-auto" aria-label="Remove action" disabled={w.actions.length === 1} onClick={() => setW({ ...w, actions: w.actions.filter((_, j) => j !== i) })}><X /></Button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {a.type === 'create_task' && <>
                  <Field label="Task title" className="sm:col-span-2" hint="Merge tags: {{name}}, {{company_name}}, {{full_name}}, {{stage}}"><Input value={a.params.title ?? ''} onChange={(e) => setParam(i, 'title', e.target.value)} /></Field>
                  <Field label="Due in (days)"><Input type="number" min={0} value={a.params.dueInDays ?? '1'} onChange={(e) => setParam(i, 'dueInDays', e.target.value)} /></Field>
                  <Field label="Priority"><Select value={a.params.priority ?? 'medium'} onChange={(e) => setParam(i, 'priority', e.target.value)}>{TASK_PRIORITIES.map((p) => <option key={p} value={p}>{labelize(p)}</option>)}</Select></Field>
                  {recipient(i, 'assignee', 'Assign to', [{ value: 'owner', label: 'Record owner' }, { value: 'manager', label: "Owner's manager" }])}
                </>}
                {a.type === 'notify_user' && <>
                  {recipient(i, 'recipient', 'Notify', [{ value: 'owner', label: 'Record owner' }, { value: 'manager', label: "Owner's manager" }])}
                  <Field label="Message"><Input value={a.params.message ?? ''} onChange={(e) => setParam(i, 'message', e.target.value)} placeholder="{{name}} needs attention" /></Field>
                </>}
                {a.type === 'assign_owner' && (
                  <Field label="Assign to"><Select value={a.params.userId ?? 'round_robin'} onChange={(e) => setParam(i, 'userId', e.target.value)}>
                    <option value="round_robin">Round-robin / territory rules</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </Select></Field>
                )}
                {a.type === 'update_field' && (() => {
                  const opts = UPDATABLE[entity];
                  const field = a.params.field ?? Object.keys(opts)[0];
                  const values = opts[field];
                  return <>
                    <Field label="Field"><Select value={field} onChange={(e) => setAction(i, { params: { field: e.target.value, value: '' } })}>{Object.keys(opts).map((f) => <option key={f} value={f}>{labelize(f)}</option>)}</Select></Field>
                    <Field label="New value">{values === 'number' || !values
                      ? <Input type="number" min={0} max={100} value={a.params.value ?? ''} onChange={(e) => setAction(i, { params: { field, value: e.target.value } })} />
                      : <Select value={a.params.value ?? ''} onChange={(e) => setAction(i, { params: { field, value: e.target.value } })}><option value="">Choose…</option>{values.map((v) => <option key={v} value={v}>{labelize(v)}</option>)}</Select>}</Field>
                  </>;
                })()}
                {a.type === 'send_email' && (
                  <Field label="Email template" hint="Sent to the record's contact email">
                    <Select value={a.params.templateId ?? ''} onChange={(e) => setParam(i, 'templateId', e.target.value)}><option value="">Choose a template…</option>{templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select>
                  </Field>
                )}
              </div>
            </div>
          ))}
          <Button size="sm" variant="ghost" onClick={() => setW({ ...w, actions: [...w.actions, { type: 'notify_user', params: { recipient: 'owner' } }] })}><Plus />Add action</Button>
        </section>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button loading={save.isPending} onClick={() => {
            // Fill defaults the selects display but haven't written yet.
            const filled = { ...w, actions: w.actions.map((a) => a.type === 'update_field' && !a.params.field ? { ...a, params: { ...a.params, field: Object.keys(UPDATABLE[entity])[0] } } : a) };
            const r = workflowSchema.safeParse(filled);
            if (!r.success) { setError(r.error.issues[0].message); return; }
            setError(''); setW(filled); save.mutate(undefined);
          }}>Save workflow</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RunsDialog({ workflow, onClose }: { workflow: Workflow | null; onClose: () => void }) {
  const { data } = useQuery({ queryKey: ['workflows', workflow?.id, 'runs'], enabled: !!workflow, queryFn: () => api.get<{ data: WorkflowRun[] }>(`/workflows/${workflow!.id}/runs`).then((r) => r.data) });
  return (
    <Dialog open={!!workflow} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={`Run history · ${workflow?.name ?? ''}`} size="lg">
        {!data?.length ? <p className="py-6 text-center text-sm text-muted-foreground">This workflow hasn't run yet.</p> : (
          <ul className="divide-y text-sm">
            {data.map((r) => (
              <li key={r.id} className="flex items-start gap-3 py-2">
                <Badge variant={r.status === 'success' ? 'success' : r.status === 'failed' ? 'destructive' : 'secondary'}>{r.status}</Badge>
                <span className="flex-1">{r.message}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{dateTime(r.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
