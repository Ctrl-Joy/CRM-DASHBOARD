/**
 * OPT-IN demo data: `npm run seed`.
 *
 * Creates (or recreates) a separate "Northwind Demo" organization with
 * realistic data. It never touches any other organization — accounts created
 * through sign-up always start empty.
 */
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { LOST_REASONS, SLA_HOURS, quoteTotals, lineTotal } from '@crm/shared';
import { scoreLead } from '../src/services/scoring';
import { newApiKey } from '../src/services/setup';

const prisma = new PrismaClient();
const DEMO_ORG = 'Northwind Demo';
export const DEMO_PASSWORD = 'demo-password-2026';

// Deterministic PRNG so every seed run produces the same dataset.
let s = 42;
const rand = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)];
const int = (a: number, b: number) => Math.floor(a + rand() * (b - a + 1));
const DAY = 864e5;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY);
const daysAhead = (n: number) => new Date(Date.now() + n * DAY);

const FIRST = ['Priya', 'Tom', 'Lina', 'Omar', 'Sofia', 'Kenji', 'Grace', 'Diego', 'Hannah', 'Marcus', 'Aisha', 'Lukas', 'Mei', 'Carlos', 'Fatima', 'Noah', 'Elena', 'Ravi', 'Chloe', 'Ibrahim', 'Zara', 'Mateo', 'Yuki', 'Olivia', 'Arjun', 'Isabel', 'Ethan', 'Leila', 'Samuel', 'Ana'];
const LAST = ['Shah', 'Becker', 'Park', 'Haddad', 'Rossi', 'Mori', 'Liu', 'Ruiz', 'Okafor', 'Bell', 'Khan', 'Weber', 'Chen', 'Silva', 'Ali', 'Martin', 'Popescu', 'Iyer', 'Dubois', 'Nasser', 'Ahmed', 'Garcia', 'Tanaka', 'Brown', 'Mehta', 'Costa', 'Wright', 'Farah', 'Osei', 'Novak'];
const TITLES = ['CEO', 'CTO', 'VP Sales', 'VP Operations', 'Head of Procurement', 'Director of IT', 'Operations Manager', 'Product Manager', 'Finance Director', 'Marketing Lead', 'Engineer', 'Analyst'];
const COMPANIES = [
  ['Acme Industries', 'Manufacturing'], ['Globex', 'Software'], ['Initech', 'Software'], ['Umbrella Health', 'Healthcare'], ['Vandelay Imports', 'Retail'],
  ['Hooli', 'Software'], ['Stark Labs', 'Manufacturing'], ['Wayne Logistics', 'Logistics'], ['Soylent Foods', 'Retail'], ['Pied Piper', 'Software'],
  ['Wonka Confectionery', 'Retail'], ['Tyrell Systems', 'Software'], ['Cyberdyne', 'Manufacturing'], ['Oceanic Air', 'Hospitality'], ['Gringotts Finance', 'Finance'],
  ['Monarch Energy', 'Energy'], ['Bluth Realty', 'Real Estate'], ['Dunder Paper', 'Manufacturing'], ['Prestige Media', 'Media'], ['Brightway Academy', 'Education'],
] as const;
const SIZES = ['11-50', '51-200', '201-500', '501-1000', '1000+'] as const;
const TERRITORIES = ['North America', 'EMEA', 'APAC'];

async function wipeOrg(orgId: string) {
  // Most tables reference the org by a plain orgId column, so clear them explicitly.
  const deals = await prisma.deal.findMany({ where: { orgId }, select: { id: true } });
  await prisma.$transaction([
    prisma.dealStageHistory.deleteMany({ where: { dealId: { in: deals.map((d) => d.id) } } }),
    prisma.quote.deleteMany({ where: { orgId } }),
    prisma.activity.deleteMany({ where: { orgId } }),
    prisma.task.deleteMany({ where: { orgId } }),
    prisma.attachment.deleteMany({ where: { orgId } }),
    prisma.ticket.deleteMany({ where: { orgId } }),
    prisma.deal.deleteMany({ where: { orgId } }),
    prisma.lead.deleteMany({ where: { orgId } }),
    prisma.contact.deleteMany({ where: { orgId } }),
    prisma.company.deleteMany({ where: { orgId } }),
    prisma.campaign.deleteMany({ where: { orgId } }),
    prisma.product.deleteMany({ where: { orgId } }),
    prisma.pipeline.deleteMany({ where: { orgId } }),
    prisma.tag.deleteMany({ where: { orgId } }),
    prisma.customField.deleteMany({ where: { orgId } }),
    prisma.savedView.deleteMany({ where: { orgId } }),
    prisma.workflow.deleteMany({ where: { orgId } }),
    prisma.emailTemplate.deleteMany({ where: { orgId } }),
    prisma.report.deleteMany({ where: { orgId } }),
    prisma.auditLog.deleteMany({ where: { orgId } }),
    prisma.notification.deleteMany({ where: { orgId } }),
    prisma.organization.delete({ where: { id: orgId } }), // cascades users & teams
  ]);
}

