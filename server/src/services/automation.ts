import {
  CONTACT_STATUSES, LEAD_STATUSES, LIFECYCLE_STAGES, TASK_PRIORITIES, TICKET_PRIORITIES, TICKET_STATUSES,
  renderTemplate, type WorkflowTrigger,
} from '@crm/shared';
import { prisma } from '../lib/prisma';
import { json } from '../lib/http';
import { notify } from './notify';
import { pickAssignee } from './assignment';
import { emailProvider } from './email';

// Trigger → condition → action engine. Actions write straight to the database
// and never emit events themselves, so workflows can't loop.

export type EntityType = 'deal' | 'lead' | 'contact' | 'ticket';
export interface WorkflowContext {
  orgId: string;
  actorId: string | null;
  entityType: EntityType;
  entity: Record<string, unknown> & { id: string };
}
interface Condition { field: string; operator: string; value: string }
interface Action { type: string; params: Record<string, string> }

const get = (obj: unknown, path: string): unknown =>
  path.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), obj);

export function evaluate(cond: Condition, entity: Record<string, unknown>) {
  const actual = get(entity, cond.field);
  const a = actual instanceof Date ? actual.toISOString() : actual;
  switch (cond.operator) {
    case 'equals': return String(a ?? '').toLowerCase() === cond.value.toLowerCase();
    case 'not_equals': return String(a ?? '').toLowerCase() !== cond.value.toLowerCase();
    case 'greater_than': return Number(a) > Number(cond.value);
    case 'less_than': return Number(a) < Number(cond.value);
    case 'contains': return String(a ?? '').toLowerCase().includes(cond.value.toLowerCase());
    default: return false;
  }
}

const OWNER_FIELD: Record<EntityType, string> = { deal: 'ownerId', lead: 'ownerId', contact: 'ownerId', ticket: 'assigneeId' };
const LINK_FIELD: Record<EntityType, string> = { deal: 'dealId', lead: 'leadId', contact: 'contactId', ticket: 'ticketId' };
const PATH: Record<EntityType, string> = { deal: 'deals', lead: 'leads', contact: 'contacts', ticket: 'tickets' };
const UPDATABLE: Record<EntityType, Record<string, readonly string[] | 'int'>> = {
  deal: { probability: 'int' },
  lead: { status: LEAD_STATUSES },
  contact: { lifecycleStage: LIFECYCLE_STAGES, status: CONTACT_STATUSES },
  ticket: { priority: TICKET_PRIORITIES, status: TICKET_STATUSES },
};

function vars(ctx: WorkflowContext) {
  const e = ctx.entity as Record<string, any>;
  return {
    title: e.title ?? e.subject ?? '', name: e.title ?? [e.firstName, e.lastName].filter(Boolean).join(' '),
    first_name: e.firstName ?? e.contact?.firstName ?? '', last_name: e.lastName ?? e.contact?.lastName ?? '',
    full_name: [e.firstName ?? e.contact?.firstName, e.lastName ?? e.contact?.lastName].filter(Boolean).join(' '),
    company_name: e.company?.name ?? e.companyName ?? '', deal_title: e.title ?? '', deal_value: e.value ?? '',
    stage: e.stage?.name ?? '', status: e.status ?? '', priority: e.priority ?? '',
  };
}

async function resolveRecipient(ctx: WorkflowContext, who: string | undefined) {
  const ownerId = ctx.entity[OWNER_FIELD[ctx.entityType]] as string | null;
  if (!who || who === 'owner') return ownerId ?? ctx.actorId;
  if (who === 'manager') {
    if (!ownerId) return null;
    const owner = await prisma.user.findUnique({ where: { id: ownerId }, select: { team: { select: { managerId: true } } } });
    return owner?.team?.managerId ?? null;
  }
  const user = await prisma.user.findFirst({ where: { id: who, orgId: ctx.orgId, active: true, deletedAt: null }, select: { id: true } });
  return user?.id ?? null;
}

