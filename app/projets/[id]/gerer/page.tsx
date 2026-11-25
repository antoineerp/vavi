/**
 * /projets/<id>/gerer — « Gérer le contenu » : ce que la personne gère elle-même, sans modèle, en un lieu (Antoine, 25/11 :
 * comme le /manage de constructor). Onglets : « Textes et images » (ici : les photos de l'app, remplacées par une autre de
 * la banque, et les textes réécrits dans l'aperçu), « Données » et « Formulaires » (les écrans qui les tiennent déjà).
 */
import Link from 'next/link';
import { adresseDeLApp } from '@/app/_partage/l-adresse-des-apps';
import { banqueDeLaPlateforme, CHEMIN_DES_IMAGES, lireLesImages, type ImageTrouvee } from '@/lib/images/la-banque';
import { EditeurDeTextes } from '../editeur';
import { leProjet } from '../le-projet';
import { chercherDesPhotos, choisirUnePhoto, fournirUnePhoto, rendreLaPhotoALaBanque } from '../contenu/gestes';

export const dynamic = 'force-dynamic';

const MOTS = {
  fr: { titre: 'Gérer le contenu', onglets: ['Textes et images', 'Données', 'Formulaires'], images: 'Images',
    imagesExplication: 'Les photos que montrent vos pages. Remplacez-en une par une autre de la banque, ou par la vôtre ; l’aperçu est rebâti.',
    aucune: 'Vos pages ne montrent pas encore de photo de la banque : demandez à Claude d’en ajouter.',
    sansBanque: 'La banque de photos n’est pas encore branchée sur vavi : le remplacement arrive dès qu’elle l’est.',
    banque: 'Image de la banque', par: 'Photo :', remplacer: 'Remplacer…', sujet: 'Ce que la photo doit montrer (en anglais, c’est plus précis)',
    choisir: 'Choisissez la nouvelle photo', alt: 'Ce que la photo montre (lu par les lecteurs d’écran et les moteurs)', utiliser: 'Utiliser cette photo',
    rien: 'La banque n’a rien trouvé : essayez un ou deux mots plus concrets.', panneBanque: 'La banque de photos n’a pas répondu ; réessayez.',
    fait: 'Photo remplacée.', apercu: { a_jour: 'L’aperçu est à jour : publiez pour mettre en ligne.', build_rouge: 'L’aperçu n’a pas pu être rebâti : le changement est gardé, demandez à Claude de regarder.', rien_change: 'Rien n’a changé.' } as Record<string, string>,
    votre: 'Votre photo', fournir: 'Ou mettez la vôtre (JPEG, PNG ou WebP, 8 Mo au plus ; le lieu de la prise de vue est retiré)', mettre: 'Mettre ma photo',
    altFournie: 'Ce que montre votre photo', revenir: 'Revenir à la photo de la banque',
    erreurs: { chantier_ouvert: 'Claude travaille sur ce projet : réessayez quand il a fini.', conflit: 'Le projet a changé entre-temps : rechargez la page.', panne: 'vavi n’a pas répondu ; réessayez.', mal_forme: 'À corriger :' } as Record<string, string> },
  en: { titre: 'Manage content', onglets: ['Texts and images', 'Data', 'Forms'], images: 'Images',
    imagesExplication: 'The photos your pages show. Replace one with another bank photo, or with your own; the preview is rebuilt.',
    aucune: 'Your pages do not show any bank photo yet: ask Claude to add some.',
    sansBanque: 'The photo bank is not connected to vavi yet: replacing comes as soon as it is.',
    banque: 'Bank image', par: 'Photo:', remplacer: 'Replace…', sujet: 'What the photo should show',
    choisir: 'Pick the new photo', alt: 'What the photo shows (read by screen readers and search engines)', utiliser: 'Use this photo',
    rien: 'The bank found nothing: try one or two more concrete words.', panneBanque: 'The photo bank did not answer; try again.',
    fait: 'Photo replaced.', apercu: { a_jour: 'The preview is up to date: publish to put it online.', build_rouge: 'The preview could not be rebuilt: the change is kept, ask Claude to look.', rien_change: 'Nothing changed.' } as Record<string, string>,
    votre: 'Your photo', fournir: 'Or use your own (JPEG, PNG or WebP, 8 MB at most; where it was taken is removed)', mettre: 'Use my photo',
    altFournie: 'What your photo shows', revenir: 'Back to the bank photo',
    erreurs: { chantier_ouvert: 'Claude is working on this project: try again when it is done.', conflit: 'The project changed meanwhile: reload the page.', panne: 'vavi did not answer; try again.', mal_forme: 'To fix:' } as Record<string, string> },
} as const;

