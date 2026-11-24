import type { CSSProperties } from 'react';
import { Toaster as Sonner, type ToasterProps } from 'sonner';

export function Toaster(props: ToasterProps) {
  return (
    <Sonner
      className="toaster group"
      style={{
        '--normal-bg': 'var(--fond)',
        '--normal-text': 'var(--sur-fond)',
        '--normal-border': 'var(--bordure)',
        '--border-radius': 'var(--rayon)',
      } as CSSProperties}
      toastOptions={{ style: { fontFamily: 'var(--police-texte)' } }}
      {...props}
    />
  );
}