async function runAction(action: Action, ctx: WorkflowContext): Promise<string> {
  const p = action.params ?? {};
  const v = vars(ctx);
  const link = `/${PATH[ctx.entityType]}/${ctx.entity.id}`;
  switch (action.type) {
    case 'create_task': {
      const assigneeId = await resolveRecipient(ctx, p.assignee);
      const days = Number(p.dueInDays ?? 1);
      const title = renderTemplate(p.title || 'Follow up on {{name}}', v);
      await prisma.task.create({
        data: {
          orgId: ctx.orgId, title, description: p.description ? renderTemplate(p.description, v) : null,
          priority: (TASK_PRIORITIES as readonly string[]).includes(p.priority) ? p.priority : 'medium',
          dueDate: new Date(Date.now() + (Number.isFinite(days) ? days : 1) * 864e5), assigneeId, createdById: ctx.actorId,
          [LINK_FIELD[ctx.entityType]]: ctx.entity.id,
          ...(ctx.entityType === 'deal' && ctx.entity.contactId ? { contactId: ctx.entity.contactId as string } : {}),
        },
      });
      await notify(ctx.orgId, assigneeId, { type: 'workflow', title: `New task: ${title}`, link: '/tasks' }, { skipUserId: ctx.actorId ?? undefined });
      return `Created task "${title}"`;
    }
    case 'notify_user': {
      const userId = await resolveRecipient(ctx, p.recipient);
      const message = renderTemplate(p.message || '{{name}} needs your attention', v);
      await notify(ctx.orgId, userId, { type: 'workflow', title: message, link });
      return userId ? 'Sent notification' : 'No recipient found';
    }
    case 'assign_owner': {
      const userId = p.userId === 'round_robin' || !p.userId
        ? await pickAssignee(ctx.orgId, (ctx.entity.territory as string) ?? null)
        : await resolveRecipient(ctx, p.userId);
      if (!userId) return 'No assignee available';
      const delegate = (prisma as any)[ctx.entityType];
      await delegate.update({ where: { id: ctx.entity.id }, data: { [OWNER_FIELD[ctx.entityType]]: userId, ...(ctx.entityType === 'lead' && { assignedAt: new Date() }) } });
      ctx.entity[OWNER_FIELD[ctx.entityType]] = userId;
      await notify(ctx.orgId, userId, { type: 'assignment', title: `${v.name} was assigned to you`, link });
      return 'Assigned owner';
    }
    case 'update_field': {
      const allowed = UPDATABLE[ctx.entityType][p.field];
      if (!allowed) return `Field "${p.field}" can't be updated by automation`;
      let value: string | number = p.value;
      if (allowed === 'int') { value = Math.max(0, Math.min(100, Math.round(Number(p.value)))); if (!Number.isFinite(value)) return 'Invalid number'; }
      else if (!allowed.includes(p.value)) return `Invalid value for ${p.field}`;
      await (prisma as any)[ctx.entityType].update({ where: { id: ctx.entity.id }, data: { [p.field]: value } });
      return `Set ${p.field} to ${value}`;
    }
    case 'send_email': {
      const template = p.templateId ? await prisma.emailTemplate.findFirst({ where: { id: p.templateId, orgId: ctx.orgId, deletedAt: null } }) : null;
      if (!template) return 'Template not found';
      const e = ctx.entity as Record<string, any>;
      const to: string | null = e.email ?? e.contact?.email ?? null;
      if (!to) return 'No recipient email on record';
      const sender = ctx.actorId ? await prisma.user.findUnique({ where: { id: ctx.actorId } }) : null;
      const allVars = { ...v, email: to, sender_name: sender?.name ?? '', sender_email: sender?.email ?? '' };
      const subject = renderTemplate(template.subject, allVars);
      const body = renderTemplate(template.body, allVars);
      await emailProvider.send({ from: sender?.email ?? 'no-reply@nimbus.local', to, subject, text: body });
      const ownerId = (ctx.entity[OWNER_FIELD[ctx.entityType]] as string | null) ?? ctx.actorId;
      if (ownerId) {
        await prisma.activity.create({
          data: {
            orgId: ctx.orgId, type: 'email', subject, body, emailTo: to, ownerId, completed: true, completedAt: new Date(),
            [LINK_FIELD[ctx.entityType]]: ctx.entity.id,
            ...(ctx.entityType === 'deal' && e.contactId ? { contactId: e.contactId } : {}),
          },
        });
      }
      return `Emailed ${to}`;
    }
    default:
      return `Unknown action ${action.type}`;
  }
}

/** Run every active workflow for a trigger. Failures are logged, never thrown. */
export async function runWorkflows(trigger: WorkflowTrigger, ctx: WorkflowContext) {
  const workflows = await prisma.workflow.findMany({ where: { orgId: ctx.orgId, trigger, active: true, deletedAt: null } });
  for (const wf of workflows) {
    const conditions = json<Condition[]>(wf.conditions, []);
    let status = 'success';
    let message: string;
    try {
      if (!conditions.every((c) => evaluate(c, ctx.entity))) {
        status = 'skipped';
        message = 'Conditions not met';
      } else {
        const results: string[] = [];
        for (const action of json<Action[]>(wf.actions, [])) results.push(await runAction(action, ctx));
        message = results.join('; ');
      }
    } catch (err) {
      status = 'failed';
      message = err instanceof Error ? err.message : 'Action failed';
      console.error(`[workflow ${wf.id}]`, err);
    }
    await prisma.workflowRun.create({ data: { workflowId: wf.id, entityId: ctx.entity.id, status, message: message.slice(0, 500) } });
    if (status !== 'skipped') await prisma.workflow.update({ where: { id: wf.id }, data: { runCount: { increment: 1 }, lastRunAt: new Date() } });
  }
}

/** Fire-and-forget wrapper so request latency isn't tied to automations. */
export function emit(trigger: WorkflowTrigger, ctx: WorkflowContext) {
  const p = runWorkflows(trigger, ctx).catch((err) => console.error(`[workflows:${trigger}]`, err));
  if (process.env.NODE_ENV === 'test') return p; // tests await side effects
  return undefined;
}
