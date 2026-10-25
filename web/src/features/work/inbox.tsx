import * as React from 'react';
import { Link } from 'react-router-dom';
import { FileText, Inbox, Mail, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { emailTemplateSchema, MERGE_TAGS, type Activity, type EmailTemplate } from '@crm/shared';
import { api } from '@/lib/api';
import { cn, dateTime, fullName } from '@/lib/utils';
import { useAction, useCan, useList, useTemplates } from '@/hooks/data';
import { Button } from '@/components/ui/button';
import { Badge, Card, EmptyState, PageHeader, Skeleton, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/display';
import { Input } from '@/components/ui/form';
import { confirm } from '@/components/ui/overlay';
import { EmailComposer } from '@/components/records/activity';
import { RecordFormDialog, toFormValues, type FieldDef } from '@/components/records/record-form';

export function InboxPage() {
  const [compose, setCompose] = React.useState(false);
  return (
    <>
      <PageHeader title="Inbox" description="Emails sent from Nexora, threaded onto contacts and deals. Delivery runs through a pluggable provider."
        actions={<Button onClick={() => setCompose(true)}><Mail />Compose</Button>} />
      <Tabs defaultValue="sent">
        <TabsList><TabsTrigger value="sent"><Inbox />Sent</TabsTrigger><TabsTrigger value="templates"><FileText />Templates</TabsTrigger></TabsList>
        <TabsContent value="sent"><SentEmails /></TabsContent>
        <TabsContent value="templates"><Templates /></TabsContent>
      </Tabs>
      <EmailComposer open={compose} onOpenChange={setCompose} related={{}} vars={{}} invalidate={[['/activities']]} />
    </>
  );
}

function SentEmails() {
  const [q, setQ] = React.useState('');
  const [debounced, setDebounced] = React.useState('');
  const [selected, setSelected] = React.useState<Activity | null>(null);
  React.useEffect(() => { const t = setTimeout(() => setDebounced(q), 250); return () => clearTimeout(t); }, [q]);
  const { data, isLoading } = useList<Activity>('/activities', { type: 'email', q: debounced, pageSize: 50 });
  const emails = data?.data ?? [];
  const current = selected ?? emails[0] ?? null;
  return (
    <Card className="grid min-h-[60vh] overflow-hidden md:grid-cols-[22rem_1fr]">
      <div className="border-b md:border-b-0 md:border-r">
        <div className="relative border-b p-2">
          <Search className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search emails" className="pl-8" aria-label="Search emails" />
        </div>
        {isLoading ? <div className="space-y-2 p-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
          : !emails.length ? <EmptyState icon={Mail} title="No emails yet" description="Emails you send from contacts, deals or here appear in this list." /> : (
            <ul className="max-h-[70vh] divide-y overflow-y-auto">
              {emails.map((e) => (
                <li key={e.id}>
                  <button onClick={() => setSelected(e)} className={cn('w-full px-3 py-2.5 text-left hover:bg-secondary', current?.id === e.id && 'bg-primary/5')}>
                    <p className="flex justify-between gap-2 text-sm"><span className="truncate font-medium">{e.emailTo}</span><span className="shrink-0 text-xs text-muted-foreground">{dateTime(e.createdAt).split(',')[0]}</span></p>
                    <p className="truncate text-sm">{e.subject}</p>
                    <p className="truncate text-xs text-muted-foreground">{e.body}</p>
                  </button>
                </li>
              ))}
            </ul>
          )}
      </div>
      <article className="p-5">
        {current ? (
          <>
            <h2 className="text-lg font-semibold">{current.subject}</h2>
            <p className="mt-1 text-sm text-muted-foreground">From {current.owner?.name} to {current.emailTo} · {dateTime(current.createdAt)}</p>
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              {current.contact && <Link to={`/contacts/${current.contact.id}`}><Badge variant="secondary">{fullName(current.contact)}</Badge></Link>}
              {current.deal && <Link to={`/deals/${current.deal.id}`}><Badge variant="secondary">{current.deal.title}</Badge></Link>}
            </div>
            <div className="mt-5 whitespace-pre-wrap border-t pt-5 text-sm leading-relaxed">{current.body}</div>
          </>
        ) : <p className="text-sm text-muted-foreground">Select an email.</p>}
      </article>
    </Card>
  );
}

const templateFields: FieldDef[] = [
  { name: 'name', label: 'Template name', type: 'text', required: true },
  { name: 'shared', label: 'Share with the whole team', type: 'checkbox' },
  { name: 'subject', label: 'Subject', type: 'text', required: true, span: 2 },
  { name: 'body', label: 'Body', type: 'textarea', required: true, hint: `Merge tags: ${MERGE_TAGS.map((m) => `{{${m.tag}}}`).join(' ')}` },
];

function Templates() {
  const { data: templates = [], isLoading } = useTemplates();
  const can = useCan();
  const [editing, setEditing] = React.useState<EmailTemplate | null | 'new'>(null);
  const save = useAction((v: Record<string, unknown>) => (editing && editing !== 'new' ? api.patch(`/templates/${editing.id}`, v) : api.post('/templates', v)), { success: 'Template saved', invalidate: [['templates']] });
  const remove = useAction((id: string) => api.del(`/templates/${id}`), { success: 'Template deleted', invalidate: [['templates']] });
  return (
    <>
      <div className="mb-3 flex justify-end"><Button onClick={() => setEditing('new')}><Plus />New template</Button></div>
      {isLoading ? <Skeleton className="h-40" /> : !templates.length ? (
        <Card><EmptyState icon={FileText} title="No templates yet" description="Save your best emails with merge tags like {{first_name}} and reuse them in one click." action={<Button onClick={() => setEditing('new')}><Plus />Create template</Button>} /></Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((t) => (
            <Card key={t.id} className="flex flex-col p-4">
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold">{t.name}</p>
                {t.shared && <Badge variant="secondary">Shared</Badge>}
              </div>
              <p className="mt-1 text-sm font-medium text-muted-foreground">{t.subject}</p>
              <p className="mt-2 line-clamp-4 flex-1 whitespace-pre-wrap text-sm text-muted-foreground">{t.body}</p>
              <div className="mt-3 flex gap-1">
                <Button size="sm" variant="ghost" onClick={() => setEditing(t)}><Pencil />Edit</Button>
                <Button size="sm" variant="ghost" className="text-destructive" onClick={async () => { if (await confirm({ title: `Delete "${t.name}"?`, destructive: true, confirmLabel: 'Delete' })) remove.mutate(t.id); }}><Trash2 />Delete</Button>
              </div>
            </Card>
          ))}
        </div>
      )}
      <RecordFormDialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)} title={editing && editing !== 'new' ? 'Edit template' : 'New template'}
        schema={emailTemplateSchema} fields={can('templates:manage') ? templateFields : templateFields.filter((f) => f.name !== 'shared')}
        defaultValues={toFormValues(templateFields, editing && editing !== 'new' ? editing : undefined, { shared: can('templates:manage') })}
        onSubmit={(v) => save.mutateAsync(v)} />
    </>
  );
}
