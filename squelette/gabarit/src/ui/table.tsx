import type { ComponentProps } from 'react';
import { cn } from './cn';

export function Table({ className, ...props }: ComponentProps<'table'>) {
  return (
    <div data-slot="table-container" data-carte className="relative w-full overflow-x-auto rounded-2xl border border-border bg-card shadow-sm">
      <table data-slot="table" className={cn('w-full caption-bottom text-sm', className)} {...props} />
    </div>
  );
}
export function TableHeader({ className, ...props }: ComponentProps<'thead'>) {
  return <thead data-slot="table-header" className={cn('bg-muted/60 [&_tr]:border-b [&_tr]:hover:bg-transparent', className)} {...props} />;
}
export function TableBody({ className, ...props }: ComponentProps<'tbody'>) {
  return <tbody data-slot="table-body" className={cn('[&_tr:last-child]:border-0', className)} {...props} />;
}
export function TableRow({ className, ...props }: ComponentProps<'tr'>) {
  return <tr data-slot="table-row" className={cn('border-b border-border transition-colors hover:bg-muted/60', className)} {...props} />;
}
export function TableHead({ className, numerique, ...props }: ComponentProps<'th'> & { readonly numerique?: boolean }) {
  return <th data-slot="table-head" className={cn('h-11 whitespace-nowrap px-4 text-left align-middle text-xs font-medium uppercase tracking-wide text-muted-foreground', numerique && 'text-right', className)} {...props} />;
}
export function TableCell({ className, numerique, ...props }: ComponentProps<'td'> & { readonly numerique?: boolean }) {
  return <td data-slot="table-cell" className={cn('whitespace-nowrap px-4 py-3 align-middle', numerique && 'text-right tabular-nums', className)} {...props} />;
}
export function TableCaption({ className, ...props }: ComponentProps<'caption'>) {
  return <caption data-slot="table-caption" className={cn('mt-4 text-sm text-muted-foreground', className)} {...props} />;
}
