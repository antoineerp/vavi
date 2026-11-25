/**
 * /projets — le tableau de pilotage des projets (Antoine, 25/11 : « des écrans de pilotage modernes ») : les indicateurs du
 * compte, puis une ligne par projet (états, version, visites des 7 jours en courbe, dernier changement). Remplace la grille
 * de cartes.
 */
import Link from 'next/link';
import { laConsole } from '@/app/_partage/la-console';
import { TEXTES } from '@/app/_partage/textes';
import { LogoVavi } from '@/app/_partage/le-logo';
import { adresseDeLApp } from '@/app/_partage/l-adresse-des-apps';
import { BarreDuCompte } from '@/app/_partage/la-barre-du-compte';
import type { Projet } from '@/lib/projets/les-projets';
import { lesVisites } from '@/lib/formulaires/sur-supabase';
import { resumerLAudience } from '@/lib/formulaires/l-audience';
import { Courbe, lesJours } from '@/app/_partage/la-courbe';
import { retirerClaude } from './retirer-claude';

export const dynamic = 'force-dynamic';

/** Le travail de Claude compte comme « en cours » 30 minutes après son dernier geste, comme la plateforme qui le relâche. */
const CLAUDE_Y_TRAVAILLE_MS = 30 * 60 * 1000;
const aPublier = (p: Projet): boolean => p.apercuEmpreinte !== null && p.apercuEmpreinte !== p.enLigneEmpreinte;
const claudeYTravaille = (p: Projet, maintenant: number): boolean =>
  p.chantier !== null && maintenant - Date.parse(p.chantier.dernierGesteLe) < CLAUDE_Y_TRAVAILLE_MS;

const MOTS = {
  fr: { sousTitre: 'Vos sites et vos apps, construits avec Claude.', nouveau: 'Nouveau projet dans Claude', modifie: 'modifié le', claudeTravaille: 'Claude y travaille',
    voirLeSite: 'Voir le site', pasEnLigne: 'Pas encore en ligne', surtitre: 'Pilotage', projets: 'Projets', enLigneK: 'En ligne', aPublierK: 'À publier', claudeK: 'Claude actif',
    visitesK: 'Visites · 7 j', surLeCompte: 'sur le compte', publies: (n: number) => `${n} sans changement en attente`, enAttente: 'changements prêts, en attente de « Publier »', enCours: 'conversations en cours',
    sitesEnLigne: 'des sites en ligne', colProjet: 'Projet', colEtat: 'État', colVersion: 'Version', colVisites: 'Visites 7 j', colModifie: 'Modifié', ilYA: (n: number) => `il y a ${n} min`, compte: 'Compte', claude: 'Claude et vavi', claudeConnecte: 'Claude se sert de vavi depuis vos conversations. Si vous le déconnectez, il perd tout accès à vos projets et devra redemander votre accord.' },
  en: { sousTitre: 'Your sites and apps, built with Claude.', nouveau: 'New project in Claude', modifie: 'changed on', claudeTravaille: 'Claude is working on it',
    voirLeSite: 'View the site', pasEnLigne: 'Not online yet', surtitre: 'Control room', projets: 'Projects', enLigneK: 'Online', aPublierK: 'To publish', claudeK: 'Claude active',
    visitesK: 'Visits · 7 d', surLeCompte: 'on the account', publies: (n: number) => `${n} with nothing waiting`, enAttente: 'changes ready, waiting for “Publish”', enCours: 'conversations in progress',
    sitesEnLigne: 'of the sites online', colProjet: 'Project', colEtat: 'Status', colVersion: 'Version', colVisites: 'Visits 7 d', colModifie: 'Changed', ilYA: (n: number) => `${n} min ago`, compte: 'Account', claude: 'Claude and vavi', claudeConnecte: 'Claude uses vavi from your conversations. If you disconnect it, it loses all access to your projects and will have to ask for your consent again.' },
} as const;

