import * as React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRightLeft, CheckCircle2, Link2, Plus, Sparkles, Target } from 'lucide-react';
import { LEAD_SOURCES, LEAD_STATUSES, type Activity, type Lead, type Paginated, type Task } from '@crm/shared';
import { api } from '@/lib/api';
import { ago, day, fullName, money } from '@/lib/utils';
import { useAction, useMe, usePipelines, useRecord } from '@/hooks/data';
import { Button } from '@/components/ui/button';
import { Avatar, Card, CardBody, DetailList, EmptyState, PageHeader, Progress, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/display';
import { Checkbox, Field, Input, Select } from '@/components/ui/form';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/overlay';
import { ListPage, type Column } from '@/components/data/list-page';
import { Attachments, Timeline } from '@/components/records/activity';
import { ScoreBadge, StatusBadge } from '@/components/records/badges';
import { UserChip } from '@/components/records/pickers';
import { CustomFieldList, DetailHeader, DetailSkeleton, EngagementActions, SideCard, TaskList, useDeleteRecord } from '@/components/records/detail';
import { EntityFormDialog, useQuickCreate } from '@/features/forms';

const columns: Column<Lead>[] = [
  {
    key: 'name', header: 'Lead', sortKey: 'firstName',
    cell: (l) => <span className="min-w-0"><span className="block truncate">{fullName(l)}</span><span className="block truncate text-xs font-normal text-muted-foreground">{[l.title, l.companyName].filter(Boolean).join(' · ') || l.email}</span></span>,
  },
  { key: 'score', header: 'Score', sortKey: 'score', cell: (l) => <ScoreBadge score={l.score} /> },
  { key: 'status', header: 'Status', sortKey: 'status', cell: (l) => l.status, edit: { field: 'status', options: LEAD_STATUSES, value: (l) => l.status } },
  { key: 'source', header: 'Source', sortKey: 'source', cell: (l) => <StatusBadge value={l.source} />, hideBelow: 'md' },
  { key: 'owner', header: 'Owner', cell: (l) => <UserChip user={l.owner} />, hideBelow: 'sm' },
  { key: 'response', header: 'First response', cell: (l) => (l.firstResponseAt ? ago(l.firstResponseAt) : <span className="font-medium text-warning">Waiting {ago(l.createdAt).replace(' ago', '')}</span>), hideBelow: 'lg' },
  { key: 'createdAt', header: 'Created', sortKey: 'createdAt', cell: (l) => day(l.createdAt), hideBelow: 'md' },
];

export function LeadsPage() {
  const quick = useQuickCreate((s) => s.open);
  const { data: me } = useMe();
  return (
    <>
      <PageHeader title="Leads" description="Score, assign and convert inbound interest."
        actions={<>
          {me?.org.leadApiKey && <Button variant="outline" asChild><a href={`/f/${me.org.leadApiKey}`} target="_blank" rel="noreferrer"><Link2 />Open capture form</a></Button>}
          <Button onClick={() => quick('lead')}><Plus />New lead</Button>
        </>} />
      <ListPage<Lead>
        entityType="lead" path="/leads" columns={columns} rowLink={(l) => `/leads/${l.id}`}
        filters={[
          { key: 'status', label: 'Status', type: 'select', options: LEAD_STATUSES },
          { key: 'source', label: 'Source', type: 'select', options: LEAD_SOURCES },
          { key: 'ownerId', label: 'Owner', type: 'user' },
          { key: 'created', label: 'Created', type: 'date', field: 'createdAt' },
        ]}
        bulkStatus={{ label: 'Status', options: LEAD_STATUSES }}
        importable={{ columns: 'First name, Last name, Email, Phone, Company, Title, Company size, Source, Territory' }}
        empty={{ icon: Target, title: 'No leads yet', description: 'Add leads manually, import a CSV, or share your hosted capture form — inbound leads are scored and auto-assigned.', action: <Button onClick={() => quick('lead')}><Plus />Add lead</Button> }}
      />
    </>
  );
}

export function LeadDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: lead, isLoading, isError } = useRecord<Lead>('/leads', id);
  const { data: insights } = useQuery({ queryKey: ['/leads', id, 'insights'], queryFn: () => api.get<{ score: number; suggestion: string }>(`/leads/${id}/insights`), enabled: !!id });
  const { data: activities } = useQuery({ queryKey: ['/leads', id, 'activities'], queryFn: () => api.get<Paginated<Activity>>('/activities', { leadId: id, pageSize: 100 }), enabled: !!id });
  const { data: tasks } = useQuery({ queryKey: ['/leads', id, 'tasks'], queryFn: () => api.get<Paginated<Task>>('/tasks', { leadId: id, pageSize: 100 }), enabled: !!id });
  const { data: files } = useQuery({ queryKey: ['/leads', id, 'files'], queryFn: () => api.get<{ data: never[] }>('/files', { leadId: id }), enabled: !!id });
  const [editing, setEditing] = React.useState(false);
  const [converting, setConverting] = React.useState(false);
  const remove = useDeleteRecord('/leads', 'Lead', '/leads');
  if (isLoading) return <DetailSkeleton />;
  if (isError || !lead) return <EmptyState icon={Target} title="Lead not found" />;
  const name = fullName(lead);
  const invalidate = [['/leads'], ['dashboard']];
  return (
    <>
      <DetailHeader back={{ to: '/leads', label: 'Leads' }} title={name} avatar={<Avatar name={name} size="lg" />}
        subtitle={[lead.title, lead.companyName].filter(Boolean).join(' at ') || lead.email}
        badges={<><StatusBadge value={lead.status} /><ScoreBadge score={lead.score} /></>}
        actions={<EngagementActions related={{ leadId: lead.id }} email={lead.email} invalidate={invalidate}
          vars={{ first_name: lead.firstName, last_name: lead.lastName, full_name: name, title: lead.title, company_name: lead.companyName }}
          onEdit={() => setEditing(true)} onDelete={() => remove(lead.id, name)}
          extra={lead.convertedAt
            ? <Button size="sm" variant="success" onClick={() => navigate(`/contacts/${lead.convertedContactId}`)}><CheckCircle2 />View contact</Button>
            : <Button size="sm" onClick={() => setConverting(true)}><ArrowRightLeft />Convert</Button>} />} />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-5">
          <SideCard title="Lead score" icon={Sparkles}>
            <div className="flex items-end justify-between"><p className="text-3xl font-semibold tabular">{lead.score}</p><p className="text-xs text-muted-foreground">out of 100</p></div>
            <Progress value={lead.score} className="mt-2" tone={lead.score >= 70 ? 'destructive' : lead.score >= 40 ? 'warning' : 'primary'} />
            <ul className="mt-4 space-y-1.5 text-sm">
              {lead.scoreBreakdown.map((b) => <li key={b.label} className="flex justify-between gap-2"><span className="text-muted-foreground">{b.label}</span><span className="font-medium tabular">+{b.points}</span></li>)}
            </ul>
            {insights && <p className="mt-4 rounded-md bg-primary/5 p-3 text-sm"><Sparkles className="mr-1 inline size-3.5 text-primary" />{insights.suggestion}</p>}
          </SideCard>
          <SideCard title="Details" icon={Target}>
            <DetailList className="sm:grid-cols-1" items={[
              { label: 'Email', value: lead.email ? <a className="text-primary hover:underline" href={`mailto:${lead.email}`}>{lead.email}</a> : null },
              { label: 'Phone', value: lead.phone }, { label: 'Company size', value: lead.companySize },
              { label: 'Source', value: <StatusBadge value={lead.source} /> }, { label: 'Campaign', value: lead.campaign?.name },
              { label: 'Owner', value: <UserChip user={lead.owner} /> }, { label: 'Territory', value: lead.territory },
              { label: 'First response', value: lead.firstResponseAt ? ago(lead.firstResponseAt) : 'Not yet' }, { label: 'Created', value: day(lead.createdAt) },
            ]} />
            <CustomFieldList entityType="lead" values={lead.customFields} />
          </SideCard>
          <Attachments files={files?.data ?? []} related={{ leadId: lead.id }} invalidate={invalidate} />
        </div>
        <Card className="lg:col-span-2">
          <CardBody className="pt-4">
            <Tabs defaultValue="timeline">
              <TabsList><TabsTrigger value="timeline">Timeline</TabsTrigger><TabsTrigger value="tasks">Tasks</TabsTrigger></TabsList>
              <TabsContent value="timeline"><Timeline activities={activities?.data ?? []} invalidate={invalidate} /></TabsContent>
              <TabsContent value="tasks"><TaskList tasks={tasks?.data ?? []} invalidate={invalidate} related={{ leadId: lead.id }} /></TabsContent>
            </Tabs>
          </CardBody>
        </Card>
      </div>
      <EntityFormDialog kind="lead" open={editing} onOpenChange={setEditing} record={lead} />
      <ConvertDialog lead={lead} open={converting} onOpenChange={setConverting} />
    </>
  );
}

