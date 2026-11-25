/** /commencer — brancher vavi dans Claude.ai : un bouton qui ouvre l'ajout du connecteur déjà rempli, puis le premier
 * message à coller. L'adresse à copier reste l'issue de secours. Publique : on la lit avant d'avoir un compte. */
import Link from 'next/link';
import { TEXTES } from '@/app/_partage/textes';
import { laLangue } from '@/app/_partage/la-langue';
import { adresseMcp, lienDInstallation } from '@/lib/mcp/l-adresse';
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
      <p><a className="bouton" href={lienDInstallation(adresse)} target="_blank" rel="noopener noreferrer">{t.ajouter}</a></p>
      <ol className="carte" style={{ paddingLeft: '2rem' }}>
        {t.etapes.map((e, i) => <li key={i} style={{ margin: '0.6rem 0' }}>{e}</li>)}
      </ol>
      <div className="carte">
        <label>{t.premier}</label>
        <div className="ligne"><span style={{ flex: 1 }}>{t.premierTexte}…</span><Copier texte={t.premierTexte} libelle={t.copier} fait={t.copie} /></div>
      </div>
      <div className="carte">
        <label>{t.adresse}</label>
        <div className="ligne"><code style={{ fontSize: '1rem', wordBreak: 'break-all' }}>{adresse}</code><Copier texte={adresse} libelle={t.copier} fait={t.copie} /></div>
        <p className="attenue">{t.secours}</p>
      </div>
      <p>{t.ensuite} <Link href="/projets">{TEXTES[langue].mesProjets}</Link></p>
      <p className="attenue">{t.bloque}</p>
    </main>
  );
}