const GRILLE = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '1rem' } as const;

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params;
  const q = await searchParams;
  const { c, t, p } = await leProjet(id, 'gerer');
  const m = MOTS[c.langue];
  if (!p.lu) return <main className="console"><h1>{m.titre}</h1><p role="alert">{t.erreur} {p.pourquoi}</p></main>;
  const f = await c.projets.fichiers(c.compte, id);
  const photos = Object.entries(lireLesImages(f.lu ? f.valeur.get(CHEMIN_DES_IMAGES) : undefined)).filter(([, i]) => i?.sources?.length);
  const banque = banqueDeLaPlateforme();
  // Les photos proposées pour la photo en cours de remplacement : relues dans la banque à chaque affichage.
  let proposees: readonly ImageTrouvee[] | 'panne' = [];
  if (banque && q.photo && q.sujet && photos.some(([n]) => n === q.photo)) proposees = await banque.chercher(q.sujet.slice(0, 120), 8, new Set()).catch(() => 'panne' as const);
  const message = q.fait ? `${m.fait} ${q.apercu ? m.apercu[q.apercu] ?? '' : ''}` : q.erreur ? `${m.erreurs[q.erreur] ?? q.erreur}${q.detail ? ` ${q.detail}` : ''}` : null;
  const onglets = [`/projets/${id}/gerer`, `/projets/${id}/donnees`, `/projets/${id}/messages`];
  return (
    <main className="console">
      <h1>{m.titre}</h1>
      <nav className="ligne" aria-label={m.titre} style={{ marginBottom: '1rem' }}>
        {onglets.map((vers, i) => <Link key={vers} href={vers} className={`bouton ${i === 0 ? 'pastille' : 'discret'}`} aria-current={i === 0 ? 'page' : undefined}>{m.onglets[i]}</Link>)}
      </nav>
      {message && <div className="carte" role={q.erreur ? 'alert' : 'status'}>{message}</div>}

      <section className="carte">
        <h2>{m.images}</h2>
        <p className="attenue">{photos.length ? m.imagesExplication : m.aucune}</p>
        {photos.length > 0 && !banque && <p className="attenue">{m.sansBanque}</p>}
        <div style={GRILLE}>
          {photos.map(([nom, i]) => (
            <div key={nom} id={`photo-${nom}`} className="carte" style={{ margin: 0 }}>
              <img src={i.fournie?.source ?? i.sources[0]![1]} alt={i.fournie?.alt ?? i.alt} style={{ width: '100%', aspectRatio: '4 / 3', objectFit: 'cover', borderRadius: 8 }} />
              <p style={{ margin: '0.5rem 0 0.25rem' }}>{i.fournie?.alt ?? i.alt}</p>
              <p className="attenue" style={{ margin: 0, fontSize: '0.85rem' }}>{i.fournie ? m.votre : `${m.banque}${i.auteur ? ` · ${m.par} ${i.auteur}, ${i.banque}` : ''}`}</p>
              {i.fournie && (
                <form action={rendreLaPhotoALaBanque.bind(null, id, nom)} style={{ marginTop: '0.5rem' }}>
                  <button type="submit" className="discret">{m.revenir}</button>
                </form>
              )}
              <form action={fournirUnePhoto.bind(null, id, nom)} style={{ marginTop: '0.5rem' }}>
                <label htmlFor={`fichier-${nom}`} className="attenue" style={{ fontSize: '0.85rem' }}>{m.fournir}</label>
                <input id={`fichier-${nom}`} name="photo" type="file" accept="image/jpeg,image/png,image/webp" required />
                <label htmlFor={`alt-${nom}`} className="attenue" style={{ fontSize: '0.85rem' }}>{m.altFournie}</label>
                <input id={`alt-${nom}`} name="alt" maxLength={300} defaultValue={i.fournie?.alt ?? i.alt} />
                <button type="submit" className="discret">{m.mettre}</button>
              </form>
              {banque && (
                <form action={chercherDesPhotos.bind(null, id, nom)} style={{ marginTop: '0.5rem' }}>
                  <label htmlFor={`sujet-${nom}`} className="attenue" style={{ fontSize: '0.85rem' }}>{m.sujet}</label>
                  <input id={`sujet-${nom}`} name="sujet" maxLength={120} required defaultValue={q.photo === nom ? q.sujet : ''} />
                  <button type="submit" className="discret">{m.remplacer}</button>
                </form>
              )}
            </div>
          ))}
        </div>
        {q.photo && q.sujet && photos.some(([n]) => n === q.photo) && (
          <form action={choisirUnePhoto.bind(null, id, q.photo)} className="carte" style={{ marginTop: '1rem' }}>
            <h3>{m.choisir}</h3>
            {proposees === 'panne' ? <p role="alert">{m.panneBanque}</p> : proposees.length === 0 ? <p className="attenue">{m.rien}</p> : (
              <>
                <input type="hidden" name="sujet" value={q.sujet} />
                <div style={GRILLE}>
                  {proposees.map((x, n) => (
                    <label key={x.source} style={{ display: 'block', cursor: 'pointer' }}>
                      <img src={`${x.source}?w=640&q=70&auto=format&fit=crop`} alt={x.decrit} style={{ width: '100%', aspectRatio: '4 / 3', objectFit: 'cover', borderRadius: 8 }} />
                      <span><input type="radio" name="source" value={x.source} defaultChecked={n === 0} required /> {x.auteur}</span>
                    </label>
                  ))}
                </div>
                <label htmlFor="alt">{m.alt}</label>
                <input id="alt" name="alt" maxLength={300} defaultValue={photos.find(([n]) => n === q.photo)?.[1].alt ?? ''} />
                <button type="submit">{m.utiliser}</button>
              </>
            )}
          </form>
        )}
      </section>

      <section className="carte">
        <h2>{t.textes}</h2>
        {!p.valeur!.apercuEmpreinte ? <p className="attenue">{t.pasDApercu}</p> : (
          <EditeurDeTextes id={id} apercu={adresseDeLApp(id, 'apercu')} projet={p.valeur!.nom} langue={c.langue} t={{ textes: t.textes, textesExplication: t.textesExplication, textesActif: t.textesActif, textesChoisir: t.textesChoisir,
            textesPasIci: t.textesPasIci, enregistrer: t.enregistrer, annuler: t.annuler, enCours: t.enCours, textesFait: t.textesFait, textesRouge: t.textesRouge, textesRefus: t.textesRefus }} />
        )}
      </section>
    </main>
  );
}
