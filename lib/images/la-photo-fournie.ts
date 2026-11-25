/**
 * LA PHOTO QUE LA PERSONNE FOURNIT elle-même dans « Gérer le contenu » (sa vitrine, ses produits, son équipe), à la place
 * d'une photo de la banque : son format reconnu à ses octets (JPEG, PNG, WebP, jamais un SVG qui porterait un script), ses
 * dimensions lues dans son en-tête, sa clé dans le magasin (son empreinte : la même photo n'est gardée qu'une fois). La
 * photo de la banque reste dans `src/images.json` pour y revenir. PUR.
 *
 * Ce qu'il remplace : rien ne posait le champ `fournie` que `<Photo>` du gabarit sait montrer (constructor-v13 le
 * posait par `/api/upload-image`, l'éditeur de contenus).
 */
import { createHash } from 'node:crypto';
import { lireLesImages, type ImagePosee } from './la-banque';

export const TAILLE_MAX_D_UNE_PHOTO = 8 * 1024 * 1024;
export type FormatDUnePhoto = { readonly type: 'image/jpeg' | 'image/png' | 'image/webp'; readonly extension: 'jpg' | 'png' | 'webp'; readonly largeur: number; readonly hauteur: number };

const u16be = (o: Uint8Array, i: number) => (o[i]! << 8) | o[i + 1]!;
const u16le = (o: Uint8Array, i: number) => o[i]! | (o[i + 1]! << 8);
const u24le = (o: Uint8Array, i: number) => o[i]! | (o[i + 1]! << 8) | (o[i + 2]! << 16);
const u32le = (o: Uint8Array, i: number) => (o[i]! | (o[i + 1]! << 8) | (o[i + 2]! << 16) | (o[i + 3]! << 24)) >>> 0;
const u32be = (o: Uint8Array, i: number) => ((o[i]! << 24) >>> 0) + (o[i + 1]! << 16) + (o[i + 2]! << 8) + o[i + 3]!;
const texte = (o: Uint8Array, i: number, n: number) => String.fromCharCode(...o.subarray(i, i + n));

function leJpeg(o: Uint8Array): FormatDUnePhoto | null {
  let i = 2;
  while (i + 9 < o.length) {
    if (o[i] !== 0xff) return null;
    const marque = o[i + 1]!;
    if (marque === 0xff) { i++; continue; }
    if (marque === 0xd8 || marque === 0x01 || (marque >= 0xd0 && marque <= 0xd7)) { i += 2; continue; }
    const longueur = u16be(o, i + 2);
    // Les marqueurs SOF (début de l'image) portent hauteur puis largeur ; DHT, JPG et DAC n'en sont pas.
    if (marque >= 0xc0 && marque <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marque)) {
      return { type: 'image/jpeg', extension: 'jpg', hauteur: u16be(o, i + 5), largeur: u16be(o, i + 7) };
    }
    i += 2 + longueur;
  }
  return null;
}

function leWebp(o: Uint8Array): FormatDUnePhoto | null {
  const morceau = texte(o, 12, 4);
  const f = (largeur: number, hauteur: number): FormatDUnePhoto => ({ type: 'image/webp', extension: 'webp', largeur, hauteur });
  if (morceau === 'VP8X' && o.length >= 30) return f(u24le(o, 24) + 1, u24le(o, 27) + 1);
  if (morceau === 'VP8L' && o.length >= 25 && o[20] === 0x2f) {
    const b = o.subarray(21, 25);
    return f(1 + (b[0]! | ((b[1]! & 0x3f) << 8)), 1 + ((b[1]! >> 6) | (b[2]! << 2) | ((b[3]! & 0x0f) << 10)));
  }
  if (morceau === 'VP8 ' && o.length >= 30 && o[23] === 0x9d && o[24] === 0x01 && o[25] === 0x2a) return f(u16le(o, 26) & 0x3fff, u16le(o, 28) & 0x3fff);
  return null;
}

/** Le format et les dimensions d'une photo, lus à ses octets ; `null` : ce n'est pas une photo JPEG, PNG ou WebP lisible. */
export function leFormatDUnePhoto(o: Uint8Array): FormatDUnePhoto | null {
  let r: FormatDUnePhoto | null = null;
  if (o.length > 4 && o[0] === 0xff && o[1] === 0xd8 && o[2] === 0xff) r = leJpeg(o);
  else if (o.length > 24 && texte(o, 0, 8) === '\x89PNG\r\n\x1a\n' && texte(o, 12, 4) === 'IHDR') r = { type: 'image/png', extension: 'png', largeur: u32be(o, 16), hauteur: u32be(o, 20) };
  else if (o.length > 16 && texte(o, 0, 4) === 'RIFF' && texte(o, 8, 4) === 'WEBP') r = leWebp(o);
  return r && r.largeur > 0 && r.hauteur > 0 && r.largeur <= 20_000 && r.hauteur <= 20_000 ? r : null;
}

