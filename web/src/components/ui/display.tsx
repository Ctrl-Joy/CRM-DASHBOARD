import * as React from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import { cva, type VariantProps } from 'class-variance-authority';
import type { LucideIcon } from 'lucide-react';
import { avatarHue, cn, initials } from '@/lib/utils';

// ---------- Card ----------
export const Card = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) =>
  <div className={cn('rounded-xl border bg-card text-card-foreground shadow-sm', className)} {...props} />;

export function CardHeader({ title, description, action, className, icon: Icon }: {
  title: React.ReactNode; description?: React.ReactNode; action?: React.ReactNode; className?: string; icon?: LucideIcon;
}) {
  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-x-3 gap-y-2 px-5 pt-4', className)}>
      <div className="min-w-0">
        <h2 className="flex items-center gap-2 text-sm font-semibold">{Icon && <Icon className="size-4 text-muted-foreground" aria-hidden />}{title}</h2>
        {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
      </div>
      {action && <div className="flex shrink-0 items-center gap-1">{action}</div>}
    </div>
  );
}
export const CardBody = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div className={cn('px-5 pb-5 pt-3', className)} {...props} />;

// ---------- Badge ----------
const badgeVariants = cva('inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium', {
  variants: {
    variant: {
      default: 'border-transparent bg-accent/15 text-foreground',
      secondary: 'border-transparent bg-secondary text-secondary-foreground',
      outline: 'text-foreground',
      success: 'border-transparent bg-success/15 text-success',
      warning: 'border-transparent bg-warning/15 text-warning',
      destructive: 'border-transparent bg-destructive/15 text-destructive',
      purple: 'border-transparent bg-chart-4/15 text-chart-4',
    },
  },
  defaultVariants: { variant: 'default' },
});
export type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>['variant']>;
export const Badge = ({ className, variant, ...props }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) =>
  <span className={cn(badgeVariants({ variant }), className)} {...props} />;

// ---------- Avatar ----------
export function Avatar({ name, src, size = 'md', className }: { name: string; src?: string | null; size?: 'xs' | 'sm' | 'md' | 'lg'; className?: string }) {
  const sz = { xs: 'size-5 text-[9px]', sm: 'size-7 text-[11px]', md: 'size-9 text-xs', lg: 'size-12 text-base' }[size];
  if (src) return <img src={src} alt="" className={cn('shrink-0 rounded-full object-cover', sz, className)} />;
  const hue = avatarHue(name);
  return (
    <span aria-hidden className={cn('inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold', sz, className)}
      style={{ background: `hsl(${hue} 70% 92%)`, color: `hsl(${hue} 60% 30%)` }}>
      {initials(name)}
    </span>
  );
}

// ---------- Skeleton / Empty / Error ----------
export const Skeleton = ({ className }: { className?: string }) => <div className={cn('animate-pulse rounded-md bg-muted', className)} aria-hidden />;

export function EmptyState({ icon: Icon, title, description, action, className }: {
  icon: LucideIcon; title: string; description?: React.ReactNode; action?: React.ReactNode; className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-12 text-center', className)}>
      <div className="mb-3 rounded-full bg-muted p-3"><Icon className="size-6 text-muted-foreground" aria-hidden /></div>
      <p className="font-semibold">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-4 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}

// ---------- Page header ----------
export function PageHeader({ title, description, actions, children }: { title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
      <div className="min-w-0 sm:shrink-0">
        <h1 className="font-display text-3xl leading-tight tracking-tight sm:text-4xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        {children}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

// ---------- Tabs ----------
export const Tabs = TabsPrimitive.Root;
export const TabsList = ({ className, ...props }: React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>) =>
  <TabsPrimitive.List className={cn('inline-flex h-9 max-w-full items-center gap-1 overflow-x-auto rounded-lg bg-muted p-1 text-muted-foreground scrollbar-thin', className)} {...props} />;
export const TabsTrigger = ({ className, ...props }: React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>) =>
  <TabsPrimitive.Trigger className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm [&_svg]:size-3.5', className)} {...props} />;
export const TabsContent = ({ className, ...props }: React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>) =>
  <TabsPrimitive.Content className={cn('mt-4 focus-visible:outline-none', className)} {...props} />;

// ---------- Key/value list ----------
export function DetailList({ items, className }: { items: { label: string; value: React.ReactNode }[]; className?: string }) {
  return (
    <dl className={cn('grid grid-cols-1 gap-x-4 gap-y-3 text-sm sm:grid-cols-2', className)}>
      {items.map((it) => (
        <div key={it.label} className="min-w-0">
          <dt className="text-xs text-muted-foreground">{it.label}</dt>
          <dd className="mt-0.5 truncate font-medium">{it.value ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Progress({ value, className, tone = 'primary' }: { value: number; className?: string; tone?: 'primary' | 'success' | 'warning' | 'destructive' }) {
  const bg = { primary: 'bg-primary', success: 'bg-success', warning: 'bg-warning', destructive: 'bg-destructive' }[tone];
  return (
    <div className={cn('h-2 w-full overflow-hidden rounded-full bg-muted', className)} role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}>
      <div className={cn('h-full rounded-full transition-all', bg)} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}
