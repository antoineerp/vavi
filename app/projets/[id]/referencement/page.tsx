/**
 * /projets/<id>/referencement — le référencement du site, pour les moteurs de recherche et les assistants IA : ce que vavi
 * sert de lui-même, la note de chaque page publique (lue sur le build, `lib/seo/la-note`), ce qui la ferait monter, et la
 * balise Google Search Console du propriétaire. Demande d'Antoine du 25/11 (le SEO de constructor, repris).
 */
import Link from 'next/link';
import { magasinS3 } from '@/lib/publication/le-magasin';
import { racineDuBuild } from '@/lib/publication/publier';
import { FICHIER_DE_DECOUVERTE, lireLaDecouverte, type Decouverte } from '@/lib/seo/la-decouverte';
import { DESCRIPTION, lesNotes, laNoteDuSite, TEXTE_MIN, TITRE, type Critere, type Point } from '@/lib/seo/la-note';
import { CHEMIN_DU_REFERENCEMENT, leReferencementStocke } from '@/lib/contenus/le-contenu';
import { adresseDeLApp } from '@/app/_partage/l-adresse-des-apps';
import { reglerGoogle } from '../gestes';
import { leProjet, ERREURS } from '../le-projet';

export const dynamic = 'force-dynamic';

const MOTS = {
  fr: {
    titre: 'Référencement (SEO)',
    servi: 'Ce que vavi fait pour chaque site, sans rien à régler',
    servis: ['Chaque page publique est pré-rendue : Google et les assistants IA la lisent sans JavaScript.', 'Plan du site (sitemap.xml) et robots.txt, à jour à chaque publication.',
      'llms.txt et llms-full.txt : le résumé et le texte du site, que lisent ChatGPT, Claude ou Perplexity pour le citer.', 'Adresse canonique et données structurées (schema.org) sur chaque page.',
      'L’aperçu n’est jamais référencé : seul le site en ligne l’est.'],
    voir: 'Voir',
    note: 'Note du site', pages: 'Note de chaque page publique', sansPages: 'Les pages publiques apparaissent ici après un premier aperçu construit.',
    lu: (enLigne: boolean) => (enLigne ? 'Lu sur le site en ligne.' : 'Lu sur l’aperçu : le site n’est pas encore en ligne.'),
    criteres: {
      titre: (m?: number) => `Titre de ${TITRE.min} à ${TITRE.max} caractères${m !== undefined ? ` (${m})` : ''}`,
      titre_unique: () => 'Titre propre à cette page',
      description: (m?: number) => `Description de ${DESCRIPTION.min} à ${DESCRIPTION.max} caractères${m !== undefined ? ` (${m})` : ''}`,
      texte: (m?: number) => `Au moins ${TEXTE_MIN} caractères de texte lisible${m !== undefined ? ` (${m})` : ''}`,
      image: () => 'Image de partage (réseaux sociaux, messageries)',
      editeur: () => 'Qui publie le site (nom, coordonnées) : utile à Google et aux IA',
    } as Record<Critere, (m?: number) => string>,
    gestes: {
      titre: 'Changez-le dans « Apparence et titres ».', titre_unique: 'Changez-le dans « Apparence et titres ».', description: 'Changez-la dans « Apparence et titres ».',
      texte: 'Demandez à Claude d’écrire plus de contenu sur cette page.', image: 'Demandez à Claude de poser une image de partage.', editeur: 'Demandez à Claude de déclarer l’éditeur du site (nom, adresse, contact).',
    } as Record<Critere, string>,
    google: 'Google Search Console', googleExplication: 'Pour suivre vos positions et vos clics dans Google : ajoutez votre site dans Search Console (méthode « Balise HTML »), collez ici la balise qu’il affiche, enregistrez, puis cliquez sur « Valider » dans Search Console.',
    googlePose: 'Balise posée sur le site en ligne.', enregistrer: 'Enregistrer', googleSansBase: 'La balise Google arrive avec la prochaine mise à jour de la base.',
    googleFait: 'Balise enregistrée : elle est sur le site en ligne, sans republier.', visites: 'Les visites de votre site se suivent dans « Visites ».', modifier: 'Changer les titres et descriptions',
  },
  en: {
    titre: 'Search (SEO)',
    servi: 'What vavi does for every site, with nothing to set',
    servis: ['Every public page is pre-rendered: Google and AI assistants read it without JavaScript.', 'Sitemap (sitemap.xml) and robots.txt, updated at every publication.',
      'llms.txt and llms-full.txt: the site’s summary and text, which ChatGPT, Claude or Perplexity read to cite it.', 'Canonical address and structured data (schema.org) on every page.',
      'The preview is never indexed: only the live site is.'],
    voir: 'View',
    note: 'Site score', pages: 'Score of each public page', sansPages: 'Public pages appear here after a first preview is built.',
    lu: (enLigne: boolean) => (enLigne ? 'Read from the live site.' : 'Read from the preview: the site is not online yet.'),
    criteres: {
      titre: (m?: number) => `Title of ${TITRE.min} to ${TITRE.max} characters${m !== undefined ? ` (${m})` : ''}`,
      titre_unique: () => 'Title unique to this page',
      description: (m?: number) => `Description of ${DESCRIPTION.min} to ${DESCRIPTION.max} characters${m !== undefined ? ` (${m})` : ''}`,
      texte: (m?: number) => `At least ${TEXTE_MIN} characters of readable text${m !== undefined ? ` (${m})` : ''}`,
      image: () => 'Sharing image (social networks, messaging apps)',
      editeur: () => 'Who publishes the site (name, contact): useful to Google and AI',
    } as Record<Critere, (m?: number) => string>,
    gestes: {
      titre: 'Change it in “Appearance and titles”.', titre_unique: 'Change it in “Appearance and titles”.', description: 'Change it in “Appearance and titles”.',
      texte: 'Ask Claude to write more content on this page.', image: 'Ask Claude to set a sharing image.', editeur: 'Ask Claude to declare the site’s publisher (name, address, contact).',
    } as Record<Critere, string>,
    google: 'Google Search Console', googleExplication: 'To follow your positions and clicks in Google: add your site in Search Console (“HTML tag” method), paste the tag it shows here, save, then click “Verify” in Search Console.',
    googlePose: 'Tag set on the live site.', enregistrer: 'Save', googleSansBase: 'The Google tag comes with the next database update.',
    googleFait: 'Tag saved: it is on the live site, no need to publish again.', visites: 'Your site’s visits are in “Visits”.', modifier: 'Change titles and descriptions',
  },
} as const;

