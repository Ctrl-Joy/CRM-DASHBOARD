import * as React from 'react';
import { Link, useParams } from 'react-router-dom';
import { Briefcase, Building2, Globe, LifeBuoy, Plus, Users } from 'lucide-react';
import { COMPANY_SIZES, INDUSTRIES, type Activity, type Attachment, type Company, type Contact, type Deal, type Task, type Ticket } from '@crm/shared';
import { useRecord } from '@/hooks/data';
import { day, fullName, money } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Avatar, Card, CardBody, DetailList, EmptyState, PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/display';
import { ListPage, type Column } from '@/components/data/list-page';
import { Attachments, Timeline } from '@/components/records/activity';
import { RiskFlag, StatusBadge, TagChips } from '@/components/records/badges';
import { UserChip } from '@/components/records/pickers';
import { CustomFieldList, DetailHeader, DetailSkeleton, EngagementActions, SideCard, TaskList, useDeleteRecord } from '@/components/records/detail';
import { EntityFormDialog, useQuickCreate } from '@/features/forms';

const columns: Column<Company>[] = [
  { key: 'name', header: 'Company', sortKey: 'name', cell: (c) => <span className="flex items-center gap-2.5"><Avatar name={c.name} size="sm" />{c.name}</span> },
  { key: 'industry', header: 'Industry', sortKey: 'industry', cell: (c) => c.industry ?? '—', hideBelow: 'sm' },
  { key: 'size', header: 'Size', sortKey: 'size', cell: (c) => c.size ?? '—', hideBelow: 'md' },
  { key: 'contacts', header: 'Contacts', cell: (c) => c._count?.contacts ?? 0, className: 'tabular', hideBelow: 'md' },
  { key: 'deals', header: 'Deals', cell: (c) => c._count?.deals ?? 0, className: 'tabular', hideBelow: 'md' },
  { key: 'owner', header: 'Owner', cell: (c) => <UserChip user={c.owner} />, hideBelow: 'lg' },
  { key: 'tags', header: 'Tags', cell: (c) => <TagChips tags={c.tags} />, hideBelow: 'lg' },
  { key: 'createdAt', header: 'Created', sortKey: 'createdAt', cell: (c) => day(c.createdAt), hideBelow: 'lg' },
];

export function CompaniesPage() {
  const quick = useQuickCreate((s) => s.open);
  return (
    <>
      <PageHeader title="Companies" description="Accounts you sell to and support." actions={<Button onClick={() => quick('company')}><Plus />New company</Button>} />
      <ListPage<Company>
        entityType="company" path="/companies" columns={columns} rowLink={(c) => `/companies/${c.id}`} tags
        filters={[
          { key: 'industry', label: 'Industry', type: 'select', options: INDUSTRIES.map((i) => ({ value: i, label: i })) },
          { key: 'size', label: 'Size', type: 'select', options: COMPANY_SIZES.map((s) => ({ value: s, label: s })) },
          { key: 'ownerId', label: 'Owner', type: 'user' },
        ]}
        importable={{ columns: 'Name, Domain, Industry, Size, Phone, Address, Territory, Tags' }}
        empty={{ icon: Building2, title: 'No companies yet', description: 'Companies are created automatically when you convert leads, or add them here.', action: <Button onClick={() => quick('company')}><Plus />Add company</Button> }}
      />
    </>
  );
}

interface Overview { company: Company; contacts: Contact[]; deals: Deal[]; activities: Activity[]; tasks: Task[]; tickets: Ticket[]; attachments: Attachment[] }