function ConvertDialog({ lead, open, onOpenChange }: { lead: Lead; open: boolean; onOpenChange: (o: boolean) => void }) {
  const navigate = useNavigate();
  const { data: pipelines = [] } = usePipelines();
  const { data: me } = useMe();
  const [form, setForm] = React.useState({ createDeal: true, dealTitle: '', value: '', pipelineId: '', stageId: '', expectedCloseDate: '' });
  React.useEffect(() => {
    if (open) setForm({ createDeal: true, dealTitle: `${lead.companyName ?? fullName(lead)} deal`, value: '', pipelineId: pipelines[0]?.id ?? '', stageId: pipelines[0]?.stages[0]?.id ?? '', expectedCloseDate: '' });
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const pipeline = pipelines.find((p) => p.id === form.pipelineId);
  const convert = useAction(() => api.post<{ contactId: string; dealId: string | null }>(`/leads/${lead.id}/convert`, {
    createDeal: form.createDeal, dealTitle: form.dealTitle, value: form.value || 0, pipelineId: form.pipelineId, stageId: form.stageId,
    expectedCloseDate: form.expectedCloseDate || undefined,
  }), {
    success: 'Lead converted', invalidate: [['/leads'], ['/contacts'], ['/deals'], ['/companies'], ['dashboard']],
    onSuccess: (r) => { onOpenChange(false); navigate(r.dealId ? `/deals/${r.dealId}` : `/contacts/${r.contactId}`); },
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Convert lead" description={`Creates a contact${lead.companyName ? `, links or creates "${lead.companyName}"` : ''} and optionally a deal. Activities, tasks and files move across.`}>
        <label className="flex items-center gap-2 text-sm font-medium"><Checkbox checked={form.createDeal} onCheckedChange={(c) => setForm({ ...form, createDeal: !!c })} />Also create a deal</label>
        {form.createDeal && (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Deal title" className="sm:col-span-2"><Input value={form.dealTitle} onChange={(e) => setForm({ ...form, dealTitle: e.target.value })} /></Field>
            <Field label={`Value (${me?.org.currency ?? 'USD'})`}><Input type="number" min={0} value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} placeholder={money(0)} /></Field>
            <Field label="Expected close"><Input type="date" value={form.expectedCloseDate} onChange={(e) => setForm({ ...form, expectedCloseDate: e.target.value })} /></Field>
            <Field label="Pipeline"><Select value={form.pipelineId} onChange={(e) => setForm({ ...form, pipelineId: e.target.value, stageId: pipelines.find((p) => p.id === e.target.value)?.stages[0]?.id ?? '' })}>{pipelines.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
            <Field label="Stage"><Select value={form.stageId} onChange={(e) => setForm({ ...form, stageId: e.target.value })}>{pipeline?.stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button loading={convert.isPending} onClick={() => convert.mutate(undefined)}><ArrowRightLeft />Convert</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
