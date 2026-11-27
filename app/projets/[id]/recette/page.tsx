/**
 * /projets/<id>/recette — LE CAHIER DE RECETTE (Antoine, 27/11 : « des tests sur un parcours utilisateur complet […] avec un
 * cahier de recette » ; choix « automatique + bouton »). Les parcours que Claude a écrits, rejoués par vavi sans modèle à
 * chaque aperçu réussi : vert ou rouge, l'étape qui casse et sa capture, la date. Rien ne bloque « Publier ».
 */
import { rejouerLaRecette } from './gestes';
import { leProjet, ERREURS } from '../le-projet';
import { magasinS3 } from '@/lib/publication/le-magasin';
import { leDernierPassage } from '@/lib/mcp/la-recette';
import { CHEMIN_DU_CAHIER, leBilan, lireLeCahier } from '@/lib/parcours/le-cahier';
import { leManifesteStocke } from '@/lib/projets/l-arbre-d-un-projet';
import type { Etape } from '@/lib/parcours/le-parcours';

export const dynamic = 'force-dynamic';

const MOTS = {
  fr: {
    titre: 'Recette (tests)',
    explication: 'La recette, ce sont les parcours d’un vrai visiteur dans votre app : ouvrir une page, remplir un formulaire, cliquer, vérifier ce qui s’affiche. vavi les rejoue tout seul après chaque aperçu réussi, sur une copie de vos données : rien de réel n’est modifié.',
    aucun: 'Ce projet n’a pas encore de cahier de recette. Demandez à Claude : « écris le cahier de recette de mon app ».',
    illisible: 'Le cahier de recette ne se lit pas. Demandez à Claude de le corriger :',
    jamais: 'La recette n’a pas encore été jouée.',
    enCours: 'La recette est en train d’être jouée… rechargez la page dans une minute.',
    lancee: 'C’est parti : la recette est rejouée.',
    rejouer: 'Rejouer la recette',
    passent: (n: number, t: number) => n === t ? `Les ${t} parcours passent.` : `${n} parcours sur ${t} passent.`,
    casse: 'casse',
    passe: 'passe',
    nonJoue: 'non joué',
    joueLe: (d: string) => `Joué le ${d}`,
    ancien: 'sur une version précédente de l’aperçu',
    actuel: 'sur l’aperçu actuel',
    visiteur: 'visiteur',
    connecte: (r: string) => `connecté comme « ${r} »`,
    arret: (n: number, t: number) => `S’arrête à l’étape ${n} sur ${t}`,
    etapes: (n: number) => `Voir les ${n} étapes`,
    pourquoi: 'Ce que vavi a vu :',
    capture: 'L’écran au moment de l’arrêt',
    pasPossible: 'vavi n’a pas pu le jouer (ce n’est pas votre app) :',
    nonBloquant: 'Un parcours rouge ne vous empêche pas de publier : Claude le voit et peut le corriger. Demandez-lui « corrige la recette ».',
  },
  en: {
    titre: 'Acceptance tests',
    explication: 'Acceptance tests are the journeys of a real visitor in your app: open a page, fill a form, click, check what shows. vavi replays them on its own after every successful preview, on a copy of your data: nothing real changes.',
    aucun: 'This project has no acceptance book yet. Ask Claude: “write the acceptance tests of my app”.',
    illisible: 'The acceptance book cannot be read. Ask Claude to fix it:',
    jamais: 'The tests have not been played yet.',
    enCours: 'The tests are being played… reload the page in a minute.',
    lancee: 'Started: the tests are being replayed.',
    rejouer: 'Replay the tests',
    passent: (n: number, t: number) => n === t ? `All ${t} journeys pass.` : `${n} of ${t} journeys pass.`,
    casse: 'broken',
    passe: 'passes',
    nonJoue: 'not played',
    joueLe: (d: string) => `Played on ${d}`,
    ancien: 'on an earlier version of the preview',
    actuel: 'on the current preview',
    visiteur: 'visitor',
    connecte: (r: string) => `signed in as “${r}”`,
    arret: (n: number, t: number) => `Stops at step ${n} of ${t}`,
    etapes: (n: number) => `See the ${n} steps`,
    pourquoi: 'What vavi saw:',
    capture: 'The screen when it stopped',
    pasPossible: 'vavi could not play it (this is not your app):',
    nonBloquant: 'A red journey does not stop you from publishing: Claude sees it and can fix it. Ask it to “fix the tests”.',
  },
};

