import type { ReactNode } from 'react';
import { connection } from 'next/server';
import { leScriptDeLaConfiguration } from '@/lib/supabase/configuration';
import './console.css';

export const metadata = {
  title: 'Vavi',
  description: 'Vos apps et vos sites, construits avec Claude, hébergés et publiés par Vavi.',
};

export default async function Racine({ children }: { children: ReactNode }) {
  // Lu à chaque requête (jamais au build) : la configuration publique vient des secrets de l'hébergeur.
  await connection();
  const script = leScriptDeLaConfiguration(process.env);
  return (
    <html lang="fr">
      <head>{script && <script dangerouslySetInnerHTML={{ __html: script }} />}</head>
      <body>{children}</body>
    </html>
  );
}