async function main() {
  const existing = await prisma.organization.findFirst({ where: { name: DEMO_ORG } });
  if (existing) await wipeOrg(existing.id);

  const org = await prisma.organization.create({
    data: { name: DEMO_ORG, leadApiKey: newApiKey(), currencies: 'USD,EUR,GBP', ticketCounter: 0, quoteCounter: 0 },
  });
  const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const mk = (name: string, email: string, role: string, quota: number, territory: string | null) =>
    prisma.user.create({ data: { orgId: org.id, name, email, role, quota, territory, passwordHash: hash, lastLoginAt: daysAgo(int(0, 3)) } });
  const admin = await mk('Alex Admin', 'admin@demo.nimbus.test', 'admin', 0, null);
  const manager = await mk('Morgan Manager', 'manager@demo.nimbus.test', 'manager', 60000, null);
  const reps = await Promise.all([
    mk('Sam Rivera', 'sam@demo.nimbus.test', 'rep', 25000, 'North America'),
    mk('Jordan Lee', 'jordan@demo.nimbus.test', 'rep', 25000, 'EMEA'),
    mk('Taylor Kim', 'taylor@demo.nimbus.test', 'rep', 20000, 'APAC'),
  ]);
  const team = await prisma.team.create({ data: { orgId: org.id, name: 'Field Sales', managerId: manager.id } });
  await prisma.user.updateMany({ where: { id: { in: [...reps.map((r) => r.id), manager.id] } }, data: { teamId: team.id } });
  const sellers = [...reps, manager];

  // Pipelines
  const sales = await prisma.pipeline.create({
    data: {
      orgId: org.id, name: 'New Business', isDefault: true,
      stages: { create: [['Qualification', 10], ['Discovery', 25], ['Proposal', 50], ['Negotiation', 75], ['Contract Sent', 90]].map(([name, probability], order) => ({ name: name as string, probability: probability as number, order })) },
    },
    include: { stages: { orderBy: { order: 'asc' } } },
  });
  const renewals = await prisma.pipeline.create({
    data: {
      orgId: org.id, name: 'Renewals & Expansion',
      stages: { create: [['Up for renewal', 40], ['Usage review', 60], ['Renewal quote', 80]].map(([name, probability], order) => ({ name: name as string, probability: probability as number, order })) },
    },
    include: { stages: { orderBy: { order: 'asc' } } },
  });

  // Tags, custom field
  const tags = await Promise.all([['Enterprise', '#6366f1'], ['Strategic', '#e11d48'], ['Partner', '#059669'], ['At risk', '#d97706']].map(([name, color]) =>
    prisma.tag.create({ data: { orgId: org.id, name, color } })));
  await prisma.customField.create({ data: { orgId: org.id, entityType: 'company', key: 'contract_tier', label: 'Contract tier', type: 'select', options: JSON.stringify(['Bronze', 'Silver', 'Gold']), order: 0 } });

  // Companies & contacts
  const companies = [];
  for (const [i, [name, industry]] of COMPANIES.entries()) {
    const owner = sellers[i % sellers.length];
    companies.push(await prisma.company.create({
      data: {
        orgId: org.id, name, industry, size: pick(SIZES), domain: `${name.toLowerCase().replace(/[^a-z]/g, '')}.example`,
        phone: `+1 555 0${int(100, 999)}`, territory: owner.territory ?? pick(TERRITORIES), ownerId: owner.id,
        customFields: JSON.stringify({ contract_tier: pick(['Bronze', 'Silver', 'Gold']) }),
        createdAt: daysAgo(int(60, 300)),
        tags: { connect: rand() < 0.4 ? [{ id: pick(tags).id }] : [] },
      },
    }));
  }
  const contacts = [];
  for (let i = 0; i < 60; i++) {
    const company = companies[i % companies.length];
    const first = FIRST[i % FIRST.length], last = LAST[(i * 7) % LAST.length];
    contacts.push(await prisma.contact.create({
      data: {
        orgId: org.id, firstName: first, lastName: last, email: `${first}.${last}${i}@${company.domain}`.toLowerCase(),
        phone: `+1 555 ${int(1000, 9999)}`, title: pick(TITLES), companyId: company.id, ownerId: company.ownerId,
        source: pick(['website', 'referral', 'event', 'webinar', 'partner'] as const),
        lifecycleStage: pick(['lead', 'mql', 'sql', 'opportunity', 'customer'] as const), createdAt: daysAgo(int(10, 250)),
        lastContactedAt: rand() < 0.8 ? daysAgo(int(0, 45)) : null,
        tags: { connect: rand() < 0.25 ? [{ id: pick(tags).id }] : [] },
      },
    }));
  }

  // Campaigns
  const campaigns = await Promise.all([
    ['Q3 Product Webinar Series', 'webinar', 'completed', 8000, -120, -60],
    ['Search Ads — CRM keywords', 'paid_search', 'active', 15000, -90, 30],
    ['SaaS Summit booth', 'events', 'completed', 22000, -75, -72],
    ['Partner co-marketing', 'partner', 'active', 5000, -40, 50],
  ].map(([name, channel, status, budget, start, end]) => prisma.campaign.create({
    data: { orgId: org.id, name: name as string, channel: channel as string, status: status as string, budget: budget as number, startDate: daysAgo(-(start as number)), endDate: daysAhead(end as number) },
  })));

  // Deals: closed history over ~6 months + open pipeline
  const deals = [];
  for (let i = 0; i < 40; i++) {
    const contact = contacts[(i * 3) % contacts.length];
    const owner = sellers[i % sellers.length];
    const renewal = i % 8 === 0;
    const pipeline = renewal ? renewals : sales;
    const created = daysAgo(int(5, 200));
    const r = rand();
    const status = i < 14 ? 'won' : i < 20 ? 'lost' : 'open';
    const stage = status === 'open' ? pipeline.stages[Math.min(pipeline.stages.length - 1, Math.floor(r * pipeline.stages.length))] : pipeline.stages[pipeline.stages.length - 1];
    const closedAt = status === 'open' ? null : new Date(Math.min(Date.now() - DAY, created.getTime() + int(10, 90) * DAY));
    const stageChangedAt = status === 'open' ? daysAgo(int(1, 40)) : closedAt!;
    deals.push(await prisma.deal.create({
      data: {
        orgId: org.id, title: `${contact.companyId ? companies.find((c) => c.id === contact.companyId)!.name : 'New'} — ${renewal ? 'renewal' : pick(['platform', 'expansion', 'pilot', 'enterprise plan', 'team plan'])}`,
        value: int(4, 90) * 1000, currency: 'USD', pipelineId: pipeline.id, stageId: stage.id, contactId: contact.id, companyId: contact.companyId,
        ownerId: owner.id, status, closedAt, lostReason: status === 'lost' ? pick(LOST_REASONS) : null,
        expectedCloseDate: status === 'open' ? daysAhead(int(-10, 75)) : closedAt, createdAt: created, stageChangedAt,
        lastActivityAt: status === 'open' ? (rand() < 0.75 ? daysAgo(int(0, 12)) : daysAgo(int(16, 40))) : closedAt,
        campaignId: rand() < 0.3 ? pick(campaigns).id : null,
        stageHistory: { create: { toStageId: pipeline.stages[0].id, changedById: owner.id, changedAt: created } },
      },
    }));
    if (stage.id !== pipeline.stages[0].id) {
      await prisma.dealStageHistory.create({ data: { dealId: deals[i].id, fromStageId: pipeline.stages[0].id, toStageId: stage.id, changedById: owner.id, changedAt: stageChangedAt } });
    }
  }

  // Leads
  for (let i = 0; i < 32; i++) {
    const first = FIRST[(i * 5 + 3) % FIRST.length], last = LAST[(i * 11 + 2) % LAST.length];
    const source = pick(['website', 'referral', 'webinar', 'event', 'paid_ads', 'social', 'cold_outreach', 'inbound_api'] as const);
    const title = pick([...TITLES, null, null]);
    const companySize = pick([...SIZES, null]);
    const companyName = rand() < 0.85 ? `${pick(['Blue', 'North', 'Peak', 'Bright', 'Silver', 'Nova', 'Atlas'])} ${pick(['Systems', 'Labs', 'Partners', 'Group', 'Works'])}` : null;
    const status = pick(['new', 'new', 'contacted', 'qualified', 'unqualified'] as const);
    const created = daysAgo(int(0, 60));
    const { score, breakdown } = scoreLead({ source, title, companySize, email: `${first}@x.example`, phone: rand() < 0.5 ? '+1 555 0100' : null, companyName });
    await prisma.lead.create({
      data: {
        orgId: org.id, firstName: first, lastName: last, email: `${first}.${last}.${i}@prospect.example`.toLowerCase(), title, companySize, companyName,
        source, status, score, scoreBreakdown: JSON.stringify(breakdown), ownerId: reps[i % reps.length].id, assignedAt: created,
        firstResponseAt: status === 'new' ? null : new Date(created.getTime() + int(1, 30) * 3600e3), territory: reps[i % reps.length].territory,
        campaignId: source === 'webinar' ? campaigns[0].id : source === 'paid_ads' ? campaigns[1].id : source === 'event' ? campaigns[2].id : null,
        createdAt: created,
      },
    });
  }

  // Activities
  const types = ['call', 'email', 'meeting', 'note'] as const;
  const subjects: Record<string, string[]> = {
    call: ['Discovery call', 'Pricing discussion', 'Check-in call', 'Follow-up call'], email: ['Sent proposal', 'Shared case study', 'Recap and next steps', 'Intro email'],
    meeting: ['Product demo', 'Stakeholder workshop', 'Contract review', 'QBR'], note: ['Budget confirmed for Q4', 'Champion is the VP Ops', 'Competitor is in the deal', 'Needs SSO and audit log'],
  };
  for (let i = 0; i < 160; i++) {
    const deal = deals[i % deals.length];
    const type = pick(types);
    const created = daysAgo(int(0, 120));
    await prisma.activity.create({
      data: {
        orgId: org.id, type, subject: pick(subjects[type]), body: type === 'note' ? 'Captured during the last conversation.' : null,
        ownerId: deal.ownerId!, dealId: deal.id, contactId: deal.contactId, companyId: deal.companyId, completed: true, completedAt: created, createdAt: created,
        outcome: type === 'call' ? pick(['connected', 'left_voicemail', 'no_answer', 'scheduled_meeting']) : null, durationMin: type === 'call' ? int(5, 45) : type === 'meeting' ? int(30, 60) : null,
        emailTo: type === 'email' ? contacts.find((c) => c.id === deal.contactId)?.email ?? null : null,
      },
    });
  }
  // Upcoming meetings
  for (let i = 0; i < 10; i++) {
    const deal = deals[20 + (i % 20)];
    const due = daysAhead(int(0, 14));
    due.setHours(int(9, 16), pick([0, 30]), 0, 0);
    await prisma.activity.create({ data: { orgId: org.id, type: 'meeting', subject: pick(subjects.meeting), ownerId: deal.ownerId!, dealId: deal.id, contactId: deal.contactId, completed: false, dueAt: due, durationMin: 45 } });
  }

  // Tasks (some overdue)
  const taskTitles = ['Send updated proposal', 'Book technical deep-dive', 'Confirm budget owner', 'Share security questionnaire', 'Prepare QBR deck', 'Follow up on pricing', 'Introduce implementation partner', 'Chase signed contract'];
  for (let i = 0; i < 40; i++) {
    const deal = deals[(i * 3) % deals.length];
    const done = i % 4 === 0;
    await prisma.task.create({
      data: {
        orgId: org.id, title: pick(taskTitles), dueDate: daysAhead(int(-8, 20)), priority: pick(['low', 'medium', 'medium', 'high', 'urgent'] as const), status: done ? 'done' : pick(['todo', 'todo', 'in_progress'] as const),
        completedAt: done ? daysAgo(int(0, 10)) : null, assigneeId: deal.ownerId, createdById: deal.ownerId, dealId: deal.id, contactId: deal.contactId,
      },
    });
  }

  // Products & quotes
  const products = await Promise.all([
    ['Nimbus Starter (per seat / yr)', 'NB-START', 240], ['Nimbus Professional (per seat / yr)', 'NB-PRO', 600], ['Nimbus Enterprise (per seat / yr)', 'NB-ENT', 1200],
    ['Onboarding package', 'SVC-ONB', 4500], ['Premium support', 'SVC-SUP', 3000], ['Data migration', 'SVC-MIG', 2500],
  ].map(([name, sku, price]) => prisma.product.create({ data: { orgId: org.id, name: name as string, sku: sku as string, price: price as number } })));
  for (const [n, deal] of deals.filter((d) => d.status === 'open').slice(0, 6).entries()) {
    const items = [{ productId: products[2].id, name: products[2].name, quantity: int(10, 50), unitPrice: products[2].price, discountPct: pick([0, 5, 10]) }, { productId: products[3].id, name: products[3].name, quantity: 1, unitPrice: products[3].price, discountPct: 0 }];
    const totals = quoteTotals(items, 8, 0);
    await prisma.quote.create({
      data: {
        orgId: org.id, dealId: deal.id, number: `Q-${String(n + 1).padStart(4, '0')}`, status: pick(['draft', 'sent'] as const), taxRate: 8, currency: 'USD', ...totals,
        validUntil: daysAhead(30), lineItems: { create: items.map((li, position) => ({ ...li, total: lineTotal(li), position })) },
      },
    });
  }
  await prisma.organization.update({ where: { id: org.id }, data: { quoteCounter: 6 } });

  // Tickets
  const ticketSubjects = ['Cannot export report to CSV', 'SSO login loop', 'Invoice shows wrong currency', 'Request: bulk edit deals', 'Email sync delayed', 'API rate limit questions', 'Add new user seats', 'Dashboard loads slowly'];
  for (let i = 0; i < 12; i++) {
    const contact = contacts[(i * 5) % contacts.length];
    const priority = pick(['low', 'normal', 'normal', 'high', 'urgent'] as const);
    const created = daysAgo(int(0, 20));
    const status = pick(['open', 'open', 'pending', 'resolved', 'closed'] as const);
    await prisma.ticket.create({
      data: {
        orgId: org.id, number: i + 1, subject: ticketSubjects[i % ticketSubjects.length], description: 'Customer reported this through the help widget.',
        contactId: contact.id, companyId: contact.companyId, priority, status, channel: pick(['email', 'chat', 'phone', 'web'] as const), assigneeId: pick(sellers).id,
        createdAt: created, slaDueAt: new Date(created.getTime() + SLA_HOURS[priority] * 3600e3),
        firstResponseAt: status === 'open' ? null : new Date(created.getTime() + 2 * 3600e3), resolvedAt: ['resolved', 'closed'].includes(status) ? new Date(created.getTime() + 20 * 3600e3) : null,
      },
    });
  }
  await prisma.organization.update({ where: { id: org.id }, data: { ticketCounter: 12 } });

  // Automation & templates
  await prisma.workflow.create({ data: { orgId: org.id, name: 'Negotiation follow-up', trigger: 'deal.stage_changed', conditions: JSON.stringify([{ field: 'stage.name', operator: 'equals', value: 'Negotiation' }]), actions: JSON.stringify([{ type: 'create_task', params: { title: 'Send contract to {{company_name}}', dueInDays: '2', priority: 'high', assignee: 'owner' } }]), createdById: admin.id } });
  await prisma.workflow.create({ data: { orgId: org.id, name: 'Urgent ticket escalation', trigger: 'ticket.created', conditions: JSON.stringify([{ field: 'priority', operator: 'equals', value: 'urgent' }]), actions: JSON.stringify([{ type: 'notify_user', params: { recipient: 'manager', message: 'Urgent ticket: {{title}}' } }]), createdById: admin.id } });
  await prisma.emailTemplate.createMany({
    data: [
      { orgId: org.id, ownerId: manager.id, name: 'Intro after demo', subject: 'Great speaking today, {{first_name}}', body: 'Hi {{first_name}},\n\nThanks for your time today. As promised, here is a summary of how we can help {{company_name}}.\n\nBest,\n{{sender_name}}' },
      { orgId: org.id, ownerId: manager.id, name: 'Proposal follow-up', subject: 'Following up on the {{deal_title}} proposal', body: 'Hi {{first_name}},\n\nI wanted to check whether you had any questions on the proposal. Happy to walk your team through it.\n\n{{sender_name}}' },
    ],
  });

  console.log(`\nSeeded "${DEMO_ORG}" (separate demo organization).`);
  console.log(`Sign in with any of these — password: ${DEMO_PASSWORD}`);
  for (const u of [admin, manager, ...reps]) console.log(`  ${u.role.padEnd(8)} ${u.email}`);
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
