import type { ComponentProps } from 'react';
import { Switch as SwitchPrimitive } from 'radix-ui';
import { cn } from './cn';

export function Switch({ className, ...props }: ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        'peer inline-flex h-6 w-11 shrink-0 items-center rounded-full border border-input bg-muted '
          + 'transition-colors duration-[var(--duree)] data-[state=checked]:border-primary data-[state=checked]:bg-primary '
          + 'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="pointer-events-none block size-5 rounded-full bg-background shadow-sm ring-1 ring-input
                   transition-transform duration-[var(--duree)] data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0"
      />
    </SwitchPrimitive.Root>
  );
}