export function CompanyDetailPage() {
  const { id } = useParams();
  const { data, isLoading, isError } = useRecord<Overview>('/companies', id, '/overview');
  const [editing, setEditing] = React.useState(false);
  const quick = useQuickCreate((s) => s.open);
  const remove = useDeleteRecord('/companies', 'Company', '/companies');
  if (isLoading) return <DetailSkeleton />;
  if (isError || !data) return <EmptyState icon={Building2} title="Company not found" />;
  const { company: c, contacts, deals, activities, tasks, tickets, attachments } = data;
  const invalidate = [['/companies'], ['dashboard']];
  const open = deals.filter((d) => d.status === 'open');
  const won = deals.filter((d) => d.status === 'won');
  return (
    <>
      <DetailHeader back={{ to: '/companies', label: 'Companies' }} title={c.name} avatar={<Avatar name={c.name} size="lg" />}
        subtitle={[c.industry, c.size && `${c.size} employees`, c.territory].filter(Boolean).join(' · ')}
        actions={<EngagementActions related={{ companyId: c.id }} vars={{ company_name: c.name }} invalidate={invalidate} onEdit={() => setEditing(true)} onDelete={() => remove(c.id, c.name)}
          extra={<Button size="sm" onClick={() => quick('deal', { companyId: c.id, _companyName: c.name, title: `${c.name} deal` })}><Plus />Deal</Button>} />} />
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[['Open pipeline', money(open.reduce((s, d) => s + d.value, 0))], ['Won revenue', money(won.reduce((s, d) => s + d.value, 0))], ['Contacts', contacts.length], ['Open tickets', tickets.filter((t) => ['open', 'pending'].includes(t.status)).length]].map(([l, v]) => (
          <Card key={l as string} className="p-4"><p className="text-xs text-muted-foreground">{l}</p><p className="mt-1 text-xl font-semibold tabular">{v}</p></Card>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-5">
          <SideCard title="About" icon={Building2}>
            <DetailList className="sm:grid-cols-1" items={[
              { label: 'Website', value: c.domain ? <a href={`https://${c.domain.replace(/^https?:\/\//, '')}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline"><Globe className="size-3" />{c.domain}</a> : null },
              { label: 'Phone', value: c.phone }, { label: 'Address', value: c.address }, { label: 'Owner', value: <UserChip user={c.owner} /> },
              { label: 'Created', value: day(c.createdAt) },
            ]} />
            {c.tags.length > 0 && <div className="mt-4 border-t pt-4"><TagChips tags={c.tags} /></div>}
            <CustomFieldList entityType="company" values={c.customFields} />
          </SideCard>
          <SideCard title={`People (${contacts.length})`} icon={Users} action={<Button size="sm" variant="ghost" onClick={() => quick('contact', { companyId: c.id, _companyName: c.name })}><Plus />Add</Button>}>
            {contacts.length === 0 ? <p className="text-sm text-muted-foreground">No contacts yet.</p> : (
              <ul className="space-y-2">{contacts.map((p) => (
                <li key={p.id}><Link to={`/contacts/${p.id}`} className="flex items-center gap-2 text-sm hover:underline"><Avatar name={fullName(p)} size="sm" /><span className="min-w-0"><span className="block truncate font-medium">{fullName(p)}</span><span className="block truncate text-xs text-muted-foreground">{p.title ?? p.email}</span></span></Link></li>
              ))}</ul>
            )}
          </SideCard>
          <Attachments files={attachments} related={{ companyId: c.id }} invalidate={invalidate} />
        </div>
        <Card className="lg:col-span-2">
          <CardBody className="pt-4">
            <Tabs defaultValue="deals">
              <TabsList>
                <TabsTrigger value="deals">Deals ({deals.length})</TabsTrigger>
                <TabsTrigger value="timeline">Timeline ({activities.length})</TabsTrigger>
                <TabsTrigger value="tasks">Tasks ({tasks.length})</TabsTrigger>
                <TabsTrigger value="tickets">Tickets ({tickets.length})</TabsTrigger>
              </TabsList>
              <TabsContent value="deals">
                {deals.length === 0 ? <EmptyState icon={Briefcase} title="No deals yet" className="py-6" /> : (
                  <ul className="divide-y">{deals.map((d) => (
                    <li key={d.id} className="flex items-center gap-3 py-2.5 text-sm">
                      <Link to={`/deals/${d.id}`} className="min-w-0 flex-1 truncate font-medium hover:underline">{d.title}</Link>
                      <RiskFlag risk={d.risk} />
                      {d.status === 'open' ? <span className="text-xs text-muted-foreground">{d.stage?.name}</span> : <StatusBadge value={d.status} />}
                      <span className="hidden sm:block"><UserChip user={d.owner} /></span>
                      <span className="w-24 text-right font-medium tabular">{money(d.value, d.currency)}</span>
                    </li>
                  ))}</ul>
                )}
              </TabsContent>
              <TabsContent value="timeline"><Timeline activities={activities} invalidate={invalidate} /></TabsContent>
              <TabsContent value="tasks"><TaskList tasks={tasks} invalidate={invalidate} related={{ companyId: c.id }} /></TabsContent>
              <TabsContent value="tickets">
                {tickets.length === 0 ? <EmptyState icon={LifeBuoy} title="No tickets" className="py-6" /> : (
                  <ul className="divide-y">{tickets.map((t) => (
                    <li key={t.id} className="flex items-center gap-3 py-2.5 text-sm"><span className="text-muted-foreground">#{t.number}</span>
                      <Link to={`/tickets/${t.id}`} className="min-w-0 flex-1 truncate font-medium hover:underline">{t.subject}</Link><StatusBadge value={t.status} /></li>
                  ))}</ul>
                )}
              </TabsContent>
            </Tabs>
          </CardBody>
        </Card>
      </div>
      <EntityFormDialog kind="company" open={editing} onOpenChange={setEditing} record={c} />
    </>
  );
}
