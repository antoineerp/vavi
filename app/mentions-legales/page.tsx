/** /mentions-legales — les mentions légales de vavi (éditeur, directeur de la publication, hébergeur), dans la langue du navigateur. */
import type { Metadata } from 'next';
import { laLangue } from '@/app/_partage/la-langue';
import { MENTIONS } from './le-texte';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Mentions légales · vavi', description: 'Qui édite vavi, qui dirige la publication, qui héberge le site.' };

export default async function Page() {
  const p = MENTIONS[await laLangue()];
  return (
    <main className="console" style={{ maxWidth: 720 }}>
      <h1>{p.titre}</h1>
      <p className="attenue">{p.version}</p>
      {p.sections.map((s) => (
        <section key={s.titre}>
          <h2>{s.titre}</h2>
          {s.paragraphes?.map((t) => <p key={t}>{t}</p>)}
          {s.liste && <ul>{s.liste.map((t) => <li key={t}>{t}</li>)}</ul>}
        </section>
      ))}
    </main>
  );
}
