import type { ComponentProps } from 'react';
import { Label as LabelPrimitive } from 'radix-ui';
import { cn } from './cn';

export function Label({ className, ...props }: ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn(
        'flex select-none items-center gap-2 text-sm font-medium leading-none text-foreground '
          + 'peer-disabled:cursor-not-allowed peer-disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}
