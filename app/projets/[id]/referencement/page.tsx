/**
 * /projets/<id>/referencement — le référencement du site, pour les moteurs de recherche et les assistants IA : ce que vavi
 * sert de lui-même, la note de chaque page publique (lue sur le build, `lib/seo/la-note`), ce qui la ferait monter, et la
 * balise Google Search Console du propriétaire. Demande d'Antoine du 25/11 (le SEO de constructor, repris).
 * Complété le 25/11 (« la console est bien moins fournie que constructor ») de ce que `ReferencementDeLApp` de
 * constructor-v13@32d18f3 tenait : « Être trouvé » (`lib/seo/etre-trouve.ts`), le nom, la description et l'éditeur du
 * site, le titre et la description de chaque page sur place, l'image de partage, le choix des robots d'IA, les visites
 * venues des moteurs et des assistants.
 */
import Link from 'next/link';
import { magasinS3 } from '@/lib/publication/le-magasin';
import { racineDuBuild } from '@/lib/publication/publier';
import { FICHIER_DE_DECOUVERTE, lireLaDecouverte, type Decouverte } from '@/lib/seo/la-decouverte';
import { DESCRIPTION, lesNotes, laNoteDuSite, TEXTE_MIN, TITRE, type Critere, type Point } from '@/lib/seo/la-note';
import { CHEMIN_DU_REFERENCEMENT, leReferencementStocke } from '@/lib/contenus/le-contenu';
import { CHEMIN_DES_IMAGES, lireLesImages } from '@/lib/images/la-banque';
import { leManifesteStocke } from '@/lib/projets/l-arbre-d-un-projet';
import { lesVisites } from '@/lib/formulaires/sur-supabase';
import { depuisLaRecherche } from '@/lib/formulaires/l-audience';
import { lesCoordonneesManquantes, pourEtreTrouve, type EtatDUnPas } from '@/lib/seo/etre-trouve';
import { adresseDeLApp } from '@/app/_partage/l-adresse-des-apps';
import { reglerGoogle } from '../gestes';
import { enregistrerLePartage, enregistrerLeReferencement, enregistrerLeSite } from '../contenu/gestes';
import { leProjet, ERREURS } from '../le-projet';

export const dynamic = 'force-dynamic';

