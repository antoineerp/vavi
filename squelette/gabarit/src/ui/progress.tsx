import type { ComponentProps } from 'react';
import { cn } from './cn';

export function Progress({ valeur, className, ...props }: Omit<ComponentProps<'div'>, 'children'> & { readonly valeur: number | null }) {
  const v = valeur === null ? null : Math.max(0, Math.min(100, valeur));
  return (
    <div data-slot="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={v ?? undefined}
      className={cn('relative h-2 w-full overflow-hidden rounded-full bg-muted', className)} {...props}>
      {v === null ? null : (
        <div className="h-full rounded-full bg-primary transition-[width] duration-300 motion-reduce:transition-none" style={{ width: `${v}%` }} />
      )}
    </div>
  );
}
