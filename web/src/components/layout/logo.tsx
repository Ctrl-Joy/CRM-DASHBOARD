import { cn } from '@/lib/utils';

/** The Nexora four-point star. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={cn('size-[18px] shrink-0 text-accent', className)} fill="currentColor" aria-hidden>
      <path d="M10 0c.6 5.6 4.4 9.4 10 10-5.6.6-9.4 4.4-10 10C9.4 14.4 5.6 10.6 0 10 5.6 9.4 9.4 5.6 10 0Z" />
    </svg>
  );
}
