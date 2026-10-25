import { z } from 'zod';
import * as C from './constants';
import { ALL_PERMISSIONS, type Permission } from './permissions';

// ---------- field helpers ----------
// Blank form values become null so "clear this field" works. Inside .partial()
// update schemas a missing key stays undefined, so it isn't overwritten.
const blank = (v: unknown) => (v === '' || v === undefined ? null : v);
export const zStr = (max = 255) => z.preprocess(blank, z.string().trim().max(max).nullable());
export const zReq = (label: string, max = 255) =>
  z.string({ required_error: `${label} is required` }).trim().min(1, `${label} is required`).max(max);
export const zEmail = z.preprocess(blank, z.string().trim().toLowerCase().email('Enter a valid email').max(254).nullable());
export const zId = z.preprocess(blank, z.string().min(1).nullable());
export const zDate = z.preprocess(blank, z.coerce.date().nullable());
export const zMoney = z.coerce.number({ invalid_type_error: 'Enter a number' }).min(0, 'Must be 0 or more').max(1e12);
export const zPct = z.coerce.number().int().min(0).max(100);
const zEnum = <T extends readonly [string, ...string[]]>(values: T) => z.preprocess(blank, z.enum(values).nullable());
export const zTags = z.array(z.string().trim().min(1).max(40)).max(30).default([]);
export const zCustomFields = z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).default({});

// ---------- auth ----------
export const signupSchema = z.object({
  name: zReq('Name', 100),
  email: z.string().trim().toLowerCase().email('Enter a valid email'),
  password: z.string().min(8, 'Use at least 8 characters').max(200),
  company: zReq('Company', 120),
});
export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
});
export const profileSchema = z.object({ name: zReq('Name', 100), email: z.string().trim().toLowerCase().email(), avatarUrl: zStr(500) });
export const changePasswordSchema = z.object({ current: z.string().min(1), next: z.string().min(8, 'Use at least 8 characters').max(200) });

// ---------- CRM records ----------
export const companySchema = z.object({
  name: zReq('Company name'),
  domain: zStr(),
  industry: zStr(60),
  size: zEnum(C.COMPANY_SIZES),
  ownerId: zId,
  address: zStr(500),
  phone: zStr(40),
  territory: zStr(60),
  tags: zTags,
  customFields: zCustomFields,
});

export const contactSchema = z.object({
  firstName: zReq('First name', 80),
  lastName: zStr(80),
  email: zEmail,
  phone: zStr(40),
  title: zStr(120),
  companyId: zId,
  ownerId: zId,
  source: zEnum(C.LEAD_SOURCES),
  status: z.enum(C.CONTACT_STATUSES).default('active'),
  lifecycleStage: z.enum(C.LIFECYCLE_STAGES).default('lead'),
  tags: zTags,
  customFields: zCustomFields,
});

export const leadSchema = z.object({
  firstName: zReq('First name', 80),
  lastName: zStr(80),
  email: zEmail,
  phone: zStr(40),
  companyName: zStr(),
  title: zStr(120),
  companySize: zEnum(C.COMPANY_SIZES),
  source: z.enum(C.LEAD_SOURCES).default('website'),
  status: z.enum(C.LEAD_STATUSES).default('new'),
  ownerId: zId,
  territory: zStr(60),
  campaignId: zId,
  customFields: zCustomFields,
});

export const dealSchema = z.object({
  title: zReq('Deal title'),
  value: zMoney.default(0),
  currency: z.enum(C.CURRENCIES).default('USD'),
  pipelineId: zReq('Pipeline'),
  stageId: zReq('Stage'),
  contactId: zId,
  companyId: zId,
  ownerId: zId,
  expectedCloseDate: zDate,
  probability: z.preprocess(blank, zPct.nullable()),
  campaignId: zId,
  customFields: zCustomFields,
});
export const dealCloseSchema = z.object({
  status: z.enum(['won', 'lost', 'open']),
  lostReason: zStr(120),
});

const relatedTo = {
  contactId: zId, companyId: zId, dealId: zId, leadId: zId, ticketId: zId,
};

