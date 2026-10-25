import { labelize, type DealRisk } from '@crm/shared';
import { AlertTriangle, Flame } from 'lucide-react';
import { Badge, type BadgeVariant } from '@/components/ui/display';
import { Tooltip } from '@/components/ui/overlay';
import { cn } from '@/lib/utils';

const TONES: Record<string, BadgeVariant> = {
  // leads
  new: 'default', contacted: 'warning', qualified: 'success', unqualified: 'secondary',
  // deals
  open: 'default', won: 'success', lost: 'destructive',
  // tasks / tickets
  todo: 'secondary', in_progress: 'default', done: 'success', pending: 'warning', resolved: 'success', closed: 'secondary',
  low: 'secondary', medium: 'default', normal: 'default', high: 'warning', urgent: 'destructive',
  // lifecycle & misc
  subscriber: 'secondary', lead: 'default', mql: 'purple', sql: 'purple', opportunity: 'warning', customer: 'success', evangelist: 'success',
  active: 'success', inactive: 'secondary', planned: 'secondary', paused: 'warning', completed: 'success',
  draft: 'secondary', sent: 'default', accepted: 'success', declined: 'destructive',
};

export function StatusBadge({ value, className }: { value: string | null | undefined; className?: string }) {
  if (!value) return <span className="text-muted-foreground">—</span>;
  return <Badge variant={TONES[value] ?? 'secondary'} className={className}>{labelize(value)}</Badge>;
}

export function ScoreBadge({ score }: { score: number }) {
  const tone = score >= 70 ? 'bg-destructive/15 text-destructive' : score >= 40 ? 'bg-warning/15 text-warning' : 'bg-muted text-muted-foreground';
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold tabular', tone)} aria-label={`Lead score ${score}`}>
      {score >= 70 && <Flame className="size-3" aria-hidden />}{score}
    </span>
  );
}

export function RiskFlag({ risk }: { risk: DealRisk | null | undefined }) {
  if (!risk || risk.level === 'low') return null;
  return (
    <Tooltip content={<ul className="list-disc pl-4">{risk.reasons.map((r) => <li key={r}>{r}</li>)}</ul>}>
      <span className={cn('inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] font-semibold', risk.level === 'high' ? 'bg-destructive/15 text-destructive' : 'bg-warning/15 text-warning')}
        tabIndex={0} aria-label={`${risk.level} risk: ${risk.reasons.join(', ')}`}>
        <AlertTriangle className="size-3" aria-hidden />{risk.level === 'high' ? 'At risk' : 'Watch'}
      </span>
    </Tooltip>
  );
}

export function TagChips({ tags }: { tags: { id: string; name: string; color: string }[] }) {
  if (!tags.length) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {tags.map((t) => (
        <span key={t.id} className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium">
          <span className="size-1.5 rounded-full" style={{ background: t.color }} aria-hidden />{t.name}
        </span>
      ))}
    </div>
  );
}
