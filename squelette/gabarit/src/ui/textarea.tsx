import type { ComponentProps } from 'react';
import { cn } from './cn';
import { CHAMP_DE_SAISIE } from './input';

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(CHAMP_DE_SAISIE, 'min-h-24 py-3', className)}
      {...props}
    />
  );
}
