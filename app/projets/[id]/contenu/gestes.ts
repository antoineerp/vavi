'use server';
/**
 * Les gestes de « Gérer le contenu » : l'apparence et le référencement, changés par la personne (`lib/contenus/le-contenu.ts`),
 * puis l'aperçu rebâti sans modèle, comme pour un texte réécrit. Le résultat revient à la page par son adresse.
 */
import { redirect } from 'next/navigation';
import { laConsole } from '@/app/_partage/la-console';
import { construireLApercu as batir, estUnRefus } from '@/lib/mcp/les-gestes';
import { leContexteReel } from '@/lib/mcp/le-contexte-reel';
import { changerDeDirection, changerLApparence, changerLeLogo, changerLeReferencement, changerLeSite, changerUneImage, CHEMIN_DU_REFERENCEMENT, lApparenceDuFormulaire, leReferencementStocke, lesRedirectionsTapees, type Apparence, type Changement } from '@/lib/contenus/le-contenu';
import { CHEMIN_DES_IMAGES, lireLesImages } from '@/lib/images/la-banque';
import { banqueDeLaPlateforme } from '@/lib/images/la-banque';
import { TAILLE_MAX_D_UNE_PHOTO, laCleDeLaPhoto, leFichierDeLaPhoto, leFormatDUnePhoto, sansLesMetadonnees } from '@/lib/images/la-photo-fournie';
import { changerLaPhotoFournie } from '@/lib/contenus/le-contenu';
import { magasinS3 } from '@/lib/publication/le-magasin';
import { adresseDeLaPlateforme } from '@/lib/mcp/l-adresse';

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

async function lesDependances(id: string) {
  const c = await laConsole(`/projets/${id}/gerer`);
  return { compte: c.compte, projets: c.projets, construire: async (projet: string) => {
    const ctx = await leContexteReel(c.compte);
    const b = await batir(ctx.outils, { project: projet });
    if (estUnRefus(b)) return { vert: false as const, detail: b.code };
    const designe = await c.projets.publierLApercu(c.compte, projet, String(b.fingerprint));
    return designe.lu ? { vert: true as const } : { vert: false as const, detail: designe.pourquoi };
  } };
}

const retour = (id: string, r: Changement, quoi: string, ecran = 'gerer'): never => redirect(`/projets/${id}/${ecran}?${new URLSearchParams(r.change
  ? { fait: quoi, apercu: r.apercu } : { erreur: r.pourquoi, ...(r.detail ? { detail: r.detail.slice(0, 300) } : {}) })}`);

export async function enregistrerLApparence(id: string, f: FormData) {
  if (!ID.test(id)) redirect('/projets');
  const a = lApparenceDuFormulaire(f);
  if (!a.lue) retour(id, { change: false, pourquoi: 'mal_forme', detail: a.detail }, 'apparence');
  const r = await changerLApparence(await lesDependances(id), id, (a as { apparence: Apparence }).apparence);
  if (r.change) console.log(`[contenu] ${id.slice(0, 8)} apparence (version ${r.version}, aperçu ${r.apercu})`);
  retour(id, r, 'apparence');
}

/** « Poser cette direction » : l'autre direction nommée devient celle de l'app, la posée rejoint les autres ; l'aperçu est rebâti. */
export async function poserUneDirection(id: string, f: FormData) {
  if (!ID.test(id)) redirect('/projets');
  const nom = String(f.get('nom') ?? '').slice(0, 60);
  const r = await changerDeDirection(await lesDependances(id), id, nom);
  if (r.change) console.log(`[contenu] ${id.slice(0, 8)} direction « ${nom} » (version ${r.version}, aperçu ${r.apercu})`);
  retour(id, r, 'direction');
}

export async function enregistrerLeReferencement(id: string, f: FormData) {
  if (!ID.test(id)) redirect('/projets');
  const pages: Record<string, { titre: string; description: string; cachee: boolean }> = {};
  for (const adresse of f.getAll('adresse').map(String).slice(0, 200)) {
    pages[adresse] = { titre: String(f.get(`titre:${adresse}`) ?? ''), description: String(f.get(`description:${adresse}`) ?? ''), cachee: f.get(`cachee:${adresse}`) === 'oui' };
  }
  const r = await changerLeReferencement(await lesDependances(id), id, pages);
  if (r.change) console.log(`[contenu] ${id.slice(0, 8)} référencement (version ${r.version}, aperçu ${r.apercu})`);
  retour(id, r, 'referencement', 'referencement');
}

