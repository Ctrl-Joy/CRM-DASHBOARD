import type { DealRisk } from '@crm/shared';

const DAY = 864e5;
export const STALL_DAYS = 14;

interface DealLike {
  value: number; status: string; probability: number | null; stage?: { probability: number } | null;
  expectedCloseDate: Date | null; stageChangedAt: Date; lastActivityAt: Date | null; createdAt: Date;
}

export function effectiveProbability(d: DealLike) {
  if (d.status === 'won') return 100;
  if (d.status === 'lost') return 0;
  return d.probability ?? d.stage?.probability ?? 0;
}
export const weightedValue = (d: DealLike) => (d.value * effectiveProbability(d)) / 100;

/** Heuristic deal-risk flags shown on cards and used by next-best-actions. */
export function dealRisk(d: DealLike, now = Date.now()): DealRisk | null {
  if (d.status !== 'open') return null;
  const reasons: string[] = [];
  const lastTouch = (d.lastActivityAt ?? d.createdAt).getTime();
  const idle = Math.floor((now - lastTouch) / DAY);
  if (idle >= STALL_DAYS) reasons.push(`No activity in ${idle} days`);
  const inStage = Math.floor((now - d.stageChangedAt.getTime()) / DAY);
  if (inStage >= 21) reasons.push(`Stuck in stage for ${inStage} days`);
  if (d.expectedCloseDate) {
    const days = Math.floor((d.expectedCloseDate.getTime() - now) / DAY);
    if (days < 0) reasons.push(`Close date passed ${-days} day${days === -1 ? '' : 's'} ago`);
    else if (days <= 7 && effectiveProbability(d) < 50) reasons.push('Closing within a week at low probability');
  } else reasons.push('No expected close date');
  if (!reasons.length) return { level: 'low', reasons: [] };
  return { level: reasons.length >= 2 ? 'high' : 'medium', reasons };
}

export function decorateDeal<T extends DealLike>(d: T) {
  return { ...d, effectiveProbability: effectiveProbability(d), weightedValue: weightedValue(d), risk: dealRisk(d) };
}
