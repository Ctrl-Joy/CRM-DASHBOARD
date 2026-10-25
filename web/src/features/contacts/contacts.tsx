import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Copy, Merge, Plus, Users } from 'lucide-react';
import { CONTACT_STATUSES, LEAD_SOURCES, LIFECYCLE_STAGES, type Contact } from '@crm/shared';
import { api } from '@/lib/api';
import { ago, day, fullName } from '@/lib/utils';
import { useAction } from '@/hooks/data';
import { Button } from '@/components/ui/button';
import { Avatar, EmptyState, PageHeader } from '@/components/ui/display';
import { Dialog, DialogContent } from '@/components/ui/overlay';
import { ListPage, type Column } from '@/components/data/list-page';
import { TagChips } from '@/components/records/badges';
import { UserChip } from '@/components/records/pickers';
import { useQuickCreate } from '@/features/forms';

const columns: Column<Contact>[] = [
  {
    key: 'name', header: 'Name', sortKey: 'firstName',
    cell: (c) => (
      <span className="flex items-center gap-2.5">
        <Avatar name={fullName(c)} size="sm" />
        <span className="min-w-0"><span className="block truncate">{fullName(c)}</span>{c.title && <span className="block truncate text-xs font-normal text-muted-foreground">{c.title}</span>}</span>
      </span>
    ),
  },
  { key: 'company', header: 'Company', sortKey: 'company.name', cell: (c) => c.company?.name ?? <span className="text-muted-foreground">—</span>, hideBelow: 'sm' },
  { key: 'email', header: 'Email', sortKey: 'email', cell: (c) => (c.email ? <a href={`mailto:${c.email}`} className="hover:underline">{c.email}</a> : '—'), hideBelow: 'md' },
  { key: 'lifecycle', header: 'Lifecycle', sortKey: 'lifecycleStage', cell: (c) => c.lifecycleStage, edit: { field: 'lifecycleStage', options: LIFECYCLE_STAGES, value: (c) => c.lifecycleStage } },
  { key: 'owner', header: 'Owner', cell: (c) => <UserChip user={c.owner} />, hideBelow: 'lg' },
  { key: 'tags', header: 'Tags', cell: (c) => <TagChips tags={c.tags} />, hideBelow: 'lg' },
  { key: 'lastContactedAt', header: 'Last contacted', sortKey: 'lastContactedAt', cell: (c) => (c.lastContactedAt ? ago(c.lastContactedAt) : <span className="text-muted-foreground">Never</span>), hideBelow: 'md' },
  { key: 'createdAt', header: 'Created', sortKey: 'createdAt', cell: (c) => day(c.createdAt), hideBelow: 'lg' },
];

export function ContactsPage() {
  const quick = useQuickCreate((s) => s.open);
  const [dupes, setDupes] = React.useState(false);
  return (
    <>
      <PageHeader title="Contacts" description="Everyone you do business with." actions={
        <><Button variant="outline" onClick={() => setDupes(true)}><Copy />Find duplicates</Button><Button onClick={() => quick('contact')}><Plus />New contact</Button></>
      } />
      <ListPage<Contact>
        entityType="contact" path="/contacts" columns={columns} rowLink={(c) => `/contacts/${c.id}`} tags
        filters={[
          { key: 'lifecycleStage', label: 'Lifecycle stage', type: 'select', options: LIFECYCLE_STAGES },
          { key: 'status', label: 'Status', type: 'select', options: CONTACT_STATUSES },
          { key: 'source', label: 'Source', type: 'select', options: LEAD_SOURCES },
          { key: 'ownerId', label: 'Owner', type: 'user' },
          { key: 'created', label: 'Created', type: 'date', field: 'createdAt' },
        ]}
        bulkStatus={{ label: 'Lifecycle stage', options: LIFECYCLE_STAGES }}
        importable={{ columns: 'First name, Last name, Email, Phone, Title, Company, Source, Lifecycle stage, Tags (separate with ;)' }}
        empty={{ icon: Users, title: 'No contacts yet', description: 'Add people manually, import a CSV, or convert qualified leads.', action: <Button onClick={() => quick('contact')}><Plus />Add contact</Button> }}
      />
      <DuplicatesDialog open={dupes} onOpenChange={setDupes} />
    </>
  );
}

type DupGroup = { reason: string; contacts: { id: string; firstName: string; lastName: string | null; email: string | null; phone: string | null; createdAt: string; company: { name: string } | null }[] };

function DuplicatesDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { data, isLoading } = useQuery({ queryKey: ['/contacts', 'duplicates'], queryFn: () => api.get<{ data: DupGroup[] }>('/contacts/duplicates'), enabled: open });
  const merge = useAction((v: { primaryId: string; duplicateId: string }) => api.post('/contacts/merge', v), { success: 'Contacts merged', invalidate: [['/contacts']] });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Possible duplicates" description="Merging keeps the first record and moves deals, activities, tasks, tickets, files and tags onto it." size="lg">
        {isLoading ? <p className="text-sm text-muted-foreground">Scanning…</p> : !data?.data.length ? (
          <EmptyState icon={Copy} title="No duplicates found" description="We compare email addresses and full names." className="py-8" />
        ) : (
          <ul className="space-y-3">
            {data.data.map((g, i) => {
              const [primary, ...rest] = [...g.contacts].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
              return (
                <li key={i} className="rounded-lg border p-3">
                  <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">{g.reason}</p>
                  <p className="text-sm"><b>Keep:</b> {fullName(primary)} · {primary.email ?? 'no email'} · {primary.company?.name ?? 'no company'}</p>
                  {rest.map((d) => (
                    <div key={d.id} className="mt-2 flex items-center justify-between gap-2 text-sm">
                      <span className="truncate text-muted-foreground">{fullName(d)} · {d.email ?? 'no email'} · added {day(d.createdAt)}</span>
                      <Button size="sm" variant="outline" loading={merge.isPending} onClick={() => merge.mutate({ primaryId: primary.id, duplicateId: d.id })}><Merge />Merge</Button>
                    </div>
                  ))}
                </li>
              );
            })}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