async function laDecouverte(projet: string, empreinte: string | null): Promise<Decouverte | null> {
  const magasin = magasinS3();
  if (!empreinte || !magasin.lu) return null;
  const o = await magasin.magasin.lire(`${racineDuBuild(projet, empreinte)}/${FICHIER_DE_DECOUVERTE}`).catch(() => 'absent' as const);
  return o === 'absent' ? null : lireLaDecouverte(o.octets.toString('utf8'));
}

const couleur = (note: number): string => (note >= 80 ? 'var(--vert)' : note >= 50 ? 'var(--accent)' : 'var(--alerte)');

function Ligne({ p, m }: { p: Point; m: (typeof MOTS)['fr' | 'en'] }) {
  return (
    <li style={{ display: 'block', border: 0, padding: '0.15rem 0' }}>
      <span aria-hidden="true" style={{ color: p.ok ? 'var(--vert)' : 'var(--alerte)', fontWeight: 700 }}>{p.ok ? '✓' : '✗'}</span>{' '}
      {m.criteres[p.critere](p.mesure)}{!p.ok && <span className="attenue"> · {m.gestes[p.critere]}</span>}
    </li>
  );
}

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params;
  const q = await searchParams;
  const { c, t, p } = await leProjet(id, 'referencement');
  const m = MOTS[c.langue];
  if (!p.lu) return <main className="console"><h1>{m.titre}</h1><p role="alert">{t.erreur} {ERREURS.panne![c.langue]}</p></main>;
  const projet = p.valeur!;
  const enLigne = Boolean(projet.enLigneEmpreinte);
  const [d, f, reglages] = await Promise.all([laDecouverte(id, projet.enLigneEmpreinte ?? projet.apercuEmpreinte), c.projets.fichiers(c.compte, id), c.projets.reglages(c.compte, id)]);
  const image = f.lu ? Boolean(leReferencementStocke(f.valeur.get(CHEMIN_DU_REFERENCEMENT)).image) : false;
  const notes = d ? lesNotes(d, { image }) : [];
  const site = laNoteDuSite(notes);
  const racine = enLigne ? adresseDeLApp(id, 'en_ligne').replace(/\/$/, '') : null;
  const message = q.fait === 'google' ? m.googleFait : q.erreur ? `${t.erreur} ${ERREURS[q.erreur]?.[c.langue] ?? q.erreur}` : null;
  return (
    <main className="console">
      <h1>{m.titre}</h1>
      {message && <div className="carte" role={q.erreur ? 'alert' : 'status'}>{message}</div>}

      <section className="carte">
        <h2>{m.servi}</h2>
        <ul style={{ paddingLeft: '1.1rem', margin: 0 }}>{m.servis.map((s) => <li key={s}>{s}</li>)}</ul>
        {racine && <p className="attenue" style={{ marginBottom: 0 }}>{m.voir} : {['sitemap.xml', 'robots.txt', 'llms.txt'].map((n, i) => <span key={n}>{i > 0 && ' · '}<a href={`${racine}/${n}`} target="_blank" rel="noreferrer">{n}</a></span>)}</p>}
      </section>

      <section className="carte">
        <div className="entete" style={{ marginBottom: 0 }}>
          <h2>{m.pages}</h2>
          {site !== null && <strong style={{ fontSize: '1.4rem', color: couleur(site) }} aria-label={m.note}>{site}/100</strong>}
        </div>
        {notes.length === 0 ? <p className="attenue">{m.sansPages}</p> : (
          <>
            <p className="attenue">{m.lu(enLigne)} <Link href={`/projets/${id}/contenu`}>{m.modifier}</Link></p>
            {notes.map((n) => (
              <details key={n.adresse} style={{ borderTop: '1px solid var(--bord)', padding: '0.6rem 0' }} open={n.note < 100 && notes.length <= 3}>
                <summary style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
                  <span><strong>{n.titre || n.adresse}</strong> <span className="attenue">{n.adresse}</span></span>
                  <strong style={{ color: couleur(n.note) }}>{n.note}/100</strong>
                </summary>
                <ul style={{ listStyle: 'none', padding: 0, margin: '0.5rem 0 0' }}>{n.points.map((x) => <Ligne key={x.critere} p={x} m={m} />)}</ul>
              </details>
            ))}
          </>
        )}
      </section>

      <form action={reglerGoogle.bind(null, id)} className="carte" autoComplete="off">
        <label htmlFor="google">{m.google}</label>
        <p className="attenue" style={{ marginTop: 0 }}>{m.googleExplication} <a href="https://search.google.com/search-console" target="_blank" rel="noreferrer">search.google.com/search-console</a></p>
        {reglages.lu ? (
          <>
            <input id="google" name="google" maxLength={1000} defaultValue={reglages.valeur.verificationGoogle ?? ''} placeholder='<meta name="google-site-verification" content="…">' style={{ width: '100%' }} />
            {reglages.valeur.verificationGoogle && <p className="attenue">{m.googlePose}</p>}
            <button type="submit">{m.enregistrer}</button>
          </>
        ) : <p className="attenue">{m.googleSansBase}</p>}
      </form>
      <p className="attenue"><Link href={`/projets/${id}/visites`}>{m.visites}</Link></p>
    </main>
  );
}
