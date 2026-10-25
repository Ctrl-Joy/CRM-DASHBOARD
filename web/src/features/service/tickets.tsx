import * as React from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { formatDistanceToNowStrict } from 'date-fns';
import { Clock, Headphones, LifeBuoy, Plus } from 'lucide-react';
import { TICKET_CHANNELS, TICKET_PRIORITIES, TICKET_STATUSES, labelize, type Activity, type Paginated, type Task, type Ticket } from '@crm/shared';
import { api } from '@/lib/api';
import { cn, dateTime, fullName } from '@/lib/utils';
import { useAction, useRecord } from '@/hooks/data';
import { Button } from '@/components/ui/button';
import { Card, CardBody, DetailList, EmptyState, PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/display';
import { Field, Select } from '@/components/ui/form';
import { ListPage, type Column } from '@/components/data/list-page';
import { Attachments, Timeline } from '@/components/records/activity';
import { StatusBadge } from '@/components/records/badges';
import { UserChip, UserSelect } from '@/components/records/pickers';
import { CustomFieldList, DetailHeader, DetailSkeleton, EngagementActions, SideCard, TaskList, useDeleteRecord } from '@/components/records/detail';
import { EntityFormDialog, useQuickCreate } from '@/features/forms';

/** Live SLA countdown; red once breached, amber within 2 hours. */
export function SlaTimer({ ticket }: { ticket: Pick<Ticket, 'slaDueAt' | 'status' | 'resolvedAt'> }) {
  const [, tick] = React.useReducer((x: number) => x + 1, 0);
  React.useEffect(() => { const t = setInterval(tick, 30_000); return () => clearInterval(t); }, []);
  if (ticket.status === 'resolved' || ticket.status === 'closed') {
    const met = ticket.resolvedAt && new Date(ticket.resolvedAt) <= new Date(ticket.slaDueAt);
    return <span className={cn('text-xs font-medium', met ? 'text-success' : 'text-muted-foreground')}>{met ? 'SLA met' : 'Resolved late'}</span>;
  }
  const due = new Date(ticket.slaDueAt);
  const ms = due.getTime() - Date.now();
  const tone = ms < 0 ? 'text-destructive' : ms < 2 * 3600e3 ? 'text-warning' : 'text-muted-foreground';
  return (
    <span className={cn('inline-flex items-center gap-1 text-xs font-medium tabular', tone)} title={`SLA due ${dateTime(due)}`}>
      <Clock className="size-3" aria-hidden />{ms < 0 ? `Breached ${formatDistanceToNowStrict(due)} ago` : `${formatDistanceToNowStrict(due)} left`}
    </span>
  );
}

const columns: Column<Ticket>[] = [
  { key: 'subject', header: 'Ticket', sortKey: 'number', cell: (t) => <span><span className="mr-1.5 text-muted-foreground tabular">#{t.number}</span>{t.subject}</span> },
  { key: 'contact', header: 'Customer', cell: (t) => (t.contact ? fullName(t.contact) : '—'), hideBelow: 'md' },
  { key: 'priority', header: 'Priority', sortKey: 'priority', cell: (t) => t.priority, edit: { field: 'priority', options: TICKET_PRIORITIES, value: (t) => t.priority } },
  { key: 'status', header: 'Status', sortKey: 'status', cell: (t) => t.status, edit: { field: 'status', options: TICKET_STATUSES, value: (t) => t.status } },
  { key: 'sla', header: 'SLA', sortKey: 'slaDueAt', cell: (t) => <SlaTimer ticket={t} /> },
  { key: 'assignee', header: 'Assignee', cell: (t) => <UserChip user={t.assignee} />, hideBelow: 'lg' },
];

export function TicketsPage() {
  const quick = useQuickCreate((s) => s.open);
  return (
    <>
      <PageHeader title="Tickets" description="Customer support queue, sorted by SLA." actions={<Button onClick={() => quick('ticket')}><Plus />New ticket</Button>} />
      <ListPage<Ticket>
        entityType="ticket" path="/tickets" columns={columns} rowLink={(t) => `/tickets/${t.id}`}
        filters={[
          { key: 'status', label: 'Status', type: 'select', options: TICKET_STATUSES },
          { key: 'priority', label: 'Priority', type: 'select', options: TICKET_PRIORITIES },
          { key: 'channel', label: 'Channel', type: 'select', options: TICKET_CHANNELS },
          { key: 'assigneeId', label: 'Assignee', type: 'user' },
        ]}
        bulkStatus={{ label: 'Status', options: TICKET_STATUSES }}
        empty={{ icon: Headphones, title: 'No tickets', description: 'Support requests you log appear here with an SLA timer based on priority.', action: <Button onClick={() => quick('ticket')}><Plus />New ticket</Button> }}
      />
    </>
  );
}

export function TicketDetailPage() {
  const { id } = useParams();
  const { data: t, isLoading, isError } = useRecord<Ticket>('/tickets', id);
  const { data: activities } = useQuery({ queryKey: ['/tickets', id, 'activities'], queryFn: () => api.get<Paginated<Activity>>('/activities', { ticketId: id, pageSize: 100 }), enabled: !!id });
  const { data: tasks } = useQuery({ queryKey: ['/tickets', id, 'tasks'], queryFn: () => api.get<Paginated<Task>>('/tasks', { ticketId: id, pageSize: 100 }), enabled: !!id });
  const { data: files } = useQuery({ queryKey: ['/tickets', id, 'files'], queryFn: () => api.get<{ data: never[] }>('/files', { ticketId: id }), enabled: !!id });
  const [editing, setEditing] = React.useState(false);
  const remove = useDeleteRecord('/tickets', 'Ticket', '/tickets');
  const invalidate = [['/tickets'], ['dashboard']];
  const update = useAction((v: Record<string, unknown>) => api.patch(`/tickets/${id}`, v), { success: 'Ticket updated', invalidate });
  if (isLoading) return <DetailSkeleton />;
  if (isError || !t) return <EmptyState icon={LifeBuoy} title="Ticket not found" />;
  return (
    <>
      <DetailHeader back={{ to: '/tickets', label: 'Tickets' }} title={<><span className="text-muted-foreground">#{t.number}</span> {t.subject}</>}
        subtitle={<>{labelize(t.channel)} · opened {dateTime(t.createdAt)}</>}
        badges={<><StatusBadge value={t.priority} /><StatusBadge value={t.status} /></>}
        actions={<EngagementActions related={{ ticketId: t.id, contactId: t.contactId, companyId: t.companyId }} email={t.contact?.email} invalidate={invalidate}
          vars={{ first_name: t.contact?.firstName, last_name: t.contact?.lastName, full_name: t.contact ? fullName(t.contact) : '' }}
          onEdit={() => setEditing(true)} onDelete={() => remove(t.id, `#${t.number}`)} />} />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-5">
          <SideCard title="Status" icon={Clock}>
            <div className="mb-4 rounded-lg bg-muted/50 p-3"><p className="text-xs text-muted-foreground">SLA</p><SlaTimer ticket={t} /></div>
            <div className="space-y-3">
              <Field label="Status"><Select value={t.status} onChange={(e) => update.mutate({ status: e.target.value })}>{TICKET_STATUSES.map((s) => <option key={s} value={s}>{labelize(s)}</option>)}</Select></Field>
              <Field label="Priority" hint="Changing priority recalculates the SLA"><Select value={t.priority} onChange={(e) => update.mutate({ priority: e.target.value })}>{TICKET_PRIORITIES.map((s) => <option key={s} value={s}>{labelize(s)}</option>)}</Select></Field>
              <Field label="Assignee"><UserSelect value={t.assigneeId} onChange={(v) => update.mutate({ assigneeId: v })} allowEmpty="Unassigned" /></Field>
            </div>
          </SideCard>
          <SideCard title="Customer" icon={Headphones}>
            <DetailList className="sm:grid-cols-1" items={[
              { label: 'Contact', value: t.contact ? <Link className="text-primary hover:underline" to={`/contacts/${t.contact.id}`}>{fullName(t.contact)}</Link> : null },
              { label: 'Email', value: t.contact?.email }, { label: 'Company', value: t.company ? <Link className="hover:underline" to={`/companies/${t.company.id}`}>{t.company.name}</Link> : null },
              { label: 'First response', value: t.firstResponseAt ? dateTime(t.firstResponseAt) : 'Not yet' }, { label: 'Resolved', value: t.resolvedAt ? dateTime(t.resolvedAt) : '—' },
            ]} />
            <CustomFieldList entityType="ticket" values={t.customFields} />
          </SideCard>
          <Attachments files={files?.data ?? []} related={{ ticketId: t.id }} invalidate={[['/tickets', id, 'files']]} />
        </div>
        <Card className="lg:col-span-2">
          <CardBody className="pt-4">
            {t.description && <div className="mb-5 rounded-lg border bg-muted/30 p-4 text-sm"><p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Description</p><p className="whitespace-pre-wrap">{t.description}</p></div>}
            <Tabs defaultValue="conversation">
              <TabsList><TabsTrigger value="conversation">Conversation</TabsTrigger><TabsTrigger value="tasks">Tasks</TabsTrigger></TabsList>
              <TabsContent value="conversation"><Timeline activities={activities?.data ?? []} invalidate={[['/tickets', id, 'activities'], ...invalidate]} /></TabsContent>
              <TabsContent value="tasks"><TaskList tasks={tasks?.data ?? []} invalidate={[['/tickets', id, 'tasks']]} related={{ ticketId: t.id }} /></TabsContent>
            </Tabs>
          </CardBody>
        </Card>
      </div>
      <EntityFormDialog kind="ticket" open={editing} onOpenChange={setEditing} record={t} />
    </>
  );
}
