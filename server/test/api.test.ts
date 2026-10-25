import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/lib/prisma';

const app = createApp();
type Agent = ReturnType<typeof request.agent>;
const H = { 'X-Requested-With': 'XMLHttpRequest' };
let n = 0;
const email = (p: string) => `${p}${++n}-${Date.now()}@example.test`;

async function signup(company = 'Acme') {
  const agent = request.agent(app);
  await agent.post('/api/auth/signup').set(H).send({ name: 'Ada Admin', email: email('admin'), password: 'correct-horse', company }).expect(201);
  return agent;
}
async function invite(admin: Agent, role: 'rep' | 'manager', extra: Record<string, unknown> = {}) {
  const e = email(role);
  const res = await admin.post('/api/users').set(H).send({ name: `${role} user`, email: e, role, password: 'temporary-pass', ...extra }).expect(201);
  const agent = request.agent(app);
  await agent.post('/api/auth/login').set(H).send({ email: e, password: 'temporary-pass' }).expect(200);
  return { agent, id: res.body.id as string };
}

describe('new organization', () => {
  it('starts completely empty apart from one default pipeline', async () => {
    const a = await signup();
    const me = (await a.get('/api/auth/me').expect(200)).body;
    expect(me.role).toBe('admin');
    for (const path of ['contacts', 'companies', 'leads', 'deals', 'tasks', 'activities', 'tickets', 'products', 'campaigns']) {
      expect((await a.get(`/api/${path}`).expect(200)).body.total, path).toBe(0);
    }
    const pipelines = (await a.get('/api/pipelines').expect(200)).body.data;
    expect(pipelines).toHaveLength(1);
    expect(pipelines[0].stages.length).toBeGreaterThan(0);
    const dash = (await a.get('/api/dashboard').expect(200)).body;
    expect(dash.kpis.every((k: { value: number }) => k.value === 0)).toBe(true);
    expect(dash.actions).toEqual([]);
    expect(dash.activity).toEqual([]);
  });

  it('rejects cookie-authenticated writes without the CSRF header', async () => {
    const a = await signup();
    await a.post('/api/contacts').send({ firstName: 'X' }).expect(403);
  });
});

describe('RBAC and ownership', () => {
  let admin: Agent, repA: Agent, repB: Agent, repBId: string;
  beforeAll(async () => {
    admin = await signup();
    repA = (await invite(admin, 'rep')).agent;
    const b = await invite(admin, 'rep');
    repB = b.agent; repBId = b.id;
  });

  it("reps only see their own records; admins see everything", async () => {
    const c = (await repA.post('/api/contacts').set(H).send({ firstName: 'Priya', email: 'priya@acme.test' }).expect(201)).body;
    await repB.get(`/api/contacts/${c.id}`).expect(404);
    expect((await repB.get('/api/contacts').expect(200)).body.total).toBe(0);
    await admin.get(`/api/contacts/${c.id}`).expect(200);
    await repB.patch(`/api/contacts/${c.id}`).set(H).send({ title: 'x' }).expect(404);
  });

  it('reps cannot delete, export-by-default works, and reassignment is restricted', async () => {
    const c = (await repA.post('/api/contacts').set(H).send({ firstName: 'Tom' }).expect(201)).body;
    await repA.delete(`/api/contacts/${c.id}`).set(H).expect(403);
    await repA.post('/api/contacts').set(H).send({ firstName: 'Z', ownerId: repBId }).expect(403);
    await repA.get('/api/contacts/export').expect(200);
    await admin.delete(`/api/contacts/${c.id}`).set(H).expect(200);
    await admin.get(`/api/contacts/${c.id}`).expect(404); // soft-deleted
  });

  it('team dashboards require permission', async () => {
    await repA.get('/api/dashboard?view=team').expect(403);
    await admin.get('/api/dashboard?view=team').expect(200);
  });

  it('users from another organization cannot read records', async () => {
    const other = await signup('Globex');
    const c = (await admin.post('/api/contacts').set(H).send({ firstName: 'Secret' }).expect(201)).body;
    await other.get(`/api/contacts/${c.id}`).expect(404);
  });
});