/**
 * La photo sans ses métadonnées (EXIF, XMP) : une photo de téléphone porte le lieu où elle a été prise, et le site la sert
 * à tout le monde. Seuls ces blocs partent ; l'image elle-même est gardée octet pour octet.
 */
export function sansLesMetadonnees(o: Uint8Array, f: FormatDUnePhoto): Uint8Array {
  const garde: Uint8Array[] = [];
  if (f.type === 'image/jpeg') {
    garde.push(o.subarray(0, 2));
    let i = 2;
    while (i + 4 <= o.length && o[i] === 0xff) {
      const marque = o[i + 1]!;
      if (marque === 0xda) break; // le début des données de l'image : tout le reste est gardé
      const fin = i + 2 + u16be(o, i + 2);
      const id = texte(o, i + 4, 5);
      if (!(marque === 0xe1 && (id.startsWith('Exif') || id.startsWith('http')))) garde.push(o.subarray(i, fin));
      i = fin;
    }
    garde.push(o.subarray(i));
  } else if (f.type === 'image/png') {
    garde.push(o.subarray(0, 8));
    for (let i = 8; i + 12 <= o.length;) {
      const fin = i + 12 + u32be(o, i);
      if (!['eXIf', 'iTXt', 'tEXt', 'zTXt'].includes(texte(o, i + 4, 4))) garde.push(o.subarray(i, fin));
      i = fin;
    }
  } else {
    const corps: Uint8Array[] = [];
    for (let i = 12; i + 8 <= o.length;) {
      const n = u32le(o, i + 4);
      const fin = i + 8 + n + (n % 2);
      const nom = texte(o, i, 4);
      if (nom === 'VP8X') { const x = Uint8Array.from(o.subarray(i, fin)); x[8] = x[8]! & ~0x0c; corps.push(x); }
      else if (nom !== 'EXIF' && nom !== 'XMP ') corps.push(o.subarray(i, fin));
      i = fin;
    }
    const taille = corps.reduce((t, c) => t + c.length, 4);
    const tete = Uint8Array.from(o.subarray(0, 12));
    tete[4] = taille & 0xff; tete[5] = (taille >> 8) & 0xff; tete[6] = (taille >> 16) & 0xff; tete[7] = (taille >>> 24) & 0xff;
    garde.push(tete, ...corps);
  }
  const r = new Uint8Array(garde.reduce((t, c) => t + c.length, 0));
  let k = 0;
  for (const c of garde) { r.set(c, k); k += c.length; }
  return r;
}

export const FICHIER_D_UNE_PHOTO = /^[0-9a-f]{32}\.(jpg|png|webp)$/;
export const TYPES_DES_PHOTOS: Readonly<Record<string, FormatDUnePhoto['type']>> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

/** Le nom de la photo dans le magasin : son empreinte, la même photo n'est gardée qu'une fois. */
export const leFichierDeLaPhoto = (o: Uint8Array, f: FormatDUnePhoto): string => `${createHash('sha256').update(o).digest('hex').slice(0, 32)}.${f.extension}`;
export const laCleDeLaPhoto = (projet: string, fichier: string): string => `photos/${projet}/${fichier}`;

type Resultat = { readonly ok: true; readonly texte: string } | { readonly ok: false; readonly detail: string };

/** `src/images.json` où la photo `nom`, déjà posée, montre celle que la personne a fournie (`null` : revient à la banque). */
export function avecLaPhotoFournie(avant: string | undefined, nom: string, fournie: NonNullable<ImagePosee['fournie']> | null): Resultat {
  const posees = lireLesImages(avant);
  const p = posees[nom];
  if (!p) return { ok: false, detail: `la photo ${nom} n’est pas dans l’app` };
  const { fournie: _ancienne, ...sans } = p;
  if (!fournie) return { ok: true, texte: `${JSON.stringify({ ...posees, [nom]: sans }, null, 2)}\n` };
  const alt = fournie.alt.trim().slice(0, 300) || p.alt;
  if (!alt) return { ok: false, detail: 'la photo a besoin d’une description' };
  return { ok: true, texte: `${JSON.stringify({ ...posees, [nom]: { ...sans, fournie: { ...fournie, alt } } }, null, 2)}\n` };
}
