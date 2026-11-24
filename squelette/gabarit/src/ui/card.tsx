import type { ComponentProps } from 'react';
import { cn } from './cn';

export function Card({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="card" className={cn('flex flex-col gap-5 rounded-2xl border border-border bg-card p-6 text-card-foreground shadow-sm transition-shadow duration-[var(--duree)] hover:shadow-md', className)} {...props} />;
}
export function CardHeader({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="card-header" className={cn('grid auto-rows-min grid-cols-[1fr_auto] items-start gap-1.5', className)} {...props} />;
}
export function CardEyebrow({ className, ...props }: ComponentProps<'p'>) {
  return <p data-slot="card-eyebrow" className={cn('col-span-2 text-xs font-medium uppercase tracking-[0.2em] text-[var(--accent-texte)]', className)} {...props} />;
}
export function CardTitle({ className, ...props }: ComponentProps<'h3'>) {
  return <h3 data-slot="card-title" className={cn('text-lg font-semibold leading-tight tracking-tight', className)} {...props} />;
}
export function CardDescription({ className, ...props }: ComponentProps<'p'>) {
  return <p data-slot="card-description" className={cn('text-sm text-muted-foreground', className)} {...props} />;
}
export function CardAction({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="card-action" className={cn('col-start-2 row-span-2 row-start-1 self-start justify-self-end', className)} {...props} />;
}
export function CardContent({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="card-content" className={cn('min-w-0', className)} {...props} />;
}
export function CardFooter({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="card-footer" className={cn('flex items-center gap-3 border-t border-border pt-4', className)} {...props} />;
}