/** « Référencement » : les anciennes adresses envoyées vers les nouvelles (301), une par ligne ; l'aperçu est rebâti. */
export async function enregistrerLesRedirections(id: string, f: FormData) {
  if (!ID.test(id)) redirect('/projets');
  const lues = lesRedirectionsTapees(String(f.get('redirections') ?? ''));
  if (!lues.ok) retour(id, { change: false, pourquoi: 'mal_forme', detail: lues.detail }, 'redirections', 'referencement');
  const d = await lesDependances(id);
  const r = await changerLeReferencement(d, id, await lesPagesPosees(d, id), { redirections: (lues as Extract<typeof lues, { ok: true }>).redirections });
  if (r.change) console.log(`[contenu] ${id.slice(0, 8)} redirections (version ${r.version}, aperçu ${r.apercu})`);
  retour(id, r, 'redirections', 'referencement');
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
  const g = await garderLaPhotoEnvoyee(id, f, 'gerer');
  const r = await changerLaPhotoFournie(g.d, id, nom, { source: g.source, largeur: g.largeur, hauteur: g.hauteur, alt: String(f.get('alt') ?? '') });
  if (r.change) console.log(`[contenu] ${id.slice(0, 8)} photo ${nom} fournie, ${g.ko} Ko (version ${r.version}, aperçu ${r.apercu})`);
  retour(id, r, 'photo', 'gerer');
}

/**
 * La photo envoyée par la personne (champ `photo`), vérifiée (JPEG, PNG ou WebP, 8 Mo au plus), sans ses métadonnées,
 * gardée au magasin sous son empreinte et servie par vavi. Un échec revient à `ecran`, dit.
 */
async function garderLaPhotoEnvoyee(id: string, f: FormData, ecran: string) {
  const echec = (detail: string): never => retour(id, { change: false, pourquoi: 'mal_forme', detail }, 'photo', ecran);
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
  if (!p.lu || !p.valeur) retour(id, { change: false, pourquoi: 'panne' }, 'photo', ecran);
  const magasin = magasinS3();
  if (!magasin.lu) retour(id, { change: false, pourquoi: 'panne', detail: 'le magasin des photos n’est pas configuré' }, 'photo', ecran);
  const octets = sansLesMetadonnees(brute, format!);
  const nomDuFichier = leFichierDeLaPhoto(octets, format!);
  const garde = await (magasin as Extract<typeof magasin, { lu: true }>).magasin.poser(laCleDeLaPhoto(id, nomDuFichier), Buffer.from(octets), { type: format!.type, cache: 'public, max-age=31536000, immutable' }).then(() => true, () => false);
  if (!garde) retour(id, { change: false, pourquoi: 'panne', detail: 'la photo n’a pas pu être gardée' }, 'photo', ecran);
  return { d, source: `${adresseDeLaPlateforme()}/photos/${id}/${nomDuFichier}`, largeur: format!.largeur, hauteur: format!.hauteur, ko: Math.round(octets.length / 1024) };
}

/**
 * « Référencement » : l'image de partage déposée par la personne (la sienne, pas seulement une photo déjà sur le site) :
 * gardée comme une photo fournie, elle devient l'image qui accompagne les liens partagés. Ce qu'il remplace : rien ; un
 * site sans photo n'avait pas d'image de partage possible (essai de la console du 26/11).
 */
export async function deposerLImageDePartage(id: string, f: FormData) {
  if (!ID.test(id)) redirect('/projets');
  const g = await garderLaPhotoEnvoyee(id, f, 'referencement');
  const actuel = await g.d.projets.fichiers(g.d.compte, id);
  const ref = leReferencementStocke(actuel.lu ? actuel.valeur.get(CHEMIN_DU_REFERENCEMENT) : undefined);
  const r = await changerLeReferencement(g.d, id, ref.pages, { image: g.source, ia: ref.ia });
  if (r.change) console.log(`[contenu] ${id.slice(0, 8)} image de partage déposée, ${g.ko} Ko (version ${r.version}, aperçu ${r.apercu})`);
  retour(id, r, 'partage', 'referencement');
}

/** « Gérer le contenu » : le logo déposé (gardé comme une photo fournie), montré par la marque et en icône d'onglet. */
export async function deposerLeLogo(id: string, f: FormData) {
  if (!ID.test(id)) redirect('/projets');
  const g = await garderLaPhotoEnvoyee(id, f, 'gerer');
  const r = await changerLeLogo(g.d, id, g.source);
  if (r.change) console.log(`[contenu] ${id.slice(0, 8)} logo déposé, ${g.ko} Ko (version ${r.version}, aperçu ${r.apercu})`);
  retour(id, r, 'logo', 'gerer');
}

export async function retirerLeLogo(id: string) {
  if (!ID.test(id)) redirect('/projets');
  const r = await changerLeLogo(await lesDependances(id), id, null);
  retour(id, r, 'logo', 'gerer');
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
      immatriculation: champ('editeur_immatriculation'), tva: champ('editeur_tva'), horaires: champ('editeur_horaires').split('\n') },
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
    // L'image déposée ici n'est pas dans la banque : elle se garde telle qu'elle est.
    const deposee = leReferencementStocke(fichiers.lu ? fichiers.valeur.get(CHEMIN_DU_REFERENCEMENT) : undefined).image;
    if (!photos.includes(choisie) && choisie !== deposee) retour(id, { change: false, pourquoi: 'mal_forme', detail: 'cette photo n’est plus dans l’app' }, 'partage', 'referencement');
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
