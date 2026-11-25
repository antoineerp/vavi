/**
 * /projets — le poste de pilotage du compte (Antoine, 25/11 : « des écrans de pilotage modernes, plus soignés, plus high
 * tech ») : quatre indicateurs, le trafic des sites en ligne sur 30 jours, la répartition des projets par état, une tuile par
 * projet (vignette, états, version, visites de la semaine, Claude au travail), l'activité récente. Remplace le tableau du
 * 25/11 soir, qui n'était qu'un fond noir sur la même présentation.
 */
import Link from 'next/link';
import { laConsole } from '@/app/_partage/la-console';
import { TEXTES } from '@/app/_partage/textes';
import { LogoVavi } from '@/app/_partage/le-logo';
import { adresseDeLApp } from '@/app/_partage/l-adresse-des-apps';
import { BarreDuCompte, EnTeteDePilotage, type EtatDuProjet } from '@/app/_partage/la-barre-du-compte';
import { Icone } from '@/app/_partage/les-icones';
import { Aire, Anneau, Courbe, Legende } from '@/app/_partage/les-graphiques';
import { claudeYTravaille, ilYA, lActivite, lEtat, lEvolution, laTeinte, lesJours } from '@/app/_partage/le-pilotage';
import { lesVisites } from '@/lib/formulaires/sur-supabase';
import { resumerLAudience } from '@/lib/formulaires/l-audience';
import { retirerClaude } from './retirer-claude';

export const dynamic = 'force-dynamic';

const MOTS = {
  fr: { sousTitre: 'Vos sites et vos apps, construits avec Claude : où en est chacun, en un coup d’œil.', nouveau: 'Nouveau projet dans Claude', console: 'Console',
    projets: 'Projets', avecApercu: (n: number) => `${n} avec un aperçu`, enLigne: 'En ligne', aPublierN: (n: number) => (n ? `${n} avec des changements à publier` : 'tout est publié'),
    visites: 'Visites · 30 j', evolution: 'sur 7 jours', pasDeBase: 'pas encore de semaine à comparer', claude: 'Claude au travail', claudeSous: (n: number) => (n ? 'conversation en cours' : 'aucune conversation en cours'),
    trafic: 'Trafic des sites en ligne', trafic30: '30 derniers jours, sans cookie, aperçus exclus', aucunTrafic: 'Aucun site en ligne pour l’instant : le trafic s’affichera après la première mise en ligne, depuis la page du projet.',
    traficIllisible: 'Les visites n’ont pas pu être lues ; réessayez dans un moment.',
    parc: 'État des projets', etats: { en_ligne: 'En ligne', a_publier: 'À publier', apercu: 'Aperçu seul', vide: 'Sans aperçu' } as Record<EtatDuProjet, string>,
    vosProjets: 'Vos projets', version: 'Version', semaine: 'Visites 7 j', modifie: 'Modifié', ouvrir: 'Ouvrir', voirLeSite: 'Voir le site', voirLApercu: 'Aperçu',
    claudeTravaille: 'Claude travaille', activite: 'Activité récente', aucuneActivite: 'Rien encore.',
    evenements: { claude: 'Claude a travaillé sur', en_ligne: 'Mis en ligne :', version: 'Nouvelle version de' },
    claudeTitre: 'Claude et vavi', claudeConnecte: 'Claude se sert de vavi depuis vos conversations. Si vous le déconnectez, il perd tout accès à vos projets et devra redemander votre accord.' },
  en: { sousTitre: 'Your sites and apps, built with Claude: where each one stands, at a glance.', nouveau: 'New project in Claude', console: 'Console',
    projets: 'Projects', avecApercu: (n: number) => `${n} with a preview`, enLigne: 'Online', aPublierN: (n: number) => (n ? `${n} with changes to publish` : 'everything is published'),
    visites: 'Visits · 30 d', evolution: 'over 7 days', pasDeBase: 'no previous week to compare yet', claude: 'Claude at work', claudeSous: (n: number) => (n ? 'conversation in progress' : 'no conversation in progress'),
    trafic: 'Traffic of the online sites', trafic30: 'last 30 days, no cookies, previews excluded', aucunTrafic: 'No site online yet: traffic will show after the first publish, from the project page.',
    traficIllisible: 'Visits could not be read; try again in a moment.',
    parc: 'Projects by status', etats: { en_ligne: 'Online', a_publier: 'To publish', apercu: 'Preview only', vide: 'No preview' } as Record<EtatDuProjet, string>,
    vosProjets: 'Your projects', version: 'Version', semaine: 'Visits 7 d', modifie: 'Changed', ouvrir: 'Open', voirLeSite: 'View the site', voirLApercu: 'Preview',
    claudeTravaille: 'Claude is working', activite: 'Recent activity', aucuneActivite: 'Nothing yet.',
    evenements: { claude: 'Claude worked on', en_ligne: 'Published:', version: 'New version of' },
    claudeTitre: 'Claude and vavi', claudeConnecte: 'Claude uses vavi from your conversations. If you disconnect it, it loses all access to your projects and will have to ask for your consent again.' },
} as const;

