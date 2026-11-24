/** /projets — les projets de la personne, et où en est chacun (en ligne, changements à publier). */
import Link from 'next/link';
import { laConsole } from '@/app/_partage/la-console';
import { TEXTES } from '@/app/_partage/textes';
import { lEtatDeLaMiseEnLigne } from '@/lib/projets/la-mise-en-ligne';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const c = await laConsole('/projets');
  const t = TEXTES[c.langue];
  const l = await c.projets.lister(c.compte);
  return (
    <main className="console">
      <div className="entete"><h1>{t.mesProjets}</h1><span className="attenue">{c.courriel}</span></div>
      {!l.lu ? <p role="alert">{t.erreur} {l.pourquoi}</p> : l.valeur.length === 0 ? <div className="carte"><p>{t.aucun}</p></div> : (
        <ul className="liste carte">
          {l.valeur.map((p) => {
            const e = lEtatDeLaMiseEnLigne(p);
            return (
              <li key={p.id}>
                <div>
                  <strong>{p.nom}</strong> <span className="attenue">· {t.version} {p.version}</span>
                  <div className="ligne">
                    <span className={`etat ${e === 'en_ligne' ? 'vert' : ''}`}>{e === 'en_ligne' ? t.enLigne : e === 'a_publier' ? t.aPublier : t.rienAPublier}</span>
                    {p.chantier && <span className="etat">{t.travailEnCours}</span>}
                  </div>
                </div>
                <Link className="bouton discret" href={`/projets/${p.id}`}>{t.ouvrir}</Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