export const activitySchema = z.object({
  type: z.enum(C.ACTIVITY_TYPES),
  subject: zReq('Subject'),
  body: zStr(20000),
  ...relatedTo,
  dueAt: zDate,
  completed: z.coerce.boolean().default(true),
  outcome: zStr(60),
  durationMin: z.preprocess(blank, z.coerce.number().int().min(0).max(1440).nullable()),
});

export const taskSchema = z.object({
  title: zReq('Title'),
  description: zStr(5000),
  dueDate: zDate,
  priority: z.enum(C.TASK_PRIORITIES).default('medium'),
  status: z.enum(C.TASK_STATUSES).default('todo'),
  assigneeId: zId,
  reminderAt: zDate,
  ...relatedTo,
});

export const productSchema = z.object({
  name: zReq('Product name'),
  sku: zStr(60),
  price: zMoney,
  description: zStr(2000),
  active: z.coerce.boolean().default(true),
});

export const lineItemSchema = z.object({
  productId: zId,
  name: zReq('Item name'),
  quantity: z.coerce.number().positive('Quantity must be more than 0').max(1e6),
  unitPrice: zMoney,
  discountPct: z.coerce.number().min(0).max(100).default(0),
});
export const quoteSchema = z.object({
  dealId: zReq('Deal'),
  status: z.enum(C.QUOTE_STATUSES).default('draft'),
  taxRate: z.coerce.number().min(0).max(100).default(0),
  discount: zMoney.default(0),
  validUntil: zDate,
  notes: zStr(5000),
  lineItems: z.array(lineItemSchema).min(1, 'Add at least one line item').max(200),
});

export const ticketSchema = z.object({
  subject: zReq('Subject'),
  description: zStr(20000),
  contactId: zId,
  companyId: zId,
  priority: z.enum(C.TICKET_PRIORITIES).default('normal'),
  status: z.enum(C.TICKET_STATUSES).default('open'),
  channel: z.enum(C.TICKET_CHANNELS).default('email'),
  assigneeId: zId,
  customFields: zCustomFields,
});

export const campaignSchema = z.object({
  name: zReq('Campaign name'),
  channel: z.enum(C.CAMPAIGN_CHANNELS),
  status: z.enum(C.CAMPAIGN_STATUSES).default('planned'),
  startDate: zDate,
  endDate: zDate,
  budget: zMoney.default(0),
  description: zStr(2000),
});

// ---------- configuration ----------
export const pipelineSchema = z.object({
  name: zReq('Pipeline name', 80),
  stages: z.array(z.object({
    id: z.string().optional(),
    name: zReq('Stage name', 60),
    probability: zPct,
  })).min(1, 'Add at least one stage').max(20),
});

export const inviteUserSchema = z.object({
  name: zReq('Name', 100),
  email: z.string().trim().toLowerCase().email('Enter a valid email'),
  role: z.enum(C.ROLES),
  teamId: zId,
  quota: zMoney.default(0),
  territory: zStr(60),
  password: z.string().min(8, 'Temporary password needs 8+ characters').max(200),
});
export const updateUserSchema = z.object({
  name: zReq('Name', 100),
  role: z.enum(C.ROLES),
  teamId: zId,
  quota: zMoney,
  territory: zStr(60),
  active: z.coerce.boolean(),
}).partial();

export const teamSchema = z.object({ name: zReq('Team name', 80), managerId: zId });

export const customFieldSchema = z.object({
  entityType: z.enum(C.CUSTOM_FIELD_ENTITIES),
  label: zReq('Label', 60),
  type: z.enum(C.CUSTOM_FIELD_TYPES),
  options: z.array(z.string().trim().min(1).max(60)).max(50).default([]),
  required: z.coerce.boolean().default(false),
});

