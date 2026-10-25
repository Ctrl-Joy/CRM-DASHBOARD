// Enumerations shared by the API and the UI. SQLite has no native enums, so
// the database stores these as strings and zod enforces them at both ends.

export const ROLES = ['rep', 'manager', 'admin'] as const;
export type Role = (typeof ROLES)[number];
export const ROLE_LABELS: Record<Role, string> = { rep: 'Sales Rep', manager: 'Manager', admin: 'Admin / Executive' };

export const LEAD_STATUSES = ['new', 'contacted', 'qualified', 'unqualified'] as const;
export const LEAD_SOURCES = ['website', 'referral', 'webinar', 'event', 'cold_outreach', 'social', 'partner', 'paid_ads', 'inbound_api', 'other'] as const;
export const CONTACT_STATUSES = ['active', 'inactive'] as const;
export const LIFECYCLE_STAGES = ['subscriber', 'lead', 'mql', 'sql', 'opportunity', 'customer', 'evangelist'] as const;
export const COMPANY_SIZES = ['1-10', '11-50', '51-200', '201-500', '501-1000', '1000+'] as const;
export const INDUSTRIES = ['Software', 'Finance', 'Healthcare', 'Retail', 'Manufacturing', 'Education', 'Media', 'Logistics', 'Real Estate', 'Hospitality', 'Energy', 'Other'] as const;

export const DEAL_STATUSES = ['open', 'won', 'lost'] as const;
export const LOST_REASONS = ['Price', 'Competitor', 'No budget', 'No decision', 'Timing', 'Missing features', 'Went silent', 'Other'] as const;

export const ACTIVITY_TYPES = ['call', 'email', 'meeting', 'note', 'task'] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];
export const CALL_OUTCOMES = ['connected', 'left_voicemail', 'no_answer', 'wrong_number', 'scheduled_meeting'] as const;

export const TASK_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
export const TASK_STATUSES = ['todo', 'in_progress', 'done'] as const;

export const TICKET_PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;
export const TICKET_STATUSES = ['open', 'pending', 'resolved', 'closed'] as const;
export const TICKET_CHANNELS = ['email', 'phone', 'chat', 'web'] as const;
/** Resolution SLA in hours by ticket priority. */
export const SLA_HOURS: Record<(typeof TICKET_PRIORITIES)[number], number> = { urgent: 4, high: 8, normal: 24, low: 72 };

export const CAMPAIGN_CHANNELS = ['email', 'social', 'paid_search', 'events', 'content', 'webinar', 'partner'] as const;
export const CAMPAIGN_STATUSES = ['planned', 'active', 'paused', 'completed'] as const;

export const QUOTE_STATUSES = ['draft', 'sent', 'accepted', 'declined'] as const;

export const CUSTOM_FIELD_ENTITIES = ['contact', 'company', 'lead', 'deal', 'ticket'] as const;
export type CustomFieldEntity = (typeof CUSTOM_FIELD_ENTITIES)[number];
export const CUSTOM_FIELD_TYPES = ['text', 'number', 'date', 'select', 'checkbox'] as const;

export const CURRENCIES = ['USD', 'EUR', 'GBP', 'INR', 'AUD', 'CAD', 'JPY', 'SGD', 'AED'] as const;

/** Entities that can be listed, saved as views, exported and searched. */
export const ENTITY_TYPES = ['contact', 'company', 'lead', 'deal', 'task', 'activity', 'ticket', 'product', 'campaign'] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

export const WORKFLOW_TRIGGERS = [
  'deal.created', 'deal.stage_changed', 'deal.won', 'deal.lost',
  'lead.created', 'lead.converted', 'contact.created', 'ticket.created', 'ticket.status_changed',
] as const;
export type WorkflowTrigger = (typeof WORKFLOW_TRIGGERS)[number];
export const WORKFLOW_TRIGGER_LABELS: Record<WorkflowTrigger, string> = {
  'deal.created': 'Deal is created',
  'deal.stage_changed': 'Deal moves to a stage',
  'deal.won': 'Deal is won',
  'deal.lost': 'Deal is lost',
  'lead.created': 'Lead is created',
  'lead.converted': 'Lead is converted',
  'contact.created': 'Contact is created',
  'ticket.created': 'Ticket is created',
  'ticket.status_changed': 'Ticket status changes',
};
export const WORKFLOW_OPERATORS = ['equals', 'not_equals', 'greater_than', 'less_than', 'contains'] as const;
export const WORKFLOW_ACTIONS = ['create_task', 'notify_user', 'assign_owner', 'update_field', 'send_email'] as const;
export type WorkflowActionType = (typeof WORKFLOW_ACTIONS)[number];

export const NOTIFICATION_TYPES = ['assignment', 'stage_change', 'task_due', 'mention', 'workflow', 'ticket', 'system'] as const;

/** Human-readable label for a snake_case enum value. */
export const labelize = (v: string | null | undefined) =>
  !v ? '' : v.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\bApi\b/, 'API').replace(/\b(Mql|Sql)\b/, (m) => m.toUpperCase());
