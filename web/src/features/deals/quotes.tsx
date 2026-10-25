import * as React from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Package, Plus, Printer, Trash2 } from 'lucide-react';
import { QUOTE_STATUSES, quoteSchema, quoteTotals, type Paginated, type Product, type Quote } from '@crm/shared';
import { api, ApiError } from '@/lib/api';
import { day, fullName, money, toDateInput } from '@/lib/utils';
import { useAction, useCan } from '@/hooks/data';
import { Button } from '@/components/ui/button';
import { Badge, Card, CardBody, CardHeader, EmptyState, PageHeader, Skeleton } from '@/components/ui/display';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/overlay';
import { ListPage, type Column } from '@/components/data/list-page';
import { StatusBadge } from '@/components/records/badges';
import { EntityFormDialog } from '@/features/forms';

type Line = { productId: string | null; name: string; quantity: string; unitPrice: string; discountPct: string };
const blankLine = (): Line => ({ productId: null, name: '', quantity: '1', unitPrice: '0', discountPct: '0' });

export function QuoteEditor({ open, onOpenChange, dealId, currency, quote, invalidate }: {
  open: boolean; onOpenChange: (o: boolean) => void; dealId: string; currency: string; quote?: Quote; invalidate: unknown[][];
}) {
  const { data: products = [] } = useQuery({
    queryKey: ['/products', 'catalog'], queryFn: () => api.get<Paginated<Product>>('/products', { active: 'true', pageSize: 100 }).then((r) => r.data), enabled: open,
  });
  const [lines, setLines] = React.useState<Line[]>([blankLine()]);
  const [meta, setMeta] = React.useState({ taxRate: '0', discount: '0', validUntil: '', notes: '', status: 'draft' });
  const [error, setError] = React.useState('');
  React.useEffect(() => {
    if (!open) return;
    setError('');
    if (quote) {
      setLines(quote.lineItems.map((li) => ({ productId: li.productId, name: li.name, quantity: String(li.quantity), unitPrice: String(li.unitPrice), discountPct: String(li.discountPct) })));
      setMeta({ taxRate: String(quote.taxRate), discount: String(quote.discount), validUntil: toDateInput(quote.validUntil), notes: quote.notes ?? '', status: quote.status });
    } else {
      setLines([blankLine()]);
      setMeta({ taxRate: '0', discount: '0', validUntil: toDateInput(new Date(Date.now() + 30 * 864e5)), notes: '', status: 'draft' });
    }
  }, [open, quote]);
  const parsed = lines.map((l) => ({ quantity: Number(l.quantity) || 0, unitPrice: Number(l.unitPrice) || 0, discountPct: Number(l.discountPct) || 0 }));
  const totals = quoteTotals(parsed, Number(meta.taxRate) || 0, Number(meta.discount) || 0);
  const save = useAction(async () => {
    const body = { dealId, ...meta, validUntil: meta.validUntil || null, lineItems: lines.map((l) => ({ ...l, productId: l.productId || null })) };
    const r = quoteSchema.safeParse(body);
    if (!r.success) throw new ApiError(400, r.error.issues[0].message);
    return quote ? api.put(`/quotes/${quote.id}`, body) : api.post('/quotes', body);
  }, { success: quote ? 'Quote updated' : 'Quote created', invalidate, onSuccess: () => onOpenChange(false) });
  const set = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={quote ? `Edit ${quote.number}` : 'New quote'} size="xl">
        {error && <p role="alert" className="mb-3 text-sm text-destructive">{error}</p>}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-left text-xs text-muted-foreground"><tr><th className="pb-2">Item</th><th className="w-20 pb-2">Qty</th><th className="w-28 pb-2">Unit price</th><th className="w-20 pb-2">Disc. %</th><th className="w-28 pb-2 text-right">Total</th><th className="w-8" /></tr></thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i} className="align-top">
                  <td className="py-1 pr-2">
                    <div className="flex gap-1">
                      <Select aria-label="Product" className="w-36 shrink-0" value={l.productId ?? ''} onChange={(e) => {
                        const p = products.find((x) => x.id === e.target.value);
                        set(i, p ? { productId: p.id, name: p.name, unitPrice: String(p.price) } : { productId: null });
                      }}>
                        <option value="">Custom item</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </Select>
                      <Input aria-label="Item name" value={l.name} onChange={(e) => set(i, { name: e.target.value })} placeholder="Description" />
                    </div>
                  </td>
                  <td className="py-1 pr-2"><Input aria-label="Quantity" type="number" min={0} step="any" value={l.quantity} onChange={(e) => set(i, { quantity: e.target.value })} /></td>
                  <td className="py-1 pr-2"><Input aria-label="Unit price" type="number" min={0} step="any" value={l.unitPrice} onChange={(e) => set(i, { unitPrice: e.target.value })} /></td>
                  <td className="py-1 pr-2"><Input aria-label="Discount percent" type="number" min={0} max={100} value={l.discountPct} onChange={(e) => set(i, { discountPct: e.target.value })} /></td>
                  <td className="py-3 text-right font-medium tabular">{money(quoteTotals([parsed[i]], 0, 0).subtotal, currency)}</td>
                  <td className="py-1 pl-1"><Button variant="ghost" size="icon-sm" aria-label="Remove line" disabled={lines.length === 1} onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}><Trash2 /></Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Button variant="ghost" size="sm" className="mt-1" onClick={() => setLines((ls) => [...ls, blankLine()])}><Plus />Add line</Button>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Tax %"><Input type="number" min={0} max={100} value={meta.taxRate} onChange={(e) => setMeta({ ...meta, taxRate: e.target.value })} /></Field>
            <Field label={`Discount (${currency})`}><Input type="number" min={0} value={meta.discount} onChange={(e) => setMeta({ ...meta, discount: e.target.value })} /></Field>
            <Field label="Valid until"><Input type="date" value={meta.validUntil} onChange={(e) => setMeta({ ...meta, validUntil: e.target.value })} /></Field>
            <Field label="Status"><Select value={meta.status} onChange={(e) => setMeta({ ...meta, status: e.target.value })}>{QUOTE_STATUSES.map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}</Select></Field>
            <Field label="Notes / terms" className="col-span-2"><Textarea rows={3} value={meta.notes} onChange={(e) => setMeta({ ...meta, notes: e.target.value })} /></Field>
          </div>
          <dl className="space-y-2 self-end rounded-lg bg-muted/50 p-4 text-sm">
            {[['Subtotal', totals.subtotal], ['Discount', totals.discount ? -totals.discount : 0],[`Tax (${meta.taxRate || 0}%)`, totals.tax]].map(([l, v]) => (
              <div key={l as string} className="flex justify-between"><dt className="text-muted-foreground">{l}</dt><dd className="tabular">{money(v as number, currency)}</dd></div>
            ))}
            <div className="flex justify-between border-t pt-2 text-base font-semibold"><dt>Total</dt><dd className="tabular">{money(totals.total, currency)}</dd></div>
          </dl>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button loading={save.isPending} onClick={() => save.mutate(undefined, { onError: (e) => setError(e.message) })}>{quote ? 'Save quote' : 'Create quote'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function QuotesPanel({ dealId, currency, quotes, invalidate }: { dealId: string; currency: string; quotes: Quote[]; invalidate: unknown[][] }) {
  const [editing, setEditing] = React.useState<Quote | null | 'new'>(null);
  const status = useAction((v: { id: string; status: string; sync?: boolean }) => api.post(`/quotes/${v.id}/status`, { status: v.status, syncDealValue: !!v.sync }), { success: 'Quote updated', invalidate });
  return (
    <div>
      <div className="mb-3 flex justify-end"><Button size="sm" variant="outline" onClick={() => setEditing('new')}><Plus />New quote</Button></div>
      {quotes.length === 0 ? <EmptyState icon={Package} title="No quotes yet" description="Build a quote from your product catalog with automatic totals." className="py-6" /> : (
        <ul className="divide-y">
          {quotes.map((q) => (
            <li key={q.id} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
              <button className="font-medium hover:underline" onClick={() => setEditing(q)}>{q.number}</button>
              <StatusBadge value={q.status} />
              <span className="text-xs text-muted-foreground">{q.lineItems.length} items · valid until {day(q.validUntil)}</span>
              <span className="ml-auto font-semibold tabular">{money(q.total, currency)}</span>
              {q.status !== 'accepted' && <Button size="sm" variant="ghost" onClick={() => status.mutate({ id: q.id, status: 'accepted', sync: true })}>Mark accepted</Button>}
              <Button size="sm" variant="ghost" asChild><Link to={`/quotes/${q.id}/print`} target="_blank"><Printer />PDF</Link></Button>
            </li>
          ))}
        </ul>
      )}
      <QuoteEditor open={editing !== null} onOpenChange={(o) => !o && setEditing(null)} dealId={dealId} currency={currency}
        quote={editing && editing !== 'new' ? editing : undefined} invalidate={invalidate} />
    </div>
  );
}

/** Printable quote; the browser's "Save as PDF" produces the PDF. */
export function QuotePrintPage() {
  const { id } = useParams();
  const { data: q, isLoading, isError } = useQuery({ queryKey: ['quote-print', id], queryFn: () => api.get<Quote & { organization: string }>(`/quotes/${id}`) });
  React.useEffect(() => { document.documentElement.classList.remove('dark'); }, []);
  if (isLoading) return <div className="p-10"><Skeleton className="h-96" /></div>;
  if (isError || !q) return <p className="p-10 text-center">Quote not found.</p>;
  const deal = q.deal!;
  return (
    <div className="min-h-dvh bg-white text-slate-900">
      <div className="no-print sticky top-0 flex justify-end gap-2 border-b bg-white p-3">
        <Button variant="outline" onClick={() => window.close()}>Close</Button>
        <Button onClick={() => window.print()}><Printer />Print / Save as PDF</Button>
      </div>
      <article className="mx-auto max-w-3xl p-10">
        <header className="flex items-start justify-between">
          <div><p className="mb-1 text-2xl text-accent" aria-hidden>✦</p><p className="text-lg font-bold">{q.organization}</p></div>
          <div className="text-right"><p className="text-3xl font-bold">QUOTE</p><p className="text-slate-500">{q.number}</p><p className="mt-2 text-sm">Date: {day(q.createdAt)}</p><p className="text-sm">Valid until: {day(q.validUntil)}</p></div>
        </header>
        <section className="mt-10 text-sm">
          <p className="text-xs font-semibold uppercase text-slate-500">Prepared for</p>
          <p className="font-semibold">{deal.company?.name ?? (deal.contact ? fullName(deal.contact) : deal.title)}</p>
          {deal.contact && <p>{fullName(deal.contact)}{deal.contact.email && ` · ${deal.contact.email}`}</p>}
          <p className="mt-1 text-slate-500">Re: {deal.title}</p>
        </section>
        <table className="mt-8 w-full text-sm">
          <thead><tr className="border-b-2 border-slate-900 text-left"><th className="py-2">Item</th><th className="py-2 text-right">Qty</th><th className="py-2 text-right">Unit price</th><th className="py-2 text-right">Disc.</th><th className="py-2 text-right">Amount</th></tr></thead>
          <tbody>{q.lineItems.map((li) => (
            <tr key={li.id} className="border-b"><td className="py-2">{li.name}</td><td className="py-2 text-right">{li.quantity}</td><td className="py-2 text-right">{money(li.unitPrice, q.currency)}</td><td className="py-2 text-right">{li.discountPct ? `${li.discountPct}%` : '—'}</td><td className="py-2 text-right">{money(li.total, q.currency)}</td></tr>
          ))}</tbody>
        </table>
        <dl className="ml-auto mt-6 w-64 space-y-1 text-sm">
          <div className="flex justify-between"><dt>Subtotal</dt><dd>{money(q.subtotal, q.currency)}</dd></div>
          {q.discount > 0 && <div className="flex justify-between"><dt>Discount</dt><dd>−{money(q.discount, q.currency)}</dd></div>}
          <div className="flex justify-between"><dt>Tax ({q.taxRate}%)</dt><dd>{money(q.tax, q.currency)}</dd></div>
          <div className="flex justify-between border-t-2 border-slate-900 pt-2 text-base font-bold"><dt>Total</dt><dd>{money(q.total, q.currency)}</dd></div>
        </dl>
        {q.notes && <section className="mt-10 text-sm"><p className="text-xs font-semibold uppercase text-slate-500">Notes & terms</p><p className="whitespace-pre-wrap">{q.notes}</p></section>}
      </article>
    </div>
  );
}

const productColumns: Column<Product>[] = [
  { key: 'name', header: 'Product', sortKey: 'name', cell: (p) => p.name },
  { key: 'sku', header: 'SKU', sortKey: 'sku', cell: (p) => p.sku ?? '—', hideBelow: 'sm' },
  { key: 'price', header: 'Price', sortKey: 'price', cell: (p) => <span className="tabular">{money(p.price)}</span> },
  { key: 'active', header: 'Status', cell: (p) => <Badge variant={p.active ? 'success' : 'secondary'}>{p.active ? 'Active' : 'Archived'}</Badge> },
  { key: 'description', header: 'Description', cell: (p) => <span className="line-clamp-1 text-muted-foreground">{p.description ?? ''}</span>, hideBelow: 'md' },
];

export function ProductsPage() {
  const can = useCan();
  const [editing, setEditing] = React.useState<Product | null | 'new'>(null);
  const { data: quotes } = useQuery({ queryKey: ['/quotes'], queryFn: () => api.get<{ data: (Quote & { deal: { id: string; title: string; company: { name: string } | null } })[] }>('/quotes') });
  return (
    <>
      <PageHeader title="Products & quotes" description="Your catalog, and every quote sent from a deal."
        actions={can('products:manage') && <Button onClick={() => setEditing('new')}><Plus />New product</Button>} />
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <ListPage<Product> entityType="product" path="/products" columns={can('products:manage') ? [...productColumns, {
            key: 'edit', header: '', cell: (p) => <Button size="sm" variant="ghost" onClick={() => setEditing(p)}>Edit</Button>,
          }] : productColumns}
            importable={{ columns: 'Name, SKU, Price, Description' }}
            empty={{ icon: Package, title: 'No products yet', description: 'Add products to build quotes from deals.', action: can('products:manage') ? <Button onClick={() => setEditing('new')}><Plus />Add product</Button> : undefined }} />
        </div>
        <Card>
          <CardHeader title="Recent quotes" />
          <CardBody>
            {!quotes?.data.length ? <p className="text-sm text-muted-foreground">Create quotes from a deal's Quotes tab.</p> : (
              <ul className="divide-y">{quotes.data.slice(0, 15).map((q) => (
                <li key={q.id} className="flex items-center gap-2 py-2 text-sm">
                  <Link to={`/deals/${q.deal.id}`} className="min-w-0 flex-1 truncate hover:underline">{q.number} · {q.deal.company?.name ?? q.deal.title}</Link>
                  <StatusBadge value={q.status} /><span className="font-medium tabular">{money(q.total, q.currency)}</span>
                </li>
              ))}</ul>
            )}
          </CardBody>
        </Card>
      </div>
      <EntityFormDialog kind="product" open={editing !== null} onOpenChange={(o) => !o && setEditing(null)} record={editing && editing !== 'new' ? editing : undefined} />
    </>
  );
}
