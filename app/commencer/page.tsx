/** /commencer — brancher vavi dans Claude.ai, pas à pas. Publique : on la lit avant d'avoir un compte. */
import Link from 'next/link';
import { TEXTES } from '@/app/_partage/textes';
import { laLangue } from '@/app/_partage/la-langue';
import { adresseMcp } from '@/lib/mcp/l-adresse';
import { Copier } from './copier';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const langue = await laLangue();
  const t = TEXTES[langue].commencer;
  const adresse = adresseMcp();
  return (
    <main className="console" style={{ maxWidth: 720 }}>
      <h1>{t.titre}</h1>
      <p>{t.intro}</p>
      <p className="attenue">{t.prerequis}</p>
      <div className="carte">
        <label>{t.adresse}</label>
        <div className="ligne"><code style={{ fontSize: '1rem', wordBreak: 'break-all' }}>{adresse}</code><Copier texte={adresse} libelle={t.copier} fait={t.copie} /></div>
      </div>
      <ol className="carte" style={{ paddingLeft: '2rem' }}>
        {t.etapes.map((e, i) => <li key={i} style={{ margin: '0.6rem 0' }}>{e}</li>)}
      </ol>
      <p>{t.ensuite} <Link href="/projets">{TEXTES[langue].mesProjets}</Link></p>
      <p className="attenue">{t.bloque}</p>
    </main>
  );
}
