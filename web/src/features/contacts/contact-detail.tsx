import * as React from 'react';
import { Link, useParams } from 'react-router-dom';
import { Briefcase, Building2, LifeBuoy, Mail, Plus, UserRound } from 'lucide-react';
import type { Activity, Attachment, Contact, Deal, Task, Ticket } from '@crm/shared';
import { useRecord } from '@/hooks/data';
import { ago, day, fullName, money } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Avatar, Card, CardBody, DetailList, EmptyState, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/display';
import { AISummary, Attachments, Timeline } from '@/components/records/activity';
import { RiskFlag, StatusBadge, TagChips } from '@/components/records/badges';
import { UserChip } from '@/components/records/pickers';
import { CustomFieldList, DetailHeader, DetailSkeleton, EngagementActions, SideCard, TaskList, useDeleteRecord } from '@/components/records/detail';
import { EntityFormDialog, useQuickCreate } from '@/features/forms';

interface Overview { contact: Contact; deals: Deal[]; activities: Activity[]; tasks: Task[]; tickets: Ticket[]; attachments: Attachment[]; summary: string }

export function ContactDetailPage() {
  const { id } = useParams();
  const { data, isLoading, isError } = useRecord<Overview>('/contacts', id, '/overview');
  const [editing, setEditing] = React.useState(false);
  const quick = useQuickCreate((s) => s.open);
  const remove = useDeleteRecord('/contacts', 'Contact', '/contacts');
  if (isLoading) return <DetailSkeleton />;
  if (isError || !data) return <EmptyState icon={UserRound} title="Contact not found" description="It may have been deleted or you don't have access." />;
  const { contact: c, deals, activities, tasks, tickets, attachments, summary } = data;
  const name = fullName(c);
  const invalidate = [['/contacts'], ['dashboard']];
  const related = { contactId: c.id, companyId: c.companyId };
  const emails = activities.filter((a) => a.type === 'email');
  const openDeals = deals.filter((d) => d.status === 'open');

  return (
    <>
      <DetailHeader back={{ to: '/contacts', label: 'Contacts' }} title={name}
        subtitle={[c.title, c.company?.name].filter(Boolean).join(' at ') || c.email}
        avatar={<Avatar name={name} size="lg" />}
        badges={<><StatusBadge value={c.lifecycleStage} />{c.status === 'inactive' && <StatusBadge value="inactive" />}</>}
        actions={<EngagementActions related={related} email={c.email} invalidate={invalidate}
          vars={{ first_name: c.firstName, last_name: c.lastName, full_name: name, title: c.title, company_name: c.company?.name }}
          onEdit={() => setEditing(true)} onDelete={() => remove(c.id, name)} />} />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-5">
          <SideCard title="About" icon={UserRound}>
            <DetailList className="sm:grid-cols-1" items={[
              { label: 'Email', value: c.email ? <a href={`mailto:${c.email}`} className="text-primary hover:underline">{c.email}</a> : null },
              { label: 'Phone', value: c.phone ? <a href={`tel:${c.phone}`} className="hover:underline">{c.phone}</a> : null },
              { label: 'Owner', value: <UserChip user={c.owner} /> },
              { label: 'Source', value: c.source ? <StatusBadge value={c.source} /> : null },
              { label: 'Last contacted', value: c.lastContactedAt ? ago(c.lastContactedAt) : 'Never' },
              { label: 'Created', value: day(c.createdAt) },
            ]} />
            {c.tags.length > 0 && <div className="mt-4 border-t pt-4"><TagChips tags={c.tags} /></div>}
            <CustomFieldList entityType="contact" values={c.customFields} />
          </SideCard>
          <SideCard title="Company" icon={Building2}>
            {c.company ? <Link to={`/companies/${c.company.id}`} className="flex items-center gap-2 font-medium hover:underline"><Avatar name={c.company.name} size="sm" />{c.company.name}</Link>
              : <p className="text-sm text-muted-foreground">Not linked to a company. <button className="text-primary hover:underline" onClick={() => setEditing(true)}>Link one</button></p>}
          </SideCard>
          <Attachments files={attachments} related={{ contactId: c.id }} invalidate={invalidate} />
        </div>

        <div className="space-y-5 lg:col-span-2">
          <AISummary text={summary} />
          <Card>
            <CardBody className="pt-4">
              <Tabs defaultValue="timeline">
                <TabsList>
                  <TabsTrigger value="timeline">Timeline ({activities.length})</TabsTrigger>
                  <TabsTrigger value="deals">Deals ({deals.length})</TabsTrigger>
                  <TabsTrigger value="tasks">Tasks ({tasks.filter((t) => t.status !== 'done').length})</TabsTrigger>
                  <TabsTrigger value="emails">Emails ({emails.length})</TabsTrigger>
                  <TabsTrigger value="tickets">Tickets ({tickets.length})</TabsTrigger>
                </TabsList>
                <TabsContent value="timeline"><Timeline activities={activities} invalidate={invalidate} /></TabsContent>
                <TabsContent value="deals">
                  <div className="mb-3 flex justify-between text-sm">
                    <span className="text-muted-foreground">{openDeals.length} open · {money(openDeals.reduce((s, d) => s + d.value, 0))}</span>
                    <Button size="sm" variant="outline" onClick={() => quick('deal', { contactId: c.id, companyId: c.companyId, title: `${c.company?.name ?? name} deal`, _contactName: name, _companyName: c.company?.name })}><Plus />New deal</Button>
                  </div>
                  {deals.length === 0 ? <EmptyState icon={Briefcase} title="No deals yet" className="py-6" /> : (
                    <ul className="divide-y">
                      {deals.map((d) => (
                        <li key={d.id} className="flex items-center gap-3 py-2.5 text-sm">
                          <Link to={`/deals/${d.id}`} className="min-w-0 flex-1 truncate font-medium hover:underline">{d.title}</Link>
                          <RiskFlag risk={d.risk} />
                          {d.status === 'open' ? <span className="text-xs text-muted-foreground">{d.stage?.name}</span> : <StatusBadge value={d.status} />}
                          <span className="w-24 text-right font-medium tabular">{money(d.value, d.currency)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </TabsContent>
                <TabsContent value="tasks"><TaskList tasks={tasks} invalidate={invalidate} related={related} /></TabsContent>
                <TabsContent value="emails">
                  {emails.length ? <Timeline activities={emails} invalidate={invalidate} /> : <EmptyState icon={Mail} title="No emails yet" description="Emails you send from Nexora are threaded here." className="py-6" />}
                </TabsContent>
                <TabsContent value="tickets">
                  <div className="mb-3 flex justify-end"><Button size="sm" variant="outline" onClick={() => quick('ticket', { contactId: c.id, _contactName: name })}><Plus />New ticket</Button></div>
                  {tickets.length === 0 ? <EmptyState icon={LifeBuoy} title="No support tickets" className="py-6" /> : (
                    <ul className="divide-y">
                      {tickets.map((t) => (
                        <li key={t.id} className="flex items-center gap-3 py-2.5 text-sm">
                          <span className="text-muted-foreground tabular">#{t.number}</span>
                          <Link to={`/tickets/${t.id}`} className="min-w-0 flex-1 truncate font-medium hover:underline">{t.subject}</Link>
                          <StatusBadge value={t.priority} /><StatusBadge value={t.status} />
                        </li>
                      ))}
                    </ul>
                  )}
                </TabsContent>
              </Tabs>
            </CardBody>
          </Card>
        </div>
      </div>
      <EntityFormDialog kind="contact" open={editing} onOpenChange={setEditing} record={c} />
    </>
  );
}
