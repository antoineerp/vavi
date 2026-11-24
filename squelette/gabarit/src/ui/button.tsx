import type { ComponentProps } from 'react';
import { Slot } from 'radix-ui';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from './cn';

export const buttonVariants = cva(

  'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-bouton font-semibold '
    + 'transition-[color,background-color,box-shadow,transform] duration-[var(--duree)] active:translate-y-px '
    + 'disabled:pointer-events-none disabled:opacity-50 '
    + "[&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground shadow-sm hover:-translate-y-px hover:bg-primary/90 hover:shadow-md',
        destructive: 'border-2 border-destructive bg-background text-foreground hover:bg-muted',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        outline: 'border border-input bg-card text-foreground shadow-xs hover:bg-muted',
        ghost: 'text-foreground hover:bg-muted',
        link: 'text-foreground underline decoration-input underline-offset-4 hover:decoration-current',
      },
      size: {
        default: 'h-10 px-5 text-sm',
        sm: 'h-9 px-3.5 text-sm',
        lg: 'h-12 px-6 text-base',
        icon: 'size-10',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export function Button({
  className, variant, size, asChild = false, ...props
}: ComponentProps<'button'> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : 'button';
  return <Comp data-slot="button" className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}
