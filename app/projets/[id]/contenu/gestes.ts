'use server';
/**
 * Les gestes de « Gérer le contenu » : l'apparence et le référencement, changés par la personne (`lib/contenus/le-contenu.ts`),
 * puis l'aperçu rebâti sans modèle, comme pour un texte réécrit. Le résultat revient à la page par son adresse.
 */
import { redirect } from 'next/navigation';
import { laConsole } from '@/app/_partage/la-console';
import { construireLApercu as batir, estUnRefus } from '@/lib/mcp/les-gestes';
import { leContexteReel } from '@/lib/mcp/le-contexte-reel';
import { changerLApparence, changerLeReferencement, changerLeSite, changerUneImage, CHEMIN_DU_REFERENCEMENT, lApparenceDuFormulaire, leReferencementStocke, type Apparence, type Changement } from '@/lib/contenus/le-contenu';
import { CHEMIN_DES_IMAGES, lireLesImages } from '@/lib/images/la-banque';
import { banqueDeLaPlateforme } from '@/lib/images/la-banque';
import { TAILLE_MAX_D_UNE_PHOTO, laCleDeLaPhoto, leFichierDeLaPhoto, leFormatDUnePhoto, sansLesMetadonnees } from '@/lib/images/la-photo-fournie';
import { changerLaPhotoFournie } from '@/lib/contenus/le-contenu';
import { magasinS3 } from '@/lib/publication/le-magasin';
import { adresseDeLaPlateforme } from '@/lib/mcp/l-adresse';

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

async function lesDependances(id: string) {
  const c = await laConsole(`/projets/${id}/contenu`);
  return { compte: c.compte, projets: c.projets, construire: async (projet: string) => {
    const ctx = await leContexteReel(c.compte);
    const b = await batir(ctx.outils, { project: projet });
    if (estUnRefus(b)) return { vert: false as const, detail: b.code };
    const designe = await c.projets.publierLApercu(c.compte, projet, String(b.fingerprint));
    return designe.lu ? { vert: true as const } : { vert: false as const, detail: designe.pourquoi };
  } };
}

const retour = (id: string, r: Changement, quoi: string, ecran = 'contenu'): never => redirect(`/projets/${id}/${ecran}?${new URLSearchParams(r.change
  ? { fait: quoi, apercu: r.apercu } : { erreur: r.pourquoi, ...(r.detail ? { detail: r.detail.slice(0, 300) } : {}) })}`);

export async function enregistrerLApparence(id: string, f: FormData) {
  if (!ID.test(id)) redirect('/projets');
  const a = lApparenceDuFormulaire(f);
  if (!a.lue) retour(id, { change: false, pourquoi: 'mal_forme', detail: a.detail }, 'apparence');
  const r = await changerLApparence(await lesDependances(id), id, (a as { apparence: Apparence }).apparence);
  if (r.change) console.log(`[contenu] ${id.slice(0, 8)} apparence (version ${r.version}, aperçu ${r.apercu})`);
  retour(id, r, 'apparence');
}

export async function enregistrerLeReferencement(id: string, f: FormData) {
  if (!ID.test(id)) redirect('/projets');
  const pages: Record<string, { titre: string; description: string }> = {};
  for (const adresse of f.getAll('adresse').map(String).slice(0, 200)) {
    pages[adresse] = { titre: String(f.get(`titre:${adresse}`) ?? ''), description: String(f.get(`description:${adresse}`) ?? '') };
  }
  const r = await changerLeReferencement(await lesDependances(id), id, pages);
  if (r.change) console.log(`[contenu] ${id.slice(0, 8)} référencement (version ${r.version}, aperçu ${r.apercu})`);
  // Le formulaire vit dans « Gérer le contenu » et dans « Référencement » : on revient où il a été envoyé.
  retour(id, r, 'referencement', f.get('retour') === 'referencement' ? 'referencement' : 'contenu');
}