/** Une étape dite à la personne, dans sa langue. */
function enMots(e: Etape, fr: boolean): string {
  switch (e.action) {
    case 'open': return fr ? `Ouvrir la page ${e.path}` : `Open the page ${e.path}`;
    case 'click': return fr ? `Cliquer sur « ${e.target} »` : `Click “${e.target}”`;
    case 'fill': return fr ? `Écrire « ${e.value} » dans « ${e.target} »` : `Type “${e.value}” in “${e.target}”`;
    case 'select': return fr ? `Choisir « ${e.value} » dans « ${e.target} »` : `Choose “${e.value}” in “${e.target}”`;
    case 'check': return fr ? `Cocher « ${e.target} »` : `Tick “${e.target}”`;
    case 'expect': return fr ? `Voir « ${e.text} »` : `See “${e.text}”`;
  }
}

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params;
  const q = await searchParams;
  const { c, t, p, date } = await leProjet(id, 'recette');
  const fr = c.langue === 'fr';
  const w = MOTS[c.langue];
  if (!p.lu) return <main className="console"><p role="alert">{t.erreur} {p.pourquoi}</p></main>;
  const f = await c.projets.fichiers(c.compte, id);
  const m = f.lu ? leManifesteStocke(f.valeur.get('app.json')) : null;
  const cahier = f.lu ? lireLeCahier(f.valeur.get(CHEMIN_DU_CAHIER), m?.lu ? m.manifeste.roles.map((r) => r.nom) : []) : null;
  const magasin = magasinS3();
  const passage = magasin.lu ? await leDernierPassage(magasin.magasin, id).catch(() => null) : null;
  const etapes = new Map(cahier?.lu ? cahier.parcours.map((x) => [x.nom, x.etapes]) : []);
  const bilan = passage?.etat === 'joue' ? leBilan(passage) : null;
  const message = q.fait === 'lancee' ? w.lancee : q.erreur ? `${t.erreur} ${ERREURS[q.erreur]?.[c.langue] ?? q.erreur}` : null;
  return (
    <main className="console">
      <h1>{w.titre}</h1>
      <p className="attenue">{w.explication}</p>
      {message && <div className="carte" role="status">{message}</div>}
      {!f.lu ? <p role="alert">{t.erreur} {f.pourquoi}</p>
        : !cahier || (!cahier.lu && cahier.absent) ? <div className="carte"><p>{w.aucun}</p></div>
        : (
          <>
            {!cahier.lu && <div className="carte" role="alert"><p><strong>{w.illisible}</strong></p><ul>{cahier.erreurs.map((e) => <li key={e}><code>{e}</code></li>)}</ul></div>}
            <div className="carte">
              {passage?.etat === 'en_cours' ? <p role="status"><strong>{w.enCours}</strong></p>
                : bilan ? <p><span className={`etat ${bilan.passent === bilan.total ? 'vert' : 'rouge'}`}>{w.passent(bilan.passent, bilan.total)}</span></p>
                : passage?.etat === 'injoue' ? <p><span className="etat ambre">{w.nonJoue}</span> {passage.raison}</p>
                : <p>{w.jamais}</p>}
              {passage && passage.etat !== 'en_cours' && (
                <p className="attenue">{w.joueLe(date(passage.le))} · {passage.empreinte && passage.empreinte === p.valeur!.apercuEmpreinte ? w.actuel : w.ancien}</p>
              )}
              {cahier.lu && passage?.etat !== 'en_cours' && <form action={rejouerLaRecette.bind(null, id)}><button type="submit">{w.rejouer}</button></form>}
              {bilan && bilan.casses.length > 0 && <p className="attenue">{w.nonBloquant}</p>}
            </div>
            {passage?.etat === 'joue' && (
              <ul className="liste carte">
                {passage.parcours.map((x, i) => {
                  const lesEtapes = etapes.get(x.nom) ?? [];
                  return (
                    <li key={x.nom} style={{ display: 'block' }}>
                      <div>
                        <span className={`etat ${x.injoue ? 'ambre' : x.ok ? 'vert' : 'rouge'}`}>{x.injoue ? w.nonJoue : x.ok ? w.passe : w.casse}</span>{' '}
                        <strong>{x.nom}</strong> <span className="attenue">· {x.role ? w.connecte(x.role) : w.visiteur} · {x.reussies}/{x.total}</span>
                      </div>
                      {x.injoue && <p className="attenue">{w.pasPossible} {x.injoue}</p>}
                      {x.arret && (
                        <div>
                          <p><strong>{w.arret(x.arret.n, x.total)}</strong> : {lesEtapes[x.arret.n - 1] ? enMots(lesEtapes[x.arret.n - 1]!, fr) : x.arret.etape}</p>
                          <p className="attenue">{w.pourquoi} {x.arret.pourquoi}</p>
                          {x.capture && (
                            <figure style={{ margin: '0.5rem 0' }}>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={`/projets/${id}/recette/capture?i=${i}`} alt={w.capture} style={{ maxWidth: '100%', borderRadius: '8px', border: '1px solid var(--bord, #ddd)' }} />
                              <figcaption className="attenue">{w.capture}</figcaption>
                            </figure>
                          )}
                        </div>
                      )}
                      {lesEtapes.length > 0 && (
                        <details>
                          <summary>{w.etapes(lesEtapes.length)}</summary>
                          <ol>{lesEtapes.map((e, n) => <li key={n} className={x.arret && n + 1 === x.arret.n ? 'rouge' : undefined}>{enMots(e, fr)}</li>)}</ol>
                        </details>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
    </main>
  );
}
