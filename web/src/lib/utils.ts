import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { differenceInCalendarDays, format, formatDistanceToNowStrict, isToday, isTomorrow, isYesterday } from 'date-fns';

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

export function money(n: number | null | undefined, currency = 'USD', compact = false) {
  const v = n ?? 0;
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency, maximumFractionDigits: compact || Math.abs(v) >= 1000 ? 0 : 2,
    ...(compact && Math.abs(v) >= 10000 && { notation: 'compact', maximumFractionDigits: 1 }),
  }).format(v);
}
export const num = (n: number | null | undefined, digits = 0) =>
  new Intl.NumberFormat('en-US', { maximumFractionDigits: digits }).format(n ?? 0);
export const pct = (n: number | null | undefined, digits = 0) => `${num(n, digits)}%`;

export function day(d: string | Date | null | undefined) {
  if (!d) return '—';
  const date = new Date(d);
  if (isToday(date)) return 'Today';
  if (isTomorrow(date)) return 'Tomorrow';
  if (isYesterday(date)) return 'Yesterday';
  return format(date, date.getFullYear() === new Date().getFullYear() ? 'd MMM' : 'd MMM yyyy');
}
export const dateTime = (d: string | Date | null | undefined) => (d ? format(new Date(d), 'd MMM yyyy, HH:mm') : '—');
export const ago = (d: string | Date | null | undefined) => (d ? `${formatDistanceToNowStrict(new Date(d))} ago` : '—');
export const daysUntil = (d: string | Date) => differenceInCalendarDays(new Date(d), new Date());
export const isOverdue = (d: string | Date | null | undefined) => !!d && new Date(d).getTime() < Date.now() && !isToday(new Date(d));

/** yyyy-MM-dd for <input type="date">. */
export const toDateInput = (d: string | Date | null | undefined) => (d ? format(new Date(d), 'yyyy-MM-dd') : '');
export const toDateTimeInput = (d: string | Date | null | undefined) => (d ? format(new Date(d), "yyyy-MM-dd'T'HH:mm") : '');

export const fullName = (p: { firstName: string; lastName?: string | null } | null | undefined) =>
  p ? [p.firstName, p.lastName].filter(Boolean).join(' ') : '';
export const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || '?';

const AVATAR_HUES = [221, 160, 32, 280, 350, 190, 100, 0];
export const avatarHue = (s: string) => AVATAR_HUES[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_HUES.length];

export const plural = (n: number, word: string) => `${num(n)} ${word}${n === 1 ? '' : 's'}`;