const NOM_DE_PHOTO = /^[A-Za-z0-9_-]{1,60}$/;
const SUJET = (f: FormData) => String(f.get('sujet') ?? '').trim().slice(0, 120);

/** « Remplacer… » : les photos de la banque pour ce que la personne décrit, montrées sur la page à choisir. */
export async function chercherDesPhotos(id: string, nom: string, f: FormData) {
  if (!ID.test(id) || !NOM_DE_PHOTO.test(nom)) redirect('/projets');
  const sujet = SUJET(f);
  redirect(`/projets/${id}/gerer?${new URLSearchParams(sujet ? { photo: nom, sujet } : { erreur: 'mal_forme', detail: 'dites ce que la photo doit montrer' })}#photo-${nom}`);
}

/** La photo choisie remplace celle posée sous ce nom ; l'aperçu est rebâti. Elle est relue dans la banque, jamais prise de l'adresse. */
export async function choisirUnePhoto(id: string, nom: string, f: FormData) {
  if (!ID.test(id) || !NOM_DE_PHOTO.test(nom)) redirect('/projets');
  const banque = banqueDeLaPlateforme();
  const sujet = SUJET(f), source = String(f.get('source') ?? '');
  const trouvee = banque && sujet ? (await banque.chercher(sujet, 8, new Set()).catch(() => [])).find((x) => x.source === source) : undefined;
  if (!banque || !trouvee) retour(id, { change: false, pourquoi: 'mal_forme', detail: 'cette photo n’est plus proposée : relancez la recherche' }, 'photo', 'gerer');
  const r = await changerUneImage(await lesDependances(id), id, nom, trouvee!, String(f.get('alt') ?? ''));
  if (r.change) { await banque!.signaler(trouvee!); console.log(`[contenu] ${id.slice(0, 8)} photo ${nom} (version ${r.version}, aperçu ${r.apercu})`); }
  retour(id, r, 'photo', 'gerer');
}

/**
 * « Votre photo » : la personne fournit la sienne à la place de celle de la banque (JPEG, PNG ou WebP, 8 Mo au plus), sans
 * ses métadonnées (le lieu de la prise de vue) ; gardée au magasin sous son empreinte, l'aperçu est rebâti. La photo de la
 * banque reste, pour y revenir.
 */
export async function fournirUnePhoto(id: string, nom: string, f: FormData) {
  if (!ID.test(id) || !NOM_DE_PHOTO.test(nom)) redirect('/projets');
  const echec = (detail: string): never => retour(id, { change: false, pourquoi: 'mal_forme', detail }, 'photo', 'gerer');
  const fichier = f.get('photo');
  if (!(fichier instanceof File) || fichier.size === 0) echec('choisissez une photo');
  const photo = fichier as File;
  if (photo.size > TAILLE_MAX_D_UNE_PHOTO) echec('la photo dépasse 8 Mo');
  const brute = new Uint8Array(await photo.arrayBuffer());
  const format = leFormatDUnePhoto(brute);
  if (!format) echec('la photo doit être un JPEG, un PNG ou un WebP');
  const d = await lesDependances(id);
  // Le projet est au compte avant que rien ne soit gardé.
  const p = await d.projets.lire(d.compte, id);
  if (!p.lu || !p.valeur) retour(id, { change: false, pourquoi: 'panne' }, 'photo', 'gerer');
  const magasin = magasinS3();
  if (!magasin.lu) retour(id, { change: false, pourquoi: 'panne', detail: 'le magasin des photos n’est pas configuré' }, 'photo', 'gerer');
  const octets = sansLesMetadonnees(brute, format!);
  const nomDuFichier = leFichierDeLaPhoto(octets, format!);
  const garde = await (magasin as Extract<typeof magasin, { lu: true }>).magasin.poser(laCleDeLaPhoto(id, nomDuFichier), Buffer.from(octets), { type: format!.type, cache: 'public, max-age=31536000, immutable' }).then(() => true, () => false);
  if (!garde) retour(id, { change: false, pourquoi: 'panne', detail: 'la photo n’a pas pu être gardée' }, 'photo', 'gerer');
  const r = await changerLaPhotoFournie(d, id, nom, { source: `${adresseDeLaPlateforme()}/photos/${id}/${nomDuFichier}`, largeur: format!.largeur, hauteur: format!.hauteur, alt: String(f.get('alt') ?? '') });
  if (r.change) console.log(`[contenu] ${id.slice(0, 8)} photo ${nom} fournie, ${Math.round(octets.length / 1024)} Ko (version ${r.version}, aperçu ${r.apercu})`);
  retour(id, r, 'photo', 'gerer');
}

