/** /projets — les projets de la personne, et où en est chacun (en ligne, changements à publier, Claude qui y travaille). */
import Link from 'next/link';
import { laConsole } from '@/app/_partage/la-console';
import { TEXTES } from '@/app/_partage/textes';
import { LogoVavi } from '@/app/_partage/le-logo';
import { adresseDeLApp } from '@/app/_partage/l-adresse-des-apps';
import { seDeconnecter } from '@/app/_partage/se-deconnecter';
import type { Projet } from '@/lib/projets/les-projets';
import { retirerClaude } from './retirer-claude';

export const dynamic = 'force-dynamic';

/** Le travail de Claude compte comme « en cours » 30 minutes après son dernier geste, comme la plateforme qui le relâche. */
const CLAUDE_Y_TRAVAILLE_MS = 30 * 60 * 1000;
const claudeYTravaille = (p: Projet, maintenant: number): boolean =>
  p.chantier !== null && maintenant - Date.parse(p.chantier.dernierGesteLe) < CLAUDE_Y_TRAVAILLE_MS;

const MOTS = {
  fr: { sousTitre: 'Vos sites et vos apps, construits avec Claude.', nouveau: 'Nouveau projet dans Claude', modifie: 'modifié le', claudeTravaille: 'Claude y travaille',
    voirLeSite: 'Voir le site', pasEnLigne: 'Pas encore en ligne', compte: 'Compte', claude: 'Claude et vavi', claudeConnecte: 'Claude se sert de vavi depuis vos conversations. Si vous le déconnectez, il perd tout accès à vos projets et devra redemander votre accord.' },
  en: { sousTitre: 'Your sites and apps, built with Claude.', nouveau: 'New project in Claude', modifie: 'changed on', claudeTravaille: 'Claude is working on it',
    voirLeSite: 'View the site', pasEnLigne: 'Not online yet', compte: 'Account', claude: 'Claude and vavi', claudeConnecte: 'Claude uses vavi from your conversations. If you disconnect it, it loses all access to your projects and will have to ask for your consent again.' },
} as const;

export default async function Page({ searchParams }: { searchParams: Promise<{ claude?: string }> }) {
  const c = await laConsole('/projets');
  const { claude } = await searchParams;
  const t = TEXTES[c.langue];
  const m = MOTS[c.langue];
  const l = await c.projets.lister(c.compte);
  const maintenant = Date.now();
  const date = (iso: string) => new Date(iso).toLocaleDateString(c.langue === 'fr' ? 'fr-FR' : 'en-GB', { day: 'numeric', month: 'long' });
  return (
    <div className="accueil-console">
      <header className="barre">
        <Link href="/projets" className="marque" aria-label="vavi"><LogoVavi /> vavi</Link>
        <nav className="barre-droite" aria-label={m.compte}>
          <Link href="/abonnement">{t.abonnement.titre}</Link>
          <span className="attenue barre-courriel">{c.courriel}</span>
          <form action={seDeconnecter}><button type="submit" className="discret petit">{t.deconnexion}</button></form>
        </nav>
      </header>
      <main className="console large">
        <div className="tete-de-page">
          <div><h1>{t.mesProjets}</h1><p className="attenue">{m.sousTitre}</p></div>
          <a className="bouton" href="https://claude.ai/new" target="_blank" rel="noreferrer">{m.nouveau}</a>
        </div>
        {claude === 'retire' && <p className="carte" role="status">{t.claudeRetire}</p>}
        {claude === 'echec' && <p className="carte" role="alert">{t.claudeEchec}</p>}
        {!l.lu ? <p role="alert">{t.erreur} {l.pourquoi}</p> : l.valeur.length === 0 ? (
          <div className="carte vide"><LogoVavi taille={48} /><p>{t.aucun}</p><p><Link className="bouton" href="/commencer">{t.commencer.lien}</Link></p></div>
        ) : (
          <ul className="grille-projets">
            {[...l.valeur].sort((a, b) => b.modifieLe.localeCompare(a.modifieLe)).map((p) => {
              const enLigne = p.enLigneEmpreinte !== null;
              const aPublier = p.apercuEmpreinte !== null && p.apercuEmpreinte !== p.enLigneEmpreinte;
              return (
                <li key={p.id} className="carte-projet">
                  <Link href={`/projets/${p.id}`} className="carte-projet-lien">
                    <span className="initiale" aria-hidden="true">{[...p.nom.trim()][0]?.toUpperCase() ?? '·'}</span>
                    <span className="carte-projet-titre"><strong>{p.nom}</strong><span className="attenue">{t.version} {p.version} · {m.modifie} {date(p.modifieLe)}</span></span>
                  </Link>
                  <div className="ligne">
                    <span className={`etat ${enLigne ? 'vert' : ''}`}>{enLigne ? t.enLigne : p.apercuEmpreinte ? m.pasEnLigne : t.rienAPublier}</span>
                    {aPublier && enLigne && <span className="etat ambre">{t.aPublier}</span>}
                    {claudeYTravaille(p, maintenant) && <span className="etat bleu"><span className="point" aria-hidden="true" />{m.claudeTravaille}</span>}
                  </div>
                  <div className="ligne carte-projet-actions">
                    <Link className="bouton" href={`/projets/${p.id}`}>{t.ouvrir}</Link>
                    {enLigne && <a className="bouton discret" href={adresseDeLApp(p.id, 'en_ligne')} target="_blank" rel="noreferrer">{m.voirLeSite}</a>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <form action={retirerClaude} className="carte bloc-claude">
          <div><h2>{m.claude}</h2><p className="attenue">{m.claudeConnecte}</p></div>
          <button type="submit" className="discret danger">{t.retirerClaude}</button>
        </form>
      </main>
    </div>
  );
}
