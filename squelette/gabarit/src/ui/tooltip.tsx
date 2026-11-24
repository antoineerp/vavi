import type { ComponentProps } from 'react';
import { Tooltip as TooltipPrimitive } from 'radix-ui';
import { cn } from './cn';

export function TooltipProvider({ delayDuration = 200, ...props }: ComponentProps<typeof TooltipPrimitive.Provider>) {
  return <TooltipPrimitive.Provider data-slot="tooltip-provider" delayDuration={delayDuration} {...props} />;
}

export function Tooltip(props: ComponentProps<typeof TooltipPrimitive.Root>) {
  return <TooltipProvider><TooltipPrimitive.Root data-slot="tooltip" {...props} /></TooltipProvider>;
}

export function TooltipTrigger(props: ComponentProps<typeof TooltipPrimitive.Trigger>) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />;
}

export function TooltipContent({
  className, sideOffset = 6, ...props
}: ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        sideOffset={sideOffset}
        className={cn(
          'z-50 max-w-xs rounded-sm bg-foreground px-2.5 py-1.5 text-xs text-background '
            + 'data-[state=delayed-open]:animate-[ui-voile_var(--duree)_ease-out]',
          className,
        )}
        {...props}
      />
    </TooltipPrimitive.Portal>
  );
}
