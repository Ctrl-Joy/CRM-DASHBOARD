// Shapes returned by the API (dates are ISO strings over the wire).
import type { Role } from './constants';
import type { Permission } from './permissions';

export type ID = string;
export type ISODate = string;

export interface Paginated<T> { data: T[]; total: number; page: number; pageSize: number }

export interface UserRef { id: ID; name: string; email: string; avatarUrl: string | null }
export interface TagRef { id: ID; name: string; color: string }

export interface Me extends UserRef {
  role: Role;
  teamId: ID | null;
  quota: number;
  territory: string | null;
  permissions: Permission[];
  org: { id: ID; name: string; currency: string; currencies: string[]; fiscalYearStartMonth: number; leadApiKey?: string };
}

export interface User extends UserRef {
  role: Role; teamId: ID | null; team?: { id: ID; name: string } | null; quota: number;
  territory: string | null; active: boolean; lastLoginAt: ISODate | null; createdAt: ISODate;
}
export interface Team { id: ID; name: string; managerId: ID | null; manager?: UserRef | null; members?: UserRef[]; _count?: { members: number } }

interface Base { id: ID; createdAt: ISODate; updatedAt: ISODate }
export type CustomValues = Record<string, string | number | boolean | null>;

export interface Company extends Base {
  name: string; domain: string | null; industry: string | null; size: string | null; address: string | null;
  phone: string | null; territory: string | null; ownerId: ID | null; owner?: UserRef | null; tags: TagRef[];
  customFields: CustomValues; _count?: { contacts: number; deals: number };
  openDealValue?: number;
}

export interface Contact extends Base {
  firstName: string; lastName: string | null; email: string | null; phone: string | null; title: string | null;
  companyId: ID | null; company?: { id: ID; name: string } | null; ownerId: ID | null; owner?: UserRef | null;
  source: string | null; status: string; lifecycleStage: string; lastContactedAt: ISODate | null;
  tags: TagRef[]; customFields: CustomValues;
}

export interface Lead extends Base {
  firstName: string; lastName: string | null; email: string | null; phone: string | null; companyName: string | null;
  title: string | null; companySize: string | null; source: string; status: string; score: number;
  scoreBreakdown: { label: string; points: number }[];
  ownerId: ID | null; owner?: UserRef | null; assignedAt: ISODate | null; territory: string | null;
  campaignId: ID | null; campaign?: { id: ID; name: string } | null;
  convertedAt: ISODate | null; convertedContactId: ID | null; convertedDealId: ID | null; firstResponseAt: ISODate | null;
  customFields: CustomValues;
}

export interface Stage { id: ID; pipelineId: ID; name: string; order: number; probability: number }
export interface Pipeline { id: ID; name: string; isDefault: boolean; stages: Stage[] }

export interface Deal extends Base {
  title: string; value: number; currency: string; pipelineId: ID; stageId: ID; stage?: Stage;
  pipeline?: { id: ID; name: string };
  contactId: ID | null; contact?: { id: ID; firstName: string; lastName: string | null; email: string | null } | null;
  companyId: ID | null; company?: { id: ID; name: string } | null;
  ownerId: ID | null; owner?: UserRef | null; expectedCloseDate: ISODate | null; probability: number | null;
  status: 'open' | 'won' | 'lost'; lostReason: string | null; closedAt: ISODate | null; stageChangedAt: ISODate;
  lastActivityAt: ISODate | null; campaignId: ID | null; customFields: CustomValues;
  /** Server-computed. */
  effectiveProbability?: number; weightedValue?: number; risk?: DealRisk | null;
}
export interface DealRisk { level: 'low' | 'medium' | 'high'; reasons: string[] }
export interface StageHistory { id: ID; fromStage: { name: string } | null; toStage: { name: string }; changedBy: UserRef | null; changedAt: ISODate }

export interface Activity extends Base {
  type: 'call' | 'email' | 'meeting' | 'note' | 'task'; subject: string; body: string | null;
  contactId: ID | null; companyId: ID | null; dealId: ID | null; leadId: ID | null; ticketId: ID | null;
  contact?: { id: ID; firstName: string; lastName: string | null } | null;
  deal?: { id: ID; title: string } | null; company?: { id: ID; name: string } | null;
  ownerId: ID; owner?: UserRef; dueAt: ISODate | null; completed: boolean; completedAt: ISODate | null;
  outcome: string | null; durationMin: number | null; emailTo: string | null;
}