const ICONE_D_EVENEMENT = { claude: 'eclair', en_ligne: 'globe', version: 'version' } as const;

export default async function Page({ searchParams }: { searchParams: Promise<{ claude?: string }> }) {
  const c = await laConsole('/projets');
  const { claude } = await searchParams;
  const t = TEXTES[c.langue];
  const m = MOTS[c.langue];
  const l = await c.projets.lister(c.compte);
  const maintenant = Date.now();
  const projets = l.lu ? [...l.valeur].sort((a, b) => b.modifieLe.localeCompare(a.modifieLe)) : [];
  const enLigne = projets.filter((p) => p.enLigneEmpreinte !== null);
  // Seul un site en ligne compte des visites : une lecture par site en ligne ; une lecture manquée ⇒ « — », jamais 0.
  const lues = await Promise.all(enLigne.map(async (p) => [p.id, await lesVisites(c.base, p.id, 30)] as const));
  const parProjet = new Map(lues.flatMap(([id, r]) => (r.lu ? [[id, lesJours(resumerLAudience(r.valeur).parJour, 30, maintenant)] as const] : [])));
  const toutLu = parProjet.size === enLigne.length;
  const serie = lesJours([...parProjet.values()].flat(), 30, maintenant);
  const total = serie.reduce((n, x) => n + x.visites, 0);
  const evolution = lEvolution(serie);
  const etats = projets.map(lEtat);
  const compter = (e: EtatDuProjet) => etats.filter((x) => x === e).length;
  const parts = (['en_ligne', 'a_publier', 'apercu', 'vide'] as const).map((e) => ({ nom: m.etats[e], valeur: compter(e), classe: e }));
  const actifs = projets.filter((p) => claudeYTravaille(p, maintenant)).length;
  const menu = projets.map((p) => ({ id: p.id, nom: p.nom, etat: lEtat(p), claude: claudeYTravaille(p, maintenant) }));
  return (
    <div className="coquille">
      <BarreDuCompte langue={c.langue} courriel={c.courriel} ici="projets" projets={menu} />
      <main className="pilote">
        <EnTeteDePilotage fil={[m.console, t.mesProjets]} titre={t.mesProjets} sousTitre={m.sousTitre}>
          <a className="bouton" href="https://claude.ai/new" target="_blank" rel="noreferrer"><Icone nom="plus" />{m.nouveau}</a>
        </EnTeteDePilotage>
        {claude === 'retire' && <p className="carte" role="status">{t.claudeRetire}</p>}
        {claude === 'echec' && <p className="carte" role="alert">{t.claudeEchec}</p>}
        {!l.lu ? <p role="alert">{t.erreur} {l.pourquoi}</p> : projets.length === 0 ? (
          <div className="panneau vide"><LogoVavi taille={48} /><p>{t.aucun}</p><p><Link className="bouton" href="/commencer">{t.commencer.lien}</Link></p></div>
        ) : (
          <>
            <section className="indicateurs" aria-label={m.vosProjets}>
              <div className="indicateur"><span className="indicateur-icone"><Icone nom="projets" /></span><span className="indicateur-nom">{m.projets}</span>
                <strong>{projets.length}</strong><small>{m.avecApercu(projets.length - compter('vide'))}</small></div>
              <div className="indicateur vert"><span className="indicateur-icone"><Icone nom="globe" /></span><span className="indicateur-nom">{m.enLigne}</span>
                <strong>{enLigne.length}</strong><small>{m.aPublierN(compter('a_publier'))}</small></div>
              <div className="indicateur"><span className="indicateur-icone"><Icone nom="courbe" /></span><span className="indicateur-nom">{m.visites}</span>
                <strong>{enLigne.length && toutLu ? total : '—'}</strong>
                <small>{evolution === null ? m.pasDeBase : <><span className={`evolution ${evolution >= 0 ? 'hausse' : 'baisse'}`}>{evolution >= 0 ? '▲' : '▼'} {Math.abs(evolution)} %</span> {m.evolution}</>}</small></div>
              <div className={`indicateur ${actifs ? 'actif' : ''}`}><span className="indicateur-icone"><Icone nom="eclair" /></span><span className="indicateur-nom">{m.claude}</span>
                <strong>{actifs}</strong><small>{actifs > 0 && <span className="pouls" aria-hidden="true" />}{m.claudeSous(actifs)}</small></div>
            </section>

            <section className="rangee">
              <div className="panneau large">
                <div className="panneau-tete"><div><h2>{m.trafic}</h2><p className="attenue">{m.trafic30}</p></div>{enLigne.length > 0 && toutLu && <span className="chiffre-tete">{total}</span>}</div>
                {enLigne.length === 0 ? <p className="attenue vide-graphique">{m.aucunTrafic}</p> : !toutLu ? <p role="alert">{m.traficIllisible}</p> : <Aire serie={serie} langue={c.langue} />}
              </div>
              <div className="panneau">
                <div className="panneau-tete"><h2>{m.parc}</h2></div>
                <div className="parc"><Anneau parts={parts} centre={String(projets.length)} sousCentre={m.projets.toLowerCase()} /><Legende parts={parts} /></div>
              </div>
            </section>

            <h2 className="titre-de-section">{m.vosProjets}</h2>
            <ul className="tuiles">
              {projets.map((p) => {
                const e = lEtat(p);
                const semaine = parProjet.get(p.id)?.slice(-7);
                const travaille = claudeYTravaille(p, maintenant);
                return (
                  <li key={p.id} className="tuile" style={{ ['--teinte' as string]: laTeinte(p.id) }}>
                    <Link href={`/projets/${p.id}`} className="tuile-ecran" aria-label={p.nom}>
                      <span className="tuile-fenetre" aria-hidden="true"><i /><i /><i /><span>vavi.dev/p/{p.id.slice(0, 8)}</span></span>
                      <span className="tuile-initiale" aria-hidden="true">{[...p.nom.trim()][0]?.toUpperCase() ?? '·'}</span>
                      <span className={`tuile-etat ${e}`}><span className={`diode ${e}`} aria-hidden="true" />{m.etats[e]}</span>
                    </Link>
                    <div className="tuile-corps">
                      <Link href={`/projets/${p.id}`} className="tuile-nom">{p.nom}</Link>
                      <dl className="tuile-mesures">
                        <div><dt>{m.version}</dt><dd className="mono">v{p.version}</dd></div>
                        <div><dt>{m.semaine}</dt><dd>{semaine ? <span className="ligne-mesure"><Courbe serie={semaine} largeur={64} hauteur={20} /><span className="mono">{semaine.reduce((n, x) => n + x.visites, 0)}</span></span> : <span className="mono attenue">—</span>}</dd></div>
                        <div><dt>{m.modifie}</dt><dd className="petit-texte">{ilYA(p.modifieLe, maintenant, c.langue)}</dd></div>
                      </dl>
                      {travaille && p.chantier && <p className="tuile-claude"><span className="pouls" aria-hidden="true" /><strong>{m.claudeTravaille}</strong> · {p.chantier.intention}</p>}
                      <div className="tuile-actions">
                        <Link className="bouton petit" href={`/projets/${p.id}`}>{m.ouvrir}<Icone nom="fleche" taille={16} /></Link>
                        {p.enLigneEmpreinte ? <a className="bouton discret petit" href={adresseDeLApp(p.id, 'en_ligne')} target="_blank" rel="noreferrer"><Icone nom="globe" taille={16} />{m.voirLeSite}</a>
                          : p.apercuEmpreinte ? <a className="bouton discret petit" href={adresseDeLApp(p.id, 'apercu')} target="_blank" rel="noreferrer"><Icone nom="oeil" taille={16} />{m.voirLApercu}</a> : null}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>

            <section className="rangee">
              <div className="panneau large">
                <div className="panneau-tete"><h2>{m.activite}</h2></div>
                {projets.length === 0 ? <p className="attenue">{m.aucuneActivite}</p> : (
                  <ol className="fil-d-activite">
                    {lActivite(projets, 6).map((x) => (
                      <li key={`${x.projet.id}-${x.nature}`} className={x.nature}>
                        <span className="fil-icone"><Icone nom={ICONE_D_EVENEMENT[x.nature]} taille={15} /></span>
                        <span>{m.evenements[x.nature]} <Link href={`/projets/${x.projet.id}`}>{x.projet.nom}</Link>{x.nature === 'version' && <span className="mono attenue"> · v{x.projet.version}</span>}
                          {x.nature === 'claude' && x.projet.chantier && <span className="attenue fil-detail">{x.projet.chantier.intention}</span>}</span>
                        <time className="mono attenue" dateTime={x.quand}>{ilYA(x.quand, maintenant, c.langue)}</time>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
              <form action={retirerClaude} className="panneau bloc-claude">
                <div className="panneau-tete"><h2>{m.claudeTitre}</h2></div>
                <p className="attenue">{m.claudeConnecte}</p>
                <button type="submit" className="discret danger">{t.retirerClaude}</button>
              </form>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
