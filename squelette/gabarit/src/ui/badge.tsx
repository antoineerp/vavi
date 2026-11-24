import type { ComponentProps } from 'react';
import { cn } from './cn';

export type TonDuBadge = 'neutre' | 'info' | 'favorable' | 'attention' | 'critique';

const COULEUR: Readonly<Record<TonDuBadge, string>> = {
  neutre: 'var(--sur-fond-attenue)', info: 'var(--accent-texte)', favorable: 'var(--hausse)',
  attention: 'var(--alerte)', critique: 'var(--baisse)',
};

export function Badge({ ton = 'neutre', className, style, ...props }: ComponentProps<'span'> & { readonly ton?: TonDuBadge }) {
  const c = COULEUR[ton];
  return (
    <span data-slot="badge" data-ton={ton}
      className={cn('inline-flex w-fit shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium', className)}
      style={{ color: c, borderColor: `color-mix(in oklab, ${c} 35%, transparent)`, background: `color-mix(in oklab, ${c} 12%, transparent)`, ...style }}
      {...props} />
  );
}
