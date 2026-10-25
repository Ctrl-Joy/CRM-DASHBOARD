import { Router } from 'express';
import { z } from 'zod';
import { lineTotal, productSchema, QUOTE_STATUSES, quoteSchema, quoteTotals } from '@crm/shared';
import { prisma } from '../lib/prisma';
import { badRequest, handler, notFound, parse, str } from '../lib/http';
import { me } from '../lib/auth';
import { scopeWhere } from '../lib/scope';
import { audit } from '../lib/audit';
import { resourceRouter } from '../lib/resource';
import { csvPicker } from '../lib/records';

export const productsRouter = resourceRouter({
  model: 'product',
  entityType: 'product',
  label: 'Product',
  ownerField: null,
  schema: productSchema,
  writePermission: 'products:manage',
  deletePermission: 'products:manage',
  list: {
    searchFields: ['name', 'sku', 'description'],
    filters: { active: 'bool', price: 'number' },
    sortable: ['name', 'sku', 'price', 'createdAt'],
    defaultSort: { field: 'name', order: 'asc' },
  },
  csv: [{ key: 'name', label: 'Name' }, { key: 'sku', label: 'SKU' }, { key: 'price', label: 'Price' }, { key: 'description', label: 'Description' }, { key: 'active', label: 'Active' }],
  fromCsv: (row) => {
    const p = csvPicker(row);
    return { name: p('name', 'product'), sku: p('sku', 'code'), price: p('price', 'unit price'), description: p('description') };
  },
});

// ---------- quotes ----------
export const quotesRouter = Router();
const quoteInclude = { lineItems: { orderBy: { position: 'asc' as const } } };

/** A quote is visible when its deal is. */
async function findQuote(req: Parameters<typeof me>[0], id: string) {
  const user = me(req);
  const quote = await prisma.quote.findFirst({ where: { id, orgId: user.orgId, deletedAt: null }, include: quoteInclude });
  if (!quote) throw notFound('Quote');
  const scope = await scopeWhere(user, 'ownerId');
  const deal = await prisma.deal.findFirst({
    where: { AND: [scope, { id: quote.dealId }] },
    include: { contact: true, company: true, owner: { select: { name: true, email: true } } },
  });
  if (!deal) throw notFound('Quote');
  return { quote, deal };
}

async function dealForQuote(req: Parameters<typeof me>[0], dealId: string) {
  const scope = await scopeWhere(me(req), 'ownerId');
  const deal = await prisma.deal.findFirst({ where: { AND: [scope, { id: dealId }] } });
  if (!deal) throw badRequest('Deal not found');
  return deal;
}

async function lineItemsData(orgId: string, items: z.infer<typeof quoteSchema>['lineItems']) {
  const productIds = items.map((i) => i.productId).filter((x): x is string => !!x);
  if (productIds.length) {
    const found = await prisma.product.count({ where: { id: { in: productIds }, orgId, deletedAt: null } });
    if (found !== new Set(productIds).size) throw badRequest('A selected product does not exist');
  }
  return items.map((li, position) => ({ ...li, total: lineTotal(li), position }));
}

quotesRouter.get('/', handler(async (req) => {
  const user = me(req);
  const scope = await scopeWhere(user, 'ownerId');
  const quotes = await prisma.quote.findMany({
    where: { orgId: user.orgId, deletedAt: null, deal: scope, ...(str(req.query.dealId) && { dealId: str(req.query.dealId) }), ...(str(req.query.status) && { status: str(req.query.status) }) },
    include: { deal: { select: { id: true, title: true, company: { select: { name: true } } } } },
    orderBy: { createdAt: 'desc' }, take: 200,
  });
  return { data: quotes };
}));

quotesRouter.get('/:id', handler(async (req) => {
  const { quote, deal } = await findQuote(req, req.params.id);
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: me(req).orgId }, select: { name: true } });
  return { ...quote, deal, organization: org.name };
}));

quotesRouter.post('/', handler(async (req, res) => {
  const user = me(req);
  const input = parse(quoteSchema, req.body);
  const deal = await dealForQuote(req, input.dealId);
  const items = await lineItemsData(user.orgId, input.lineItems);
  const totals = quoteTotals(items, input.taxRate, input.discount);
  const org = await prisma.organization.update({ where: { id: user.orgId }, data: { quoteCounter: { increment: 1 } } });
  const quote = await prisma.quote.create({
    data: {
      orgId: user.orgId, dealId: deal.id, number: `Q-${String(org.quoteCounter).padStart(4, '0')}`, status: input.status,
      taxRate: input.taxRate, validUntil: input.validUntil, notes: input.notes, currency: deal.currency, ...totals,
      lineItems: { create: items },
    },
    include: quoteInclude,
  });
  await audit(req, 'create', 'quote', quote.id, { total: quote.total });
  res.status(201);
  return quote;
}));

quotesRouter.put('/:id', handler(async (req) => {
  const user = me(req);
  const { quote } = await findQuote(req, req.params.id);
  const input = parse(quoteSchema, req.body);
  if (input.dealId !== quote.dealId) throw badRequest("A quote can't move to another deal");
  const items = await lineItemsData(user.orgId, input.lineItems);
  const totals = quoteTotals(items, input.taxRate, input.discount);
  const updated = await prisma.$transaction(async (tx) => {
    await tx.quoteLineItem.deleteMany({ where: { quoteId: quote.id } });
    return tx.quote.update({
      where: { id: quote.id },
      data: { status: input.status, taxRate: input.taxRate, validUntil: input.validUntil, notes: input.notes, ...totals, lineItems: { create: items } },
      include: quoteInclude,
    });
  });
  await audit(req, 'update', 'quote', quote.id, { total: { from: quote.total, to: updated.total } });
  return updated;
}));

quotesRouter.post('/:id/status', handler(async (req) => {
  const { quote } = await findQuote(req, req.params.id);
  const { status, syncDealValue } = parse(z.object({ status: z.enum(QUOTE_STATUSES), syncDealValue: z.boolean().default(false) }), req.body);
  const updated = await prisma.quote.update({ where: { id: quote.id }, data: { status }, include: quoteInclude });
  if (status === 'accepted' && syncDealValue) await prisma.deal.update({ where: { id: quote.dealId }, data: { value: quote.total } });
  await audit(req, 'update', 'quote', quote.id, { status: { from: quote.status, to: status } });
  return updated;
}));

quotesRouter.delete('/:id', handler(async (req) => {
  const { quote } = await findQuote(req, req.params.id);
  await prisma.quote.update({ where: { id: quote.id }, data: { deletedAt: new Date() } });
  await audit(req, 'delete', 'quote', quote.id);
  return { ok: true };
}));