/** « Revenir à la photo de la banque » : la photo fournie n'est plus montrée ; l'aperçu est rebâti. */
export async function rendreLaPhotoALaBanque(id: string, nom: string) {
  if (!ID.test(id) || !NOM_DE_PHOTO.test(nom)) redirect('/projets');
  const r = await changerLaPhotoFournie(await lesDependances(id), id, nom, null);
  if (r.change) console.log(`[contenu] ${id.slice(0, 8)} photo ${nom} rendue à la banque (version ${r.version}, aperçu ${r.apercu})`);
  retour(id, r, 'photo', 'gerer');
}

/** « Référencement » : le nom du site, ce qu'il fait, qui le publie (app.json) ; l'aperçu est rebâti. */
export async function enregistrerLeSite(id: string, f: FormData) {
  if (!ID.test(id)) redirect('/projets');
  const champ = (k: string) => String(f.get(k) ?? '');
  const r = await changerLeSite(await lesDependances(id), id, {
    nom: champ('nom'), description: champ('description'),
    editeur: { nom: champ('editeur_nom'), adresse: champ('editeur_adresse'), telephone: champ('editeur_telephone'), courriel: champ('editeur_courriel'),
      immatriculation: champ('editeur_immatriculation'), horaires: champ('editeur_horaires').split('\n') },
  });
  if (r.change) console.log(`[contenu] ${id.slice(0, 8)} site (version ${r.version}, aperçu ${r.apercu})`);
  retour(id, r, 'site', 'referencement');
}

/** « Référencement » : l'image de partage (une photo de l'app, relue dans `src/images.json`) et le choix des robots d'IA. */
export async function enregistrerLePartage(id: string, f: FormData) {
  if (!ID.test(id)) redirect('/projets');
  const d = await lesDependances(id);
  const choisie = String(f.get('image') ?? '');
  let image: string | null | undefined;
  if (choisie === 'aucune') image = null;
  else if (choisie) {
    const fichiers = await d.projets.fichiers(d.compte, id);
    const photos = Object.values(lireLesImages(fichiers.lu ? fichiers.valeur.get(CHEMIN_DES_IMAGES) : undefined)).flatMap((i) => i?.sources?.map((s) => s[1]) ?? []);
    if (!photos.includes(choisie)) retour(id, { change: false, pourquoi: 'mal_forme', detail: 'cette photo n’est plus dans l’app' }, 'partage', 'referencement');
    image = choisie;
  }
  const r = await changerLeReferencement(d, id, (await lesPagesPosees(d, id)), { image, ia: { assistants: f.get('assistants') === 'oui', entrainement: f.get('entrainement') === 'oui' } });
  if (r.change) console.log(`[contenu] ${id.slice(0, 8)} partage et robots d’IA (version ${r.version}, aperçu ${r.apercu})`);
  retour(id, r, 'partage', 'referencement');
}

/** Les titres et descriptions déjà posés, gardés tels quels quand seul le partage change. */
async function lesPagesPosees(d: Awaited<ReturnType<typeof lesDependances>>, id: string) {
  const f = await d.projets.fichiers(d.compte, id);
  return leReferencementStocke(f.lu ? f.valeur.get(CHEMIN_DU_REFERENCEMENT) : undefined).pages;
}
