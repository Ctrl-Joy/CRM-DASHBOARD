import { useNavigate } from 'react-router-dom';
import { create } from 'zustand';
import {
  CAMPAIGN_CHANNELS, CAMPAIGN_STATUSES, campaignSchema, COMPANY_SIZES, companySchema, CONTACT_STATUSES, contactSchema, dealSchema,
  INDUSTRIES, LEAD_SOURCES, LEAD_STATUSES, leadSchema, LIFECYCLE_STAGES, productSchema, TICKET_CHANNELS, TICKET_PRIORITIES,
  TICKET_STATUSES, ticketSchema,
} from '@crm/shared';
import type { ZodTypeAny } from 'zod';
import { api } from '@/lib/api';
import { useAction, useMe } from '@/hooks/data';
import { RecordFormDialog, toFormValues, type FieldDef } from '@/components/records/record-form';
import { TaskDialog } from '@/components/records/activity';

export const contactFields: FieldDef[] = [
  { name: 'firstName', label: 'First name', type: 'text', required: true },
  { name: 'lastName', label: 'Last name', type: 'text' },
  { name: 'email', label: 'Email', type: 'email' },
  { name: 'phone', label: 'Phone', type: 'tel' },
  { name: 'title', label: 'Job title', type: 'text' },
  { name: 'companyId', label: 'Company', type: 'entity', entity: 'company', labelFrom: '_companyName' },
  { name: 'lifecycleStage', label: 'Lifecycle stage', type: 'select', options: LIFECYCLE_STAGES },
  { name: 'status', label: 'Status', type: 'select', options: CONTACT_STATUSES },
  { name: 'source', label: 'Source', type: 'select', options: LEAD_SOURCES, allowEmpty: '—' },
  { name: 'ownerId', label: 'Owner', type: 'user' },
  { name: 'tags', label: 'Tags', type: 'tags' },
];

export const companyFields: FieldDef[] = [
  { name: 'name', label: 'Company name', type: 'text', required: true },
  { name: 'domain', label: 'Website domain', type: 'text', placeholder: 'acme.com' },
  { name: 'industry', label: 'Industry', type: 'select', options: INDUSTRIES.map((i) => ({ value: i, label: i })), allowEmpty: '—' },
  { name: 'size', label: 'Employees', type: 'select', options: COMPANY_SIZES.map((s) => ({ value: s, label: s })), allowEmpty: '—' },
  { name: 'phone', label: 'Phone', type: 'tel' },
  { name: 'territory', label: 'Territory', type: 'text', placeholder: 'e.g. EMEA' },
  { name: 'ownerId', label: 'Owner', type: 'user' },
  { name: 'address', label: 'Address', type: 'textarea' },
  { name: 'tags', label: 'Tags', type: 'tags' },
];

export const leadFields: FieldDef[] = [
  { name: 'firstName', label: 'First name', type: 'text', required: true },
  { name: 'lastName', label: 'Last name', type: 'text' },
  { name: 'email', label: 'Email', type: 'email' },
  { name: 'phone', label: 'Phone', type: 'tel' },
  { name: 'companyName', label: 'Company', type: 'text' },
  { name: 'title', label: 'Job title', type: 'text' },
  { name: 'companySize', label: 'Company size', type: 'select', options: COMPANY_SIZES.map((s) => ({ value: s, label: s })), allowEmpty: '—' },
  { name: 'source', label: 'Source', type: 'select', options: LEAD_SOURCES },
  { name: 'status', label: 'Status', type: 'select', options: LEAD_STATUSES },
  { name: 'ownerId', label: 'Owner', type: 'user' },
  { name: 'territory', label: 'Territory', type: 'text' },
  { name: 'campaignId', label: 'Campaign', type: 'entity', entity: 'campaign', labelFrom: '_campaignName' },
];

export const dealFields: FieldDef[] = [
  { name: 'title', label: 'Deal title', type: 'text', required: true, span: 2 },
  { name: 'value', label: 'Value', type: 'number' },
  { name: 'currency', label: 'Currency', type: 'currency' },
  { name: 'pipelineStage', label: 'Stage', type: 'pipelineStage' },
  { name: 'contactId', label: 'Contact', type: 'entity', entity: 'contact', labelFrom: '_contactName' },
  { name: 'companyId', label: 'Company', type: 'entity', entity: 'company', labelFrom: '_companyName' },
  { name: 'ownerId', label: 'Owner', type: 'user' },
  { name: 'expectedCloseDate', label: 'Expected close', type: 'date' },
  { name: 'probability', label: 'Win probability %', type: 'number', hint: 'Leave blank to use the stage default' },
  { name: 'campaignId', label: 'Source campaign', type: 'entity', entity: 'campaign', labelFrom: '_campaignName' },
];

export const ticketFields: FieldDef[] = [
  { name: 'subject', label: 'Subject', type: 'text', required: true, span: 2 },
  { name: 'contactId', label: 'Contact', type: 'entity', entity: 'contact', labelFrom: '_contactName' },
  { name: 'assigneeId', label: 'Assignee', type: 'user' },
  { name: 'priority', label: 'Priority', type: 'select', options: TICKET_PRIORITIES },
  { name: 'status', label: 'Status', type: 'select', options: TICKET_STATUSES },
  { name: 'channel', label: 'Channel', type: 'select', options: TICKET_CHANNELS },
  { name: 'description', label: 'Description', type: 'textarea' },
];

