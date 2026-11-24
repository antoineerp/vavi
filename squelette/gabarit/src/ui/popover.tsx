import type { ComponentProps } from 'react';
import { Popover as PopoverPrimitive } from 'radix-ui';
import { cn } from './cn';

export function Popover(props: ComponentProps<typeof PopoverPrimitive.Root>) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />;
}

export function PopoverTrigger(props: ComponentProps<typeof PopoverPrimitive.Trigger>) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />;
}

export function PopoverContent({
  className, align = 'center', sideOffset = 6, ...props
}: ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        data-slot="popover-content"
        align={align}
        sideOffset={sideOffset}
        className={cn(
          'z-50 w-72 rounded-2xl border border-border bg-card p-5 text-foreground shadow-lg outline-none '
            + 'data-[state=open]:animate-[ui-entree_var(--duree)_ease-out]',
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}
