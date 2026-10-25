import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import * as DropdownPrimitive from '@radix-ui/react-dropdown-menu';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import * as AlertPrimitive from '@radix-ui/react-alert-dialog';
import { X } from 'lucide-react';
import { create } from 'zustand';
import { cn } from '@/lib/utils';
import { Button } from './button';

// ---------- Dialog & Sheet ----------
export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

const overlayCls = 'fixed inset-0 z-50 bg-black/50 backdrop-blur-[1px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0';

export const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & { title: string; description?: string; size?: 'sm' | 'md' | 'lg' | 'xl' }
>(({ className, children, title, description, size = 'md', ...props }, ref) => (
  <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay className={overlayCls} />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        'fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl border bg-card shadow-2xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
        { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' }[size],
        className,
      )}
      {...props}
    >
      <div className="flex items-start justify-between gap-4 border-b px-5 py-4">
        <div>
          <DialogPrimitive.Title className="text-base font-semibold">{title}</DialogPrimitive.Title>
          {description ? <DialogPrimitive.Description className="mt-1 text-sm text-muted-foreground">{description}</DialogPrimitive.Description>
            : <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>}
        </div>
        <DialogPrimitive.Close className="rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground" aria-label="Close"><X className="size-4" /></DialogPrimitive.Close>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
));
DialogContent.displayName = 'DialogContent';

export function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('-mx-5 -mb-4 mt-5 flex flex-col-reverse gap-2 border-t bg-muted/40 px-5 py-3 sm:flex-row sm:justify-end', className)} {...props} />;
}

export const SheetContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & { title: string; side?: 'left' | 'right' }
>(({ className, children, title, side = 'right', ...props }, ref) => (
  <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay className={overlayCls} />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        'fixed inset-y-0 z-50 flex w-full max-w-md flex-col bg-card shadow-2xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:duration-200 data-[state=open]:duration-300',
        side === 'right' ? 'right-0 border-l data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right' : 'left-0 border-r data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left',
        className,
      )}
      {...props}
    >
      <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>
      <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>
      {children}
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
));
SheetContent.displayName = 'SheetContent';

// ---------- Dropdown menu ----------
export const DropdownMenu = DropdownPrimitive.Root;
export const DropdownMenuTrigger = DropdownPrimitive.Trigger;
export const DropdownMenuContent = React.forwardRef<React.ElementRef<typeof DropdownPrimitive.Content>, React.ComponentPropsWithoutRef<typeof DropdownPrimitive.Content>>(
  ({ className, sideOffset = 4, ...props }, ref) => (
    <DropdownPrimitive.Portal>
      <DropdownPrimitive.Content ref={ref} sideOffset={sideOffset}
        className={cn('z-50 min-w-[10rem] overflow-hidden rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95', className)} {...props} />
    </DropdownPrimitive.Portal>
  ),
);
DropdownMenuContent.displayName = 'DropdownMenuContent';
export const DropdownMenuItem = React.forwardRef<React.ElementRef<typeof DropdownPrimitive.Item>, React.ComponentPropsWithoutRef<typeof DropdownPrimitive.Item> & { destructive?: boolean }>(
  ({ className, destructive, ...props }, ref) => (
    <DropdownPrimitive.Item ref={ref}
      className={cn('relative flex cursor-pointer select-none items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none transition-colors focus:bg-secondary data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:size-4', destructive && 'text-destructive focus:text-destructive', className)} {...props} />
  ),
);
DropdownMenuItem.displayName = 'DropdownMenuItem';
export const DropdownMenuLabel = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) =>
  <DropdownPrimitive.Label className={cn('px-2 py-1.5 text-xs font-semibold text-muted-foreground', className)} {...props} />;
export const DropdownMenuSeparator = () => <DropdownPrimitive.Separator className="-mx-1 my-1 h-px bg-border" />;

// ---------- Popover ----------
export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverAnchor = PopoverPrimitive.Anchor;
export const PopoverContent = React.forwardRef<React.ElementRef<typeof PopoverPrimitive.Content>, React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>>(
  ({ className, align = 'start', sideOffset = 4, ...props }, ref) => (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content ref={ref} align={align} sideOffset={sideOffset}
        className={cn('z-50 rounded-lg border bg-popover p-3 text-popover-foreground shadow-lg outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95', className)} {...props} />
    </PopoverPrimitive.Portal>
  ),
);
PopoverContent.displayName = 'PopoverContent';

// ---------- Tooltip ----------
export const TooltipProvider = TooltipPrimitive.Provider;
export function Tooltip({ content, children, side = 'top' }: { content: React.ReactNode; children: React.ReactElement; side?: 'top' | 'right' | 'bottom' | 'left' }) {
  return (
    <TooltipPrimitive.Root delayDuration={300}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content side={side} sideOffset={6} className="z-50 max-w-xs rounded-md bg-foreground px-2.5 py-1.5 text-xs text-background shadow-md data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0">
          {content}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}

// ---------- Promise-based confirm dialog ----------
interface ConfirmOpts { title: string; description?: string; confirmLabel?: string; destructive?: boolean }
const useConfirmStore = create<{ opts: ConfirmOpts | null; resolve?: (v: boolean) => void }>(() => ({ opts: null }));
export const confirm = (opts: ConfirmOpts) => new Promise<boolean>((resolve) => useConfirmStore.setState({ opts, resolve }));

export function ConfirmHost() {
  const { opts, resolve } = useConfirmStore();
  const close = (v: boolean) => { resolve?.(v); useConfirmStore.setState({ opts: null, resolve: undefined }); };
  return (
    <AlertPrimitive.Root open={!!opts} onOpenChange={(o) => !o && close(false)}>
      <AlertPrimitive.Portal>
        <AlertPrimitive.Overlay className={overlayCls} />
        <AlertPrimitive.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-card p-5 shadow-2xl data-[state=open]:animate-in data-[state=open]:zoom-in-95">
          <AlertPrimitive.Title className="text-base font-semibold">{opts?.title}</AlertPrimitive.Title>
          <AlertPrimitive.Description className="mt-2 text-sm text-muted-foreground">{opts?.description ?? 'Are you sure?'}</AlertPrimitive.Description>
          <div className="mt-5 flex justify-end gap-2">
            <AlertPrimitive.Cancel asChild><Button variant="outline">Cancel</Button></AlertPrimitive.Cancel>
            <AlertPrimitive.Action asChild>
              <Button variant={opts?.destructive ? 'destructive' : 'default'} onClick={() => close(true)}>{opts?.confirmLabel ?? 'Confirm'}</Button>
            </AlertPrimitive.Action>
          </div>
        </AlertPrimitive.Content>
      </AlertPrimitive.Portal>
    </AlertPrimitive.Root>
  );
}
