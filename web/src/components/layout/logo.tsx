import { cn } from '@/lib/utils';

/** The Nexora NX mark. It takes the text colour, so it is black in light mode and white in dark mode. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="476 366 582 250" className={cn('h-4 w-[37px] shrink-0 text-foreground', className)} fill="currentColor" aria-hidden>
      <path d="M482 610 L482 410 Q482 378 516 378 Q534 378 552 392 L762 545 L960 372 L1052 372 L796 596 Q780 610 760 610 Q740 610 724 597 L543 447 L543 610 Z" />
      <path d="M682 372 L768 372 Q786 372 800 385 L858 437 L810 477 Z" />
      <path d="M878 546 L932 502 L1052 610 L946 610 Z" />
    </svg>
  );
}
