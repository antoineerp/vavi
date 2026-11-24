/**
 * Les photos de la personne, choisies sur son téléphone ou son ordinateur et lues dans le navigateur : la date, l'heure,
 * le décalage horaire et la position sont lus dans le fichier, et aucune photo ne part. Ce que la photo ne dit pas est
 * nommé (`manques`), et l'écran le dit : un téléphone retire souvent la position d'une photo de la photothèque, elle
 * n'est jamais devinée. `lieux` nomme le lieu de chaque photo par sa position. Servi par `capacites.phototheque`.
 *
 *   const r = await capacites.phototheque.choisir();       // dans le onClick : le choix s'ouvre
 *   if (r.forme === 'donnee') {
 *     const { retenues, sansDate } = capacites.phototheque.entre(r.donnee.photos, { du, au });
 *     // <img src={p.apercu} />, p.jour, p.heure, p.position, p.manques ; liberer(...) en quittant l'écran
 *   }
 */
import type { Resultat } from './resultat';
import { appelerLaPlateforme } from './plateforme';
import { refusDesPhotos } from './refus-des-photos';
import { lireLesMetadonnees, OCTETS_LUS_D_ABORD, relireEnEntier, type MetadonneesDUnePhoto, type ManqueDUnePhoto } from './metadonnees-des-photos';
import { reduireUneImage, COTE_POUR_L_IA } from './image-reduite';

export type { ManqueDUnePhoto };

/** Une photo lue — `null` partout où elle ne dit rien. */
export interface PhotoLue extends MetadonneesDUnePhoto {
  /** Le fichier choisi : il reste dans le navigateur. */
  readonly fichier: File;
  readonly nom: string;
  /** Une adresse locale pour l'afficher (`<img src={p.apercu} />`) — rendue par `photos.liberer`. */
  readonly apercu: string;
}

/**
 * Le lieu d'une photo — `inconnu` : aucun lieu nommé là (la mer) ; `a-reprendre` : le service n'a pas répondu à temps,
 * à redemander ; `sans-position` : la photo ne dit pas où elle a été prise. Le fuseau vient de la position exacte.
 */
export type LieuDUnePhoto =
  | { etat: 'nomme'; libelle: string; commune: string | null; region: string | null; pays: string | null; fuseau: string | null }
  | { etat: 'inconnu' | 'a-reprendre'; fuseau: string | null }
  | { etat: 'sans-position' };

/** Ce qui a été lu, et ce qui a été écarté (pas une image, illisible) — par son nom, jamais tu. */
export interface PhotosLues { readonly photos: PhotoLue[]; readonly ecartees: string[] }

/** Un HEIC range ses métadonnées loin dans le fichier : relu en entier jusqu'à cette taille. */
const RELU_EN_ENTIER_AU_PLUS = 50 * 1024 * 1024;
const EN_PARALLELE = 4;

const estUneImage = (f: File): boolean => f.type.startsWith('image/') || /\.(jpe?g|png|webp|heic|heif|avif|tiff?)$/i.test(f.name);

async function lireUnePhoto(f: File): Promise<PhotoLue | null> {
  try {
    const debut = new Uint8Array(await f.slice(0, OCTETS_LUS_D_ABORD).arrayBuffer());
    let m = lireLesMetadonnees(debut);
    if (m.manques.includes('sans-metadonnees') && relireEnEntier(debut) && f.size > debut.length && f.size <= RELU_EN_ENTIER_AU_PLUS) {
      m = lireLesMetadonnees(new Uint8Array(await f.arrayBuffer()));
    }
    return { ...m, fichier: f, nom: f.name, apercu: URL.createObjectURL(f) };
  } catch {
    return null;
  }
}