export const productFields: FieldDef[] = [
  { name: 'name', label: 'Product name', type: 'text', required: true },
  { name: 'sku', label: 'SKU', type: 'text' },
  { name: 'price', label: 'Unit price', type: 'number', required: true },
  { name: 'active', label: 'Active', type: 'checkbox' },
  { name: 'description', label: 'Description', type: 'textarea' },
];

export const campaignFields: FieldDef[] = [
  { name: 'name', label: 'Campaign name', type: 'text', required: true, span: 2 },
  { name: 'channel', label: 'Channel', type: 'select', options: CAMPAIGN_CHANNELS },
  { name: 'status', label: 'Status', type: 'select', options: CAMPAIGN_STATUSES },
  { name: 'startDate', label: 'Start date', type: 'date' },
  { name: 'endDate', label: 'End date', type: 'date' },
  { name: 'budget', label: 'Budget', type: 'number' },
  { name: 'description', label: 'Description', type: 'textarea' },
];

export type Kind = 'contact' | 'company' | 'lead' | 'deal' | 'ticket' | 'product' | 'campaign';
export const FORMS: Record<Kind, { path: string; title: string; schema: ZodTypeAny; fields: FieldDef[]; customFields?: string; route?: string; defaults?: Record<string, unknown> }> = {
  contact: { path: '/contacts', title: 'contact', schema: contactSchema, fields: contactFields, customFields: 'contact', route: '/contacts', defaults: { lifecycleStage: 'lead', status: 'active', tags: [] } },
  company: { path: '/companies', title: 'company', schema: companySchema, fields: companyFields, customFields: 'company', route: '/companies', defaults: { tags: [] } },
  lead: { path: '/leads', title: 'lead', schema: leadSchema, fields: leadFields, customFields: 'lead', route: '/leads', defaults: { source: 'website', status: 'new' } },
  deal: { path: '/deals', title: 'deal', schema: dealSchema, fields: dealFields, customFields: 'deal', route: '/deals', defaults: { value: 0 } },
  ticket: { path: '/tickets', title: 'ticket', schema: ticketSchema, fields: ticketFields, customFields: 'ticket', route: '/tickets', defaults: { priority: 'normal', status: 'open', channel: 'email' } },
  product: { path: '/products', title: 'product', schema: productSchema, fields: productFields, defaults: { active: true } },
  campaign: { path: '/campaigns', title: 'campaign', schema: campaignSchema, fields: campaignFields, defaults: { channel: 'email', status: 'planned', budget: 0 } },
};

/** Create or edit any record type through its shared form config. */
export function EntityFormDialog({ kind, open, onOpenChange, record, defaults, onSaved }: {
  kind: Kind; open: boolean; onOpenChange: (o: boolean) => void; record?: Record<string, any>; defaults?: Record<string, unknown>;
  onSaved?: (saved: { id: string }) => void;
}) {
  const { data: me } = useMe();
  const cfg = FORMS[kind];
  const save = useAction((v: Record<string, unknown>) =>
    record ? api.patch<{ id: string }>(`${cfg.path}/${record.id}`, v) : api.post<{ id: string }>(cfg.path, v), {
    success: record ? 'Changes saved' : `${cfg.title[0].toUpperCase()}${cfg.title.slice(1)} created`,
    invalidate: [[cfg.path], ['dashboard'], ['picker']],
    onSuccess: (r) => onSaved?.(r),
  });
  const ownerDefault = cfg.fields.some((f) => f.name === 'ownerId') ? { ownerId: me?.id } : cfg.fields.some((f) => f.name === 'assigneeId') ? { assigneeId: me?.id } : {};
  const labels = record ? {
    _companyName: record.company?.name, _contactName: record.contact ? [record.contact.firstName, record.contact.lastName].filter(Boolean).join(' ') : undefined,
    _campaignName: record.campaign?.name,
  } : {};
  return (
    <RecordFormDialog open={open} onOpenChange={onOpenChange} title={`${record ? 'Edit' : 'New'} ${cfg.title}`}
      schema={record ? (cfg.schema as any).partial() : cfg.schema} fields={cfg.fields} customFieldEntity={cfg.customFields}
      defaultValues={toFormValues(cfg.fields, record, { ...cfg.defaults, ...ownerDefault, currency: me?.org.currency, ...labels, ...defaults })}
      onSubmit={(v) => save.mutateAsync(v)} submitLabel={record ? 'Save changes' : `Create ${cfg.title}`} />
  );
}

// ---------- global quick-create ----------
type QuickKind = Kind | 'task';
export const useQuickCreate = create<{ kind: QuickKind | null; defaults?: Record<string, unknown>; open: (k: QuickKind, d?: Record<string, unknown>) => void; close: () => void }>((set) => ({
  kind: null,
  open: (kind, defaults) => set({ kind, defaults }),
  close: () => set({ kind: null, defaults: undefined }),
}));

export function QuickCreateHost() {
  const { kind, defaults, close } = useQuickCreate();
  const navigate = useNavigate();
  if (kind === 'task') return <TaskDialog open onOpenChange={(o) => !o && close()} related={defaults as never} invalidate={[['/tasks'], ['dashboard'], ['calendar']]} />;
  if (!kind) return null;
  return (
    <EntityFormDialog kind={kind} open onOpenChange={(o) => !o && close()} defaults={defaults}
      onSaved={(r) => { const route = FORMS[kind].route; if (route) navigate(`${route}/${r.id}`); }} />
  );
}
