// Pure business calculations used by both the server (source of truth) and the
// client (instant previews).

export interface LineItemInput { quantity: number; unitPrice: number; discountPct?: number | null }

export function lineTotal(li: LineItemInput) {
  const gross = li.quantity * li.unitPrice;
  return round2(gross - gross * ((li.discountPct ?? 0) / 100));
}

/** Quote totals: discount is a flat amount taken off the subtotal before tax. */
export function quoteTotals(items: LineItemInput[], taxRatePct: number, discount: number) {
  const subtotal = round2(items.reduce((s, li) => s + lineTotal(li), 0));
  const taxable = Math.max(0, subtotal - discount);
  const tax = round2(taxable * (taxRatePct / 100));
  return { subtotal, discount: round2(Math.min(discount, subtotal)), tax, total: round2(taxable + tax) };
}

export const round2 = (n: number) => Math.round(n * 100) / 100;

/** Replace {{merge_tags}} in a template. Unknown tags are left blank. */
export function renderTemplate(template: string, vars: Record<string, string | number | null | undefined>) {
  return template.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (_, key: string) => {
    const v = vars[key.toLowerCase()];
    return v == null ? '' : String(v);
  });
}

export const MERGE_TAGS = [
  { tag: 'first_name', label: 'Contact first name' },
  { tag: 'last_name', label: 'Contact last name' },
  { tag: 'full_name', label: 'Contact full name' },
  { tag: 'email', label: 'Contact email' },
  { tag: 'title', label: 'Contact job title' },
  { tag: 'company_name', label: 'Company name' },
  { tag: 'deal_title', label: 'Deal title' },
  { tag: 'deal_value', label: 'Deal value' },
  { tag: 'sender_name', label: 'Your name' },
  { tag: 'sender_email', label: 'Your email' },
] as const;