describe('pipeline, automation and forecasting', () => {
  it('records stage history and runs a stage-change workflow', async () => {
    const a = await signup();
    const pipeline = (await a.get('/api/pipelines')).body.data[0];
    const [first, , , negotiation] = pipeline.stages;
    await a.post('/api/workflows').set(H).send({
      name: 'Negotiation follow-up', trigger: 'deal.stage_changed',
      conditions: [{ field: 'stage.name', operator: 'equals', value: negotiation.name }],
      actions: [{ type: 'create_task', params: { title: 'Send contract for {{name}}', dueInDays: '2', priority: 'high' } }],
    }).expect(201);
    const deal = (await a.post('/api/deals').set(H).send({ title: 'Big deal', value: 10000, pipelineId: pipeline.id, stageId: first.id }).expect(201)).body;
    expect(deal.weightedValue).toBe(10000 * first.probability / 100);
    await a.patch(`/api/deals/${deal.id}`).set(H).send({ stageId: negotiation.id }).expect(200);
    const overview = (await a.get(`/api/deals/${deal.id}/overview`).expect(200)).body;
    expect(overview.history.map((h: { toStage: { name: string } }) => h.toStage.name)).toEqual([negotiation.name, first.name]);
    const tasks = (await a.get(`/api/tasks?dealId=${deal.id}`).expect(200)).body.data;
    expect(tasks[0].title).toBe('Send contract for Big deal');
    await a.post(`/api/deals/${deal.id}/close`).set(H).send({ status: 'lost' }).expect(400);
    const won = (await a.post(`/api/deals/${deal.id}/close`).set(H).send({ status: 'won' }).expect(200)).body;
    expect(won.status).toBe('won');
    const dash = (await a.get('/api/dashboard').expect(200)).body;
    expect(dash.kpis.find((k: { key: string }) => k.key === 'revenue').value).toBe(10000);
  });

  it('rejects a stage from a different pipeline', async () => {
    const a = await signup();
    const p1 = (await a.get('/api/pipelines')).body.data[0];
    const p2 = (await a.post('/api/pipelines').set(H).send({ name: 'Renewals', stages: [{ name: 'Up for renewal', probability: 50 }] }).expect(201)).body;
    await a.post('/api/deals').set(H).send({ title: 'x', pipelineId: p1.id, stageId: p2.stages[0].id }).expect(400);
  });
});

describe('leads', () => {
  it('scores, converts to contact + company + deal, and keeps history', async () => {
    const a = await signup();
    const lead = (await a.post('/api/leads').set(H).send({
      firstName: 'Lina', lastName: 'Park', email: 'lina@initech.test', title: 'VP Sales', companyName: 'Initech', companySize: '201-500', source: 'referral',
    }).expect(201)).body;
    const fresh = (await a.get(`/api/leads/${lead.id}`)).body;
    expect(fresh.score).toBeGreaterThanOrEqual(60);
    await a.post('/api/activities').set(H).send({ type: 'call', subject: 'Intro call', leadId: lead.id, outcome: 'connected' }).expect(201);
    const contacted = (await a.get(`/api/leads/${lead.id}`)).body;
    expect(contacted.status).toBe('contacted');
    expect(contacted.firstResponseAt).toBeTruthy();
    const conv = (await a.post(`/api/leads/${lead.id}/convert`).set(H).send({ createDeal: true, value: 25000 }).expect(200)).body;
    const contact = (await a.get(`/api/contacts/${conv.contactId}/overview`).expect(200)).body;
    expect(contact.contact.company.name).toBe('Initech');
    expect(contact.deals[0].value).toBe(25000);
    expect(contact.activities.some((x: { subject: string }) => x.subject === 'Intro call')).toBe(true);
    await a.post(`/api/leads/${lead.id}/convert`).set(H).send({}).expect(400);
  });

  it('captures public leads and auto-assigns them round-robin', async () => {
    const a = await signup();
    const r1 = await invite(a, 'rep');
    const r2 = await invite(a, 'rep');
    const key = (await a.get('/api/auth/me')).body.org.leadApiKey;
    const owners = [];
    for (let i = 0; i < 4; i++) {
      const res = await request(app).post(`/api/public/leads/${key}`).send({ firstName: `Web${i}`, email: `web${i}@corp.test` }).expect(201);
      owners.push((await prisma.lead.findUniqueOrThrow({ where: { id: res.body.id } })).ownerId);
    }
    expect(new Set(owners)).toEqual(new Set([r1.id, r2.id]));
    expect(owners[0]).not.toBe(owners[1]);
    await request(app).post('/api/public/leads/not-a-key').send({ firstName: 'x', email: 'x@y.test' }).expect(404);
  });
});

describe('quotes and tickets', () => {
  it('computes quote totals server-side', async () => {
    const a = await signup();
    const p = (await a.get('/api/pipelines')).body.data[0];
    const deal = (await a.post('/api/deals').set(H).send({ title: 'Q', pipelineId: p.id, stageId: p.stages[0].id }).expect(201)).body;
    const quote = (await a.post('/api/quotes').set(H).send({
      dealId: deal.id, taxRate: 10, discount: 100,
      lineItems: [{ name: 'Seats', quantity: 10, unitPrice: 50, discountPct: 10 }, { name: 'Onboarding', quantity: 1, unitPrice: 600 }],
    }).expect(201)).body;
    // 10*50 -10% = 450; +600 = 1050; -100 = 950; +10% tax = 1045
    expect([quote.subtotal, quote.tax, quote.total, quote.number]).toEqual([1050, 95, 1045, 'Q-0001']);
  });

  it('numbers tickets and sets SLA from priority', async () => {
    const a = await signup();
    const t1 = (await a.post('/api/tickets').set(H).send({ subject: 'Login broken', priority: 'urgent' }).expect(201)).body;
    const t2 = (await a.post('/api/tickets').set(H).send({ subject: 'Question' }).expect(201)).body;
    expect([t1.number, t2.number]).toEqual([1, 2]);
    const hours = (new Date(t1.slaDueAt).getTime() - new Date(t1.createdAt).getTime()) / 3600e3;
    expect(Math.round(hours)).toBe(4);
    const resolved = (await a.patch(`/api/tickets/${t1.id}`).set(H).send({ status: 'resolved' }).expect(200)).body;
    expect(resolved.resolvedAt).toBeTruthy();
  });
});