export const tagSchema = z.object({
  name: zReq('Tag', 40),
  color: z.string().regex(/^#[0-9a-f]{6}$/i).default('#64748b'),
});

export const orgSettingsSchema = z.object({
  name: zReq('Organization name', 120),
  currency: z.enum(C.CURRENCIES),
  currencies: z.array(z.enum(C.CURRENCIES)).min(1),
  fiscalYearStartMonth: z.coerce.number().int().min(1).max(12),
  autoAssignLeads: z.coerce.boolean(),
  assignmentMode: z.enum(['round_robin', 'territory']),
}).partial();

export const rolePermissionsSchema = z.object({
  rep: z.array(z.enum(ALL_PERMISSIONS as [Permission, ...Permission[]])),
  manager: z.array(z.enum(ALL_PERMISSIONS as [Permission, ...Permission[]])),
});

export const savedViewSchema = z.object({
  entityType: z.enum(C.ENTITY_TYPES),
  name: zReq('View name', 60),
  filters: z.record(z.string()).default({}),
  shared: z.coerce.boolean().default(false),
});

const conditionSchema = z.object({
  field: z.string().min(1).max(60),
  operator: z.enum(C.WORKFLOW_OPERATORS),
  value: z.string().max(200),
});
export const workflowSchema = z.object({
  name: zReq('Workflow name', 100),
  trigger: z.enum(C.WORKFLOW_TRIGGERS),
  active: z.coerce.boolean().default(true),
  conditions: z.array(conditionSchema).max(10).default([]),
  actions: z.array(z.object({
    type: z.enum(C.WORKFLOW_ACTIONS),
    params: z.record(z.string().max(2000)).default({}),
  })).min(1, 'Add at least one action').max(10),
});

export const emailTemplateSchema = z.object({
  name: zReq('Template name', 80),
  subject: zReq('Subject', 200),
  body: zReq('Body', 20000),
  shared: z.coerce.boolean().default(true),
});

export const sendEmailSchema = z.object({
  to: z.string().trim().toLowerCase().email('Enter a valid recipient'),
  subject: zReq('Subject', 200),
  body: zReq('Message', 20000),
  contactId: zId,
  dealId: zId,
  leadId: zId,
  templateId: zId,
});

export const REPORT_ENTITIES = ['deal', 'lead', 'contact', 'company', 'activity', 'task', 'ticket'] as const;
export const reportConfigSchema = z.object({
  entity: z.enum(REPORT_ENTITIES),
  metric: z.enum(['count', 'sum', 'avg']),
  metricField: z.string().max(40).optional(),
  groupBy: z.string().max(40),
  filters: z.array(conditionSchema).max(10).default([]),
  from: zDate.optional(),
  to: zDate.optional(),
  chartType: z.enum(['bar', 'line', 'donut', 'table']).default('bar'),
});
export const reportSchema = z.object({
  name: zReq('Report name', 100),
  config: reportConfigSchema,
  schedule: z.enum(['none', 'daily', 'weekly', 'monthly']).default('none'),
  recipients: zStr(1000),
});

export const publicLeadSchema = z.object({
  firstName: zReq('First name', 80),
  lastName: zStr(80),
  email: z.string().trim().toLowerCase().email('Enter a valid email'),
  phone: zStr(40),
  companyName: zStr(),
  title: zStr(120),
  companySize: zEnum(C.COMPANY_SIZES),
  message: zStr(5000),
  source: z.enum(C.LEAD_SOURCES).optional(),
});

export const mergeContactsSchema = z.object({ primaryId: z.string().min(1), duplicateId: z.string().min(1) });
export const bulkSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(500),
  action: z.enum(['delete', 'assign', 'tag', 'status']),
  value: z.string().max(100).optional(),
});
export const importSchema = z.object({ rows: z.array(z.record(z.string())).min(1).max(5000) });

// ---------- inferred input types ----------
export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type CompanyInput = z.infer<typeof companySchema>;
export type ContactInput = z.infer<typeof contactSchema>;
export type LeadInput = z.infer<typeof leadSchema>;
export type DealInput = z.infer<typeof dealSchema>;
export type ActivityInput = z.infer<typeof activitySchema>;
export type TaskInput = z.infer<typeof taskSchema>;
export type ProductInput = z.infer<typeof productSchema>;
export type QuoteInput = z.infer<typeof quoteSchema>;
export type TicketInput = z.infer<typeof ticketSchema>;
export type CampaignInput = z.infer<typeof campaignSchema>;
export type PipelineInput = z.infer<typeof pipelineSchema>;
export type WorkflowInput = z.infer<typeof workflowSchema>;
export type ReportConfig = z.infer<typeof reportConfigSchema>;
