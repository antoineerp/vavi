/** /projets/<id>/confidentialite — le registre des traitements de l'app, tiré de sa déclaration (`leRegistre`). */
import { leManifesteStocke } from '@/lib/projets/l-arbre-d-un-projet';
import { leRegistre } from '@/lib/conformite/le-registre';
import { leProjet } from '../le-projet';

export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { c, t } = await leProjet(id, 'confidentialite');
  const f = await c.projets.fichiers(c.compte, id);
  const m = f.lu ? leManifesteStocke(f.valeur.get('app.json')) : null;
  const registre = m?.lu ? leRegistre(m.manifeste, c.langue) : null;
  return (
    <main className="console">
      <h1>{t.registre}</h1>
      <p className="attenue">{t.registreExplication}</p>
      {!registre ? <p role="alert">{t.erreur}</p> : (
        <>
          <ul className="liste carte">
            {registre.traitements.map((x) => (
              <li key={`${x.source}-${x.quoi}`} style={{ display: 'block' }}>
                <div><strong>{x.quoi}</strong></div>
                <div><span className="attenue">{t.registreDonnees} :</span> {x.donnees.join(', ')}</div>
                <div><span className="attenue">{t.registrePourquoi} :</span> {x.pourquoi}</div>
                <div><span className="attenue">{t.registreQui} :</span> {x.qui.join(', ')}</div>
                <div><span className="attenue">{t.registreDuree} :</span> {x.duree}</div>
              </li>
            ))}
          </ul>
          <div className="carte">
            <p><strong>{t.registreTraceurs}</strong> : {registre.traceurs.map((x) => `${x.nom} (${x.but})`).join(' ; ')}</p>
            <p className="attenue">{registre.bandeau ? t.registreBandeau : t.registreSansBandeau}</p>
            <p><strong>{t.registreSousTraitants}</strong> : {registre.sousTraitants.join(' ; ')}</p>
            <p className="attenue">{t.registreDroits}</p>
          </div>
        </>
      )}
    </main>
  );
}
