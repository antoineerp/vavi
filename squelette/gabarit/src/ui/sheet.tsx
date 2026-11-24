import type { ComponentProps } from 'react';
import { Dialog as SheetPrimitive } from 'radix-ui';
import { X } from 'lucide-react';
import { cn } from './cn';

const COTES = {
  right: 'inset-y-0 right-0 h-full w-[min(28rem,100%)] border-l',
  left: 'inset-y-0 left-0 h-full w-[min(28rem,100%)] border-r',
  top: 'inset-x-0 top-0 max-h-[85vh] border-b',
  bottom: 'inset-x-0 bottom-0 max-h-[85vh] border-t',
} as const;

export function Sheet(props: ComponentProps<typeof SheetPrimitive.Root>) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />;
}

export function SheetTrigger(props: ComponentProps<typeof SheetPrimitive.Trigger>) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />;
}

export function SheetClose(props: ComponentProps<typeof SheetPrimitive.Close>) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />;
}

export function SheetContent({
  className, children, side = 'right', fermer = 'Fermer', ...props
}: ComponentProps<typeof SheetPrimitive.Content> & {
  side?: keyof typeof COTES;

  fermer?: string;
}) {
  return (
    <SheetPrimitive.Portal>
      <SheetPrimitive.Overlay
        className="fixed inset-0 z-50 bg-muted-ancre/50 data-[state=open]:animate-[ui-voile_var(--duree)_ease-out]"
      />
      <SheetPrimitive.Content
        data-slot="sheet-content"
        className={cn(
          'fixed z-50 flex flex-col gap-4 overflow-y-auto border-border bg-card p-7 text-foreground shadow-xl '
            + 'data-[state=open]:animate-[ui-voile_var(--duree)_ease-out]',
          COTES[side],
          className,
        )}
        {...props}
      >
        {children}
        <SheetPrimitive.Close
          className="absolute right-4 top-4 rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="size-4" />
          <span className="sr-only">{fermer}</span>
        </SheetPrimitive.Close>
      </SheetPrimitive.Content>
    </SheetPrimitive.Portal>
  );
}

export function SheetHeader({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="sheet-header" className={cn('flex flex-col gap-1.5 pr-8', className)} {...props} />;
}

export function SheetFooter({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="sheet-footer" className={cn('mt-auto flex flex-col gap-2', className)} {...props} />;
}

export function SheetTitle({ className, ...props }: ComponentProps<typeof SheetPrimitive.Title>) {
  return <SheetPrimitive.Title data-slot="sheet-title" className={cn('font-titre text-titre-3 leading-tight', className)} {...props} />;
}

export function SheetDescription({ className, ...props }: ComponentProps<typeof SheetPrimitive.Description>) {
  return <SheetPrimitive.Description data-slot="sheet-description" className={cn('text-sm text-muted-foreground', className)} {...props} />;
}
