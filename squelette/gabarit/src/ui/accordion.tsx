import { useLayoutEffect, useRef, useState, type ComponentProps } from 'react';
import { Accordion as AccordionPrimitive } from 'radix-ui';
import { motion } from 'framer-motion';
import { immobile, transition } from '../lib/mouvement';
import { ChevronDown } from 'lucide-react';
import { cn } from './cn';

export function Accordion(props: ComponentProps<typeof AccordionPrimitive.Root>) {
  return <AccordionPrimitive.Root data-slot="accordion" {...props} />;
}

export function AccordionItem({ className, ...props }: ComponentProps<typeof AccordionPrimitive.Item>) {
  return <AccordionPrimitive.Item data-slot="accordion-item" className={cn('border-b border-border', className)} {...props} />;
}

export function AccordionTrigger({ className, children, ...props }: ComponentProps<typeof AccordionPrimitive.Trigger>) {
  return (

    <AccordionPrimitive.Header className="flex font-sans text-base font-normal">
      <AccordionPrimitive.Trigger
        data-slot="accordion-trigger"
        className={cn(
          'flex flex-1 items-start justify-between gap-4 py-4 text-left font-medium hover:underline '
            + 'underline-offset-4 [&[data-state=open]>svg]:rotate-180',
          className,
        )}
        {...props}
      >
        {children}
        <ChevronDown className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform duration-[var(--duree)]" />
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  );
}

export function AccordionContent({ className, children, ...props }: ComponentProps<typeof AccordionPrimitive.Content>) {

  const ref = useRef<HTMLDivElement>(null);
  const [ouvert, setOuvert] = useState(false);
  useLayoutEffect(() => {
    const noeud = ref.current;
    if (!noeud) return undefined;
    const lire = () => setOuvert(noeud.getAttribute('data-state') === 'open');
    lire();
    const observateur = new MutationObserver(lire);
    observateur.observe(noeud, { attributes: true, attributeFilter: ['data-state'] });
    return () => observateur.disconnect();
  }, []);
  return (
    <AccordionPrimitive.Content ref={ref} data-slot="accordion-content" forceMount
      className="overflow-hidden data-[state=closed]:hidden" {...props}>
      <motion.div key={ouvert ? 'ouvert' : 'ferme'} className={cn('pb-4', className)}
        initial={immobile() || !ouvert ? false : { opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={transition()}>
        {children}
      </motion.div>
    </AccordionPrimitive.Content>
  );
}
