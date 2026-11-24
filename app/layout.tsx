import type { ReactNode } from 'react';
import './console.css';

export const metadata = {
  title: 'Vavi',
  description: 'Vos apps et vos sites, construits avec Claude, hébergés et publiés par Vavi.',
};

export default function Racine({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
