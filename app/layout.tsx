import type { ReactNode } from 'react';
import { connection } from 'next/server';
import { leScriptDeLaConfiguration } from '@/lib/supabase/configuration';
import { laLangue } from './_partage/la-langue';
import './console.css';

const DESCRIPTIONS = {
  fr: 'Vos apps et vos sites, construits avec Claude, hébergés et publiés par Vavi.',
  en: 'Your apps and websites, built with Claude, hosted and published by Vavi.',
} as const;

/** La console se dit dans la langue du navigateur : sa description et l'attribut `lang`, lu par les lecteurs d'écran. */
export async function generateMetadata() {
  return { title: 'Vavi', description: DESCRIPTIONS[await laLangue()] };
}

export default async function Racine({ children }: { children: ReactNode }) {
  // Lu à chaque requête (jamais au build) : la configuration publique vient des secrets de l'hébergeur.
  await connection();
  const script = leScriptDeLaConfiguration(process.env);
  return (
    <html lang={await laLangue()}>
      <head>{script && <script dangerouslySetInnerHTML={{ __html: script }} />}</head>
      <body>{children}</body>
    </html>
  );
}