export interface Task extends Base {
  title: string; description: string | null; dueDate: ISODate | null; priority: string; status: string;
  assigneeId: ID | null; assignee?: UserRef | null; reminderAt: ISODate | null; completedAt: ISODate | null;
  contactId: ID | null; companyId: ID | null; dealId: ID | null; leadId: ID | null; ticketId: ID | null;
  contact?: { id: ID; firstName: string; lastName: string | null } | null; deal?: { id: ID; title: string } | null;
  company?: { id: ID; name: string } | null;
}

export interface Product extends Base { name: string; sku: string | null; price: number; description: string | null; active: boolean }
export interface QuoteLineItem { id: ID; productId: ID | null; name: string; quantity: number; unitPrice: number; discountPct: number; total: number }
export interface Quote extends Base {
  number: string; dealId: ID; deal?: Deal; status: string; taxRate: number; discount: number; subtotal: number; tax: number;
  total: number; currency: string; validUntil: ISODate | null; notes: string | null; lineItems: QuoteLineItem[];
}

export interface Ticket extends Base {
  number: number; subject: string; description: string | null; priority: string; status: string; channel: string;
  contactId: ID | null; contact?: { id: ID; firstName: string; lastName: string | null; email: string | null } | null;
  companyId: ID | null; company?: { id: ID; name: string } | null;
  assigneeId: ID | null; assignee?: UserRef | null; slaDueAt: ISODate; firstResponseAt: ISODate | null; resolvedAt: ISODate | null;
  customFields: CustomValues;
}

export interface Campaign extends Base {
  name: string; channel: string; status: string; startDate: ISODate | null; endDate: ISODate | null; budget: number;
  description: string | null;
  stats?: { leads: number; convertedLeads: number; deals: number; wonDeals: number; wonRevenue: number; pipeline: number; roi: number | null; costPerLead: number | null };
}

export interface Notification { id: ID; type: string; title: string; body: string | null; link: string | null; readAt: ISODate | null; createdAt: ISODate }
export interface AuditLog { id: ID; action: string; entityType: string; entityId: ID; changes: Record<string, unknown> | null; user: UserRef | null; createdAt: ISODate; ip: string | null }
export interface CustomField { id: ID; entityType: string; key: string; label: string; type: string; options: string[]; required: boolean; order: number }
export interface Tag extends TagRef { _count?: { contacts: number; companies: number } }
export interface SavedView { id: ID; entityType: string; name: string; filters: Record<string, string>; shared: boolean; userId: ID }
export interface Attachment { id: ID; fileName: string; mimeType: string; size: number; uploadedBy?: UserRef; createdAt: ISODate }
export interface EmailTemplate { id: ID; name: string; subject: string; body: string; shared: boolean; ownerId: ID | null }
export interface Workflow {
  id: ID; name: string; trigger: string; active: boolean;
  conditions: { field: string; operator: string; value: string }[];
  actions: { type: string; params: Record<string, string> }[];
  runCount: number; lastRunAt: ISODate | null; createdAt: ISODate;
}
export interface WorkflowRun { id: ID; status: string; message: string | null; entityId: ID; createdAt: ISODate }
export interface SavedReport { id: ID; name: string; config: import('./schemas').ReportConfig; schedule: string; recipients: string | null; ownerId: ID; createdAt: ISODate }

export interface NextBestAction {
  id: string; kind: 'overdue_task' | 'stalled_deal' | 'lead_follow_up' | 'closing_soon' | 'at_risk' | 'sla_breach';
  title: string; reason: string; priority: number; link: string;
  entity: { type: 'task' | 'deal' | 'lead' | 'ticket'; id: ID };
}

export interface SearchResult { type: 'contact' | 'company' | 'lead' | 'deal' | 'ticket' | 'task'; id: ID; title: string; subtitle: string | null; link: string }

export interface Kpi { key: string; label: string; value: number; previous: number | null; format: 'currency' | 'percent' | 'number' | 'days' | 'hours' }
export interface DashboardData {
  period: { from: ISODate; to: ISODate; previousFrom: ISODate; previousTo: ISODate };
  kpis: Kpi[];
  revenueSeries: { date: string; revenue: number; previous: number }[];
  dealsByStage: { stageId: ID; name: string; count: number; value: number; weighted: number }[];
  dealsByOwner: { ownerId: ID; name: string; won: number; open: number }[];
  leadSources: { source: string; count: number }[];
  coverage: { quota: number; won: number; weightedPipeline: number; openPipeline: number };
  actions: NextBestAction[];
  activity: (Activity & { kind?: string })[];
}