export const photos = {
  /**
   * Ouvre le choix des photos (la photothèque du téléphone, les fichiers de l'ordinateur) et les LIT. À appeler dans
   * le geste de la personne (un `onClick`), avant tout autre `await`. Rien de choisi : une liste vide, pas un refus.
   */
  choisir(opts: { plusieurs?: boolean } = {}): Promise<Resultat<PhotosLues>> {
    if (typeof document === 'undefined') {
      return Promise.resolve(refusDesPhotos('navigateurSeul'));
    }
    const champ = document.createElement('input');
    champ.type = 'file';
    champ.accept = 'image/*';
    champ.multiple = opts.plusieurs !== false;
    champ.style.display = 'none';
    document.body.appendChild(champ);
    // Jamais deviné au retour du focus : un téléphone qui convertit encore une grande sélection la ferait perdre.
    const choisis = new Promise<File[]>((ok) => {
      const finir = (f: File[]) => { champ.remove(); ok(f); };
      champ.addEventListener('change', () => finir(Array.from(champ.files ?? [])), { once: true });
      champ.addEventListener('cancel', () => finir([]), { once: true });
      champ.click();
    });
    return choisis.then((f) => photos.lire(f));
  },

  /** Lit des fichiers déjà choisis (un `<input type="file">` de l'écran, un glisser-déposer). */
  async lire(fichiers: Iterable<File> | ArrayLike<File>): Promise<Resultat<PhotosLues>> {
    const tous = Array.from(fichiers as ArrayLike<File>);
    const ecartees = tous.filter((f) => !estUneImage(f)).map((f) => f.name);
    const images = tous.filter(estUneImage);
    const lues: Array<PhotoLue | null> = new Array(images.length).fill(null);
    let suivant = 0;
    await Promise.all(Array.from({ length: Math.min(EN_PARALLELE, images.length) }, async () => {
      while (suivant < images.length) {
        const i = suivant++;
        const f = images[i];
        if (f) lues[i] = await lireUnePhoto(f);
      }
    }));
    lues.forEach((p, i) => { if (!p) ecartees.push(images[i]?.name ?? `#${i + 1}`); });
    return { forme: 'donnee', donnee: { photos: lues.filter((p): p is PhotoLue => p !== null), ecartees } };
  },

  /**
   * LE LIEU DE CHAQUE PHOTO, dans leur ordre : la commune, la région, le pays, le fuseau. La plateforme regroupe les
   * positions au kilomètre et garde l'acquis — un séjour se nomme en quelques appels ; `enCours` dit l'avancée.
   */
  async lieux(liste: readonly PhotoLue[], opts: { langue?: string; enCours?: (regles: number, total: number) => void } = {}):
    Promise<Resultat<LieuDUnePhoto[]>> {
    const lieux: LieuDUnePhoto[] = liste.map((p) => (p.position ? { etat: 'a-reprendre', fuseau: null } : { etat: 'sans-position' }));
    let restants = liste.flatMap((p, i) => (p.position ? [i] : []));
    const total = restants.length;
    for (let tour = 0, sansProgres = 0; restants.length > 0 && tour < 40 && sansProgres < 3; tour++) {
      const lot = restants.slice(0, 50);
      const r = await appelerLaPlateforme<{ lieux?: LieuDUnePhoto[] }>('geocode/<projet>/inverse',
        { points: lot.map((i) => liste[i]?.position), lang: opts.langue });
      if (r.forme === 'refus') return r;
      (r.donnee.lieux ?? []).forEach((l, k) => { const i = lot[k]; if (i !== undefined) lieux[i] = l; });
      const avant = restants.length;
      restants = restants.filter((i) => lieux[i]?.etat === 'a-reprendre');
      sansProgres = restants.length < avant ? 0 : sansProgres + 1;
      opts.enCours?.(total - restants.length, total);
      if (restants.length > 0 && restants.length === avant) await new Promise((ok) => setTimeout(ok, 2_000));
    }
    return { forme: 'donnee', donnee: lieux };
  },

  /** Dans l'ordre de la prise de vue, à l'heure du lieu ; les photos sans date à la fin, par nom. */
  trier(liste: readonly PhotoLue[]): PhotoLue[] {
    const cle = (p: PhotoLue) => (p.jour ? `0${p.jour}T${p.heure ?? ''}` : `1${p.nom}`);
    return [...liste].sort((a, b) => cle(a).localeCompare(cle(b)));
  },

  /** Les photos prises entre deux jours (AAAA-MM-JJ, inclus) — et combien n'ont pas pu être jugées, faute de date. */
  entre(liste: readonly PhotoLue[], periode: { du: string; au: string }): { retenues: PhotoLue[]; sansDate: number } {
    const [du, au] = periode.du <= periode.au ? [periode.du, periode.au] : [periode.au, periode.du];
    return {
      retenues: liste.filter((p) => p.jour !== null && p.jour >= du && p.jour <= au),
      sansDate: liste.filter((p) => p.jour === null).length,
    };
  },

  /** La photo réduite en JPEG, plus légère à envoyer ou à monter. */
  reduire(photo: PhotoLue | Blob, cote: number = COTE_POUR_L_IA): Promise<Resultat<Blob>> {
    return reduireUneImage('fichier' in photo ? photo.fichier : photo, cote);
  },

  /** Rend les adresses locales des aperçus (à l'écran qui se ferme, ou avant d'en choisir d'autres). */
  liberer(liste: readonly PhotoLue[]): void {
    for (const p of liste) URL.revokeObjectURL(p.apercu);
  },
};