const MOTS = {
  fr: {
    trouve: 'Être trouvé sur Google et les IA', chezGoogle: 'chez Google', ouvrir: 'Ouvrir',
    site: 'Le site', siteExplication: 'Ce que Google, les assistants IA et les mentions légales disent de votre site. Enregistrez : l’aperçu est rebâti, puis « Publier » le met en ligne.',
    nom: 'Nom du site', description: 'Ce que fait le site (une ou deux phrases)', editeur: 'Qui publie le site', editeurNom: 'Nom ou raison sociale', adresse: 'Adresse',
    telephone: 'Téléphone', courriel: 'Courriel', immatriculation: 'Immatriculation (SIRET…)', horaires: 'Horaires (une ligne par plage)',
    pageTitre: 'Titre dans Google', pageDescription: 'Description dans Google', conseil: (n: number, max: number) => `${n}/${max} caractères conseillés`,
    enregistrerPages: 'Enregistrer les titres et descriptions',
    partage: 'Image de partage et assistants IA', image: 'L’image qui accompagne vos liens partagés', aucuneImage: 'Aucune', sansPhoto: 'Votre site n’a pas encore de photo : demandez à Claude d’en poser, puis choisissez-la ici.',
    assistants: 'Les assistants IA (ChatGPT, Claude, Perplexity…) peuvent lire le site pour le citer avec son lien',
    entrainement: 'Les robots qui collectent pour entraîner des modèles d’IA peuvent lire le site', robotsMoteurs: 'Google et les autres moteurs de recherche ne sont jamais concernés.',
    enregistrerPartage: 'Enregistrer', depuis: 'Venus de la recherche (30 jours)', moteurs: 'depuis un moteur de recherche', depuisAssistants: 'depuis un assistant IA',
    fait: { site: 'Le site est enregistré.', referencement: 'Titres et descriptions enregistrés.', partage: 'Enregistré.' } as Record<string, string>,
    apercu: { a_jour: 'L’aperçu est à jour : publiez pour mettre en ligne.', build_rouge: 'L’aperçu n’a pas pu être rebâti : le changement est gardé, demandez à Claude de regarder.', rien_change: 'Rien n’a changé.' } as Record<string, string>,
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
    trouve: 'Being found on Google and AI', chezGoogle: 'at Google', ouvrir: 'Open',
    site: 'The site', siteExplication: 'What Google, AI assistants and the legal notice say about your site. Save: the preview is rebuilt, then “Publish” puts it online.',
    nom: 'Site name', description: 'What the site does (one or two sentences)', editeur: 'Who publishes the site', editeurNom: 'Name or company name', adresse: 'Address',
    telephone: 'Phone', courriel: 'E-mail', immatriculation: 'Registration number', horaires: 'Opening hours (one line per range)',
    pageTitre: 'Title in Google', pageDescription: 'Description in Google', conseil: (n: number, max: number) => `${n}/${max} characters advised`,
    enregistrerPages: 'Save titles and descriptions',
    partage: 'Sharing image and AI assistants', image: 'The image that comes with your shared links', aucuneImage: 'None', sansPhoto: 'Your site has no photo yet: ask Claude to add some, then pick one here.',
    assistants: 'AI assistants (ChatGPT, Claude, Perplexity…) may read the site to cite it with its link',
    entrainement: 'Robots that collect data to train AI models may read the site', robotsMoteurs: 'Google and other search engines are never affected.',
    enregistrerPartage: 'Save', depuis: 'From search (30 days)', moteurs: 'from a search engine', depuisAssistants: 'from an AI assistant',
    fait: { site: 'The site is saved.', referencement: 'Titles and descriptions saved.', partage: 'Saved.' } as Record<string, string>,
    apercu: { a_jour: 'The preview is up to date: publish to put it online.', build_rouge: 'The preview could not be rebuilt: the change is kept, ask Claude to look.', rien_change: 'Nothing changed.' } as Record<string, string>,
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

const MARQUE: Record<EtatDUnPas, { readonly signe: string; readonly teinte: string }> = {
  fait: { signe: '✓', teinte: 'var(--vert)' }, 'a-faire': { signe: '○', teinte: 'var(--alerte)' }, 'chez-google': { signe: '→', teinte: 'var(--accent)' },
};
const GRILLE = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '0.75rem' } as const;

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params;
  const q = await searchParams;
  const { c, t, p } = await leProjet(id, 'referencement');
  const m = MOTS[c.langue];
  if (!p.lu) return <main className="console"><h1>{m.titre}</h1><p role="alert">{t.erreur} {ERREURS.panne![c.langue]}</p></main>;
  const projet = p.valeur!;
  const enLigne = Boolean(projet.enLigneEmpreinte);
  const [d, f, reglages, visites] = await Promise.all([laDecouverte(id, projet.enLigneEmpreinte ?? projet.apercuEmpreinte), c.projets.fichiers(c.compte, id),
    c.projets.reglages(c.compte, id), lesVisites(c.base, id, 30)]);
  const fichiers = f.lu ? f.valeur : new Map<string, string>();
  const ref = leReferencementStocke(fichiers.get(CHEMIN_DU_REFERENCEMENT));
  const lu = leManifesteStocke(fichiers.get('app.json'));
  const app = lu.lu ? lu.manifeste : null;
  const editeur = app?.editeur ?? {};
  const photos = Object.entries(lireLesImages(fichiers.get(CHEMIN_DES_IMAGES))).filter(([, i]) => i?.sources?.length)
    .map(([nom, i]) => ({ nom, alt: i.alt, vignette: i.sources[0]![1], partage: i.sources[i.sources.length - 1]![1] }));
  const notes = d ? lesNotes(d, { image: Boolean(ref.image) }) : [];
  const site = laNoteDuSite(notes);
  const racine = enLigne ? adresseDeLApp(id, 'en_ligne').replace(/\/$/, '') : '';
  const pagesPubliques = (d?.pages ?? []).map((x) => x.adresse);
  const pas = pourEtreTrouve({
    publie: enLigne && d !== null, adresse: racine, domaineActif: false, jetonGoogle: reglages.lu && Boolean(reglages.valeur.verificationGoogle),
    pages: pagesPubliques, pagesDecrites: pagesPubliques.filter((a) => Boolean(ref.pages[a]?.description)), imageDePartage: Boolean(ref.image),
    coordonneesManquantes: lesCoordonneesManquantes(editeur), adressePostale: Boolean(editeur.adresse), assistantsAutorises: ref.ia?.assistants !== false,
  });
  const recherche = visites.lu ? depuisLaRecherche(visites.valeur) : null;
  const message = q.fait === 'google' ? m.googleFait : q.fait ? `${m.fait[q.fait] ?? ''} ${q.apercu ? m.apercu[q.apercu] ?? '' : ''}`
    : q.erreur ? `${t.erreur} ${ERREURS[q.erreur]?.[c.langue] ?? q.erreur}${q.detail ? ` ${q.detail}` : ''}` : null;
  return (
    <main className="console">
      <h1>{m.titre}</h1>
      {message && <div className="carte" role={q.erreur ? 'alert' : 'status'}>{message}</div>}

      <section className="carte">
        <h2>{m.trouve}</h2>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {pas.map((x) => (
            <li key={x.id} style={{ display: 'flex', gap: '0.5rem', border: 0, padding: '0.3rem 0' }}>
              <span aria-hidden="true" style={{ width: '1rem', fontWeight: 700, color: MARQUE[x.etat].teinte }}>{MARQUE[x.etat].signe}</span>
              <span><strong>{x.titre}</strong>{x.etat === 'chez-google' && <span className="attenue"> ({m.chezGoogle})</span>}<br /><span className="attenue">{x.aide}</span>
                {x.lien && <> <a href={x.lien} target="_blank" rel="noreferrer">{m.ouvrir}</a></>}</span>
            </li>
          ))}
        </ul>
      </section>

      {app && (
        <form action={enregistrerLeSite.bind(null, id)} className="carte" id="site">
          <h2>{m.site}</h2>
          <p className="attenue">{m.siteExplication}</p>
          <label htmlFor="nom">{m.nom}</label>
          <input id="nom" name="nom" required maxLength={120} defaultValue={app.nom} />
          <label htmlFor="description">{m.description}</label>
          <textarea id="description" name="description" rows={2} maxLength={400} defaultValue={app.description} />
          <h3>{m.editeur}</h3>
          <div style={GRILLE}>
            {([['editeur_nom', m.editeurNom, editeur.nom], ['editeur_adresse', m.adresse, editeur.adresse], ['editeur_telephone', m.telephone, editeur.telephone],
              ['editeur_courriel', m.courriel, editeur.courriel], ['editeur_immatriculation', m.immatriculation, editeur.immatriculation]] as const).map(([n, l, v]) => (
              <div key={n}><label htmlFor={n}>{l}</label><input id={n} name={n} maxLength={300} defaultValue={v ?? ''} type={n === 'editeur_courriel' ? 'email' : n === 'editeur_telephone' ? 'tel' : 'text'} /></div>
            ))}
          </div>
          <label htmlFor="editeur_horaires">{m.horaires}</label>
          <textarea id="editeur_horaires" name="editeur_horaires" rows={3} defaultValue={(editeur.horaires ?? []).join('\n')} />
          <button type="submit">{m.enregistrer}</button>
        </form>
      )}

      <section className="carte" id="pages">
        <div className="entete" style={{ marginBottom: 0 }}>
          <h2>{m.pages}</h2>
          {site !== null && <strong style={{ fontSize: '1.4rem', color: couleur(site) }} aria-label={m.note}>{site}/100</strong>}
        </div>
        {notes.length === 0 ? <p className="attenue">{m.sansPages}</p> : (
          <form action={enregistrerLeReferencement.bind(null, id)}>
            <input type="hidden" name="retour" value="referencement" />
            <p className="attenue">{m.lu(enLigne)}</p>
            {notes.map((n) => {
              const choisi = ref.pages[n.adresse] ?? {};
              return (
                <details key={n.adresse} style={{ borderTop: '1px solid var(--bord)', padding: '0.6rem 0' }} open={n.note < 100 && notes.length <= 3}>
                  <summary style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
                    <span><strong>{n.titre || n.adresse}</strong> <span className="attenue">{n.adresse}</span></span>
                    <strong style={{ color: couleur(n.note) }}>{n.note}/100</strong>
                  </summary>
                  <ul style={{ listStyle: 'none', padding: 0, margin: '0.5rem 0' }}>{n.points.map((x) => <Ligne key={x.critere} p={x} m={m} />)}</ul>
                  <input type="hidden" name="adresse" value={n.adresse} />
                  <label htmlFor={`titre:${n.adresse}`}>{m.pageTitre} <span className="attenue">({m.conseil(TITRE.min, TITRE.max)})</span></label>
                  <input id={`titre:${n.adresse}`} name={`titre:${n.adresse}`} maxLength={70} defaultValue={choisi.titre ?? ''} placeholder={n.titre} />
                  <label htmlFor={`description:${n.adresse}`}>{m.pageDescription} <span className="attenue">({m.conseil(DESCRIPTION.min, DESCRIPTION.max)})</span></label>
                  <textarea id={`description:${n.adresse}`} name={`description:${n.adresse}`} rows={2} maxLength={200} defaultValue={choisi.description ?? ''} />
                </details>
              );
            })}
            <button type="submit">{m.enregistrerPages}</button>
          </form>
        )}
      </section>

      <form action={enregistrerLePartage.bind(null, id)} className="carte" id="partage">
        <h2>{m.partage}</h2>
        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend>{m.image}</legend>
          {photos.length === 0 ? <p className="attenue">{m.sansPhoto}</p> : (
            <div style={GRILLE}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}><input type="radio" name="image" value="aucune" defaultChecked={!ref.image} /> {m.aucuneImage}</label>
              {photos.map((x) => (
                <label key={x.nom} style={{ display: 'block', cursor: 'pointer' }}>
                  <img src={x.vignette} alt={x.alt} style={{ width: '100%', aspectRatio: '1.91 / 1', objectFit: 'cover', borderRadius: 8 }} />
                  <span><input type="radio" name="image" value={x.partage} defaultChecked={ref.image === x.partage} /> {x.alt}</span>
                </label>
              ))}
            </div>
          )}
        </fieldset>
        <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', marginTop: '1rem' }}><input type="checkbox" name="assistants" value="oui" defaultChecked={ref.ia?.assistants !== false} /> {m.assistants}</label>
        <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}><input type="checkbox" name="entrainement" value="oui" defaultChecked={ref.ia?.entrainement !== false} /> {m.entrainement}</label>
        <p className="attenue">{m.robotsMoteurs}</p>
        <button type="submit">{m.enregistrerPartage}</button>
      </form>

      <section className="carte">
        <h2>{m.servi}</h2>
        <ul style={{ paddingLeft: '1.1rem', margin: 0 }}>{m.servis.map((x) => <li key={x}>{x}</li>)}</ul>
        {racine && <p className="attenue" style={{ marginBottom: 0 }}>{m.voir} : {['sitemap.xml', 'robots.txt', 'llms.txt'].map((n, i) => <span key={n}>{i > 0 && ' · '}<a href={`${racine}/${n}`} target="_blank" rel="noreferrer">{n}</a></span>)}</p>}
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

      <section className="carte">
        <h2>{m.depuis}</h2>
        {recherche === null ? <p className="attenue">{t.erreur}</p> : (
          <>
            <p style={{ margin: 0 }}><strong>{recherche.moteurs}</strong> {m.moteurs} · <strong>{recherche.assistants}</strong> {m.depuisAssistants}</p>
            {recherche.parAssistant.length > 0 && <p className="attenue">{recherche.parAssistant.map((x) => `${x.hote} : ${x.visites}`).join(' · ')}</p>}
          </>
        )}
        <p className="attenue" style={{ marginBottom: 0 }}><Link href={`/projets/${id}/visites`}>{m.visites}</Link></p>
      </section>
    </main>
  );
}