export default async function Page({ searchParams }: { searchParams: Promise<{ claude?: string }> }) {
  const c = await laConsole('/projets');
  const { claude } = await searchParams;
  const t = TEXTES[c.langue];
  const m = MOTS[c.langue];
  const l = await c.projets.lister(c.compte);
  const maintenant = Date.now();
  const projets = l.lu ? [...l.valeur].sort((a, b) => b.modifieLe.localeCompare(a.modifieLe)) : [];
  const enLigne = projets.filter((p) => p.enLigneEmpreinte !== null);
  // Seul un site en ligne compte des visites : une lecture par site en ligne, illisible ⇒ « — », jamais 0.
  const lues = await Promise.all(enLigne.map(async (p) => [p.id, await lesVisites(c.base, p.id, 7)] as const));
  const visites = new Map(lues.flatMap(([id, r]) => (r.lu ? [[id, lesJours(resumerLAudience(r.valeur).parJour, 7, maintenant)] as const] : [])));
  const totalVu = enLigne.length > 0 && visites.size === enLigne.length;
  const serieDuCompte = lesJours([...visites.values()].flat().reduce<{ jour: string; visites: number }[]>((acc, x) => {
    const d = acc.find((y) => y.jour === x.jour); if (d) d.visites += x.visites; else acc.push({ ...x }); return acc;
  }, []), 7, maintenant);
  const total = serieDuCompte.reduce((n, x) => n + x.visites, 0);
  const date = (iso: string) => new Date(iso).toLocaleDateString(c.langue === 'fr' ? 'fr-FR' : 'en-GB', { day: 'numeric', month: 'long' });
  return (
    <div className="accueil-console">
      <BarreDuCompte langue={c.langue} courriel={c.courriel} ici="projets" />
      <main className="console large">
        <div className="tete-de-page">
          <div><p className="surtitre">{m.surtitre}</p><h1>{t.mesProjets}</h1><p className="attenue">{m.sousTitre}</p></div>
          <a className="bouton" href="https://claude.ai/new" target="_blank" rel="noreferrer">{m.nouveau}</a>
        </div>
        {claude === 'retire' && <p className="carte" role="status">{t.claudeRetire}</p>}
        {claude === 'echec' && <p className="carte" role="alert">{t.claudeEchec}</p>}
        {!l.lu ? <p role="alert">{t.erreur} {l.pourquoi}</p> : l.valeur.length === 0 ? (
          <div className="carte vide"><LogoVavi taille={48} /><p>{t.aucun}</p><p><Link className="bouton" href="/commencer">{t.commencer.lien}</Link></p></div>
        ) : (
          <>
            <div className="indicateurs">
              <div className="indicateur"><span className="attenue">{m.projets}</span><strong>{projets.length}</strong><small>{m.surLeCompte}</small></div>
              <div className="indicateur"><span className="attenue">{m.enLigneK}</span><strong>{enLigne.length}</strong><small>{m.publies(enLigne.length - enLigne.filter(aPublier).length)}</small></div>
              <div className="indicateur"><span className="attenue">{m.aPublierK}</span><strong>{projets.filter(aPublier).length}</strong><small>{m.enAttente}</small></div>
              <div className="indicateur"><span className="attenue">{m.claudeK}</span><strong>{projets.filter((p) => claudeYTravaille(p, maintenant)).length}</strong><small>{m.enCours}</small></div>
              <div className="indicateur"><span className="attenue">{m.visitesK}</span><strong>{totalVu ? total : '—'}</strong>{totalVu ? <Courbe serie={serieDuCompte} largeur={150} hauteur={28} /> : <small>{m.sitesEnLigne}</small>}</div>
            </div>
            <div className="pilotage" role="table" aria-label={t.mesProjets}>
              <div className="pilotage-tete" role="row"><span role="columnheader">{m.colProjet}</span><span role="columnheader">{m.colEtat}</span><span role="columnheader">{m.colVersion}</span><span role="columnheader">{m.colVisites}</span><span role="columnheader">{m.colModifie}</span><span /></div>
              {projets.map((p) => {
                const enL = p.enLigneEmpreinte !== null;
                const v = visites.get(p.id);
                const depuis = Math.round((maintenant - Date.parse(p.modifieLe)) / 60_000);
                return (
                  <div key={p.id} className="pilotage-ligne" role="row">
                    <Link href={`/projets/${p.id}`} className="carte-projet-lien" role="cell">
                      <span className="initiale" aria-hidden="true">{[...p.nom.trim()][0]?.toUpperCase() ?? '·'}</span>
                      <span className="carte-projet-titre"><strong>{p.nom}</strong></span>
                    </Link>
                    <span className="pilotage-etats" role="cell">
                      <span className={`etat ${enL ? 'vert' : ''}`}>{enL ? t.enLigne : p.apercuEmpreinte ? m.pasEnLigne : t.rienAPublier}</span>
                      {aPublier(p) && enL && <span className="etat ambre">{t.aPublier}</span>}
                      {claudeYTravaille(p, maintenant) && <span className="etat bleu"><span className="point" aria-hidden="true" />{m.claudeTravaille}</span>}
                    </span>
                    <span role="cell"><span className="pilotage-libelle">{m.colVersion}</span><span className="mono">v{p.version}</span></span>
                    <span role="cell"><span className="pilotage-libelle">{m.colVisites}</span>{v ? <span className="ligne" style={{ gap: '0.6rem', flexWrap: 'nowrap' }}><Courbe serie={v} largeur={84} hauteur={24} /><span className="mono">{v.reduce((n, x) => n + x.visites, 0)}</span></span> : <span className="mono attenue">—</span>}</span>
                    <span role="cell"><span className="pilotage-libelle">{m.colModifie}</span><span className="mono attenue">{depuis < 60 ? m.ilYA(Math.max(depuis, 0)) : date(p.modifieLe)}</span></span>
                    <span className="pilotage-actions" role="cell">
                      <Link className="bouton" href={`/projets/${p.id}`}>{t.ouvrir}</Link>
                      {enL && <a className="bouton discret" href={adresseDeLApp(p.id, 'en_ligne')} target="_blank" rel="noreferrer">{m.voirLeSite}</a>}
                    </span>
                  </div>
                );
              })}
            </div>
          </>
        )}
        <form action={retirerClaude} className="carte bloc-claude">
          <div><h2>{m.claude}</h2><p className="attenue">{m.claudeConnecte}</p></div>
          <button type="submit" className="discret danger">{t.retirerClaude}</button>
        </form>
      </main>
    </div>
  );
}
