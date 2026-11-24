import type { ComponentProps } from 'react';
import { cn } from './cn';

export const CHAMP_DE_SAISIE = 'flex w-full min-w-0 rounded-xl border border-input bg-card px-4 text-base shadow-xs transition-[border-color,box-shadow] '
  + 'focus-visible:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 '
  + 'text-foreground placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive';

export function Input({ className, type, ...props }: ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(CHAMP_DE_SAISIE, 'h-11 py-2.5 file:mr-3 file:border-0 file:bg-transparent file:font-medium', className)}
      {...props}
    />
  );
}
