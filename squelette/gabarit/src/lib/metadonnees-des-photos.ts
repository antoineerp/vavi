/**
 * Les métadonnées d'une photo, lues dans ses octets (le bloc EXIF d'un JPEG, d'un HEIC, d'un WebP, d'un PNG) : rien ne
 * part, et c'est un fait, jamais une supposition.
 * - La date est celle de la prise de vue, sinon de la numérisation, sinon de la dernière modification du fichier, et
 *   `origineDeLaDate` le dit (une photo retouchée porte le jour de la retouche).
 * - L'heure est celle du lieu ; elle n'est un instant que si le décalage est connu (écrit par l'appareil, ou tiré de
 *   l'heure universelle du GPS).
 * - La position (0, 0) est le zéro d'un appareil sans GPS : elle est écartée, et dite.
 * Ce qui manque est nommé (`manques`, codes fermés). Pur : des octets, un résultat, aucune exception.
 */

/** Ce qui manque à une photo — une liste FERMÉE, dite à la personne par l'écran. */
export const MANQUES_D_UNE_PHOTO = [
  'format-inconnu', 'sans-metadonnees', 'illisible', 'sans-date', 'date-de-modification', 'sans-decalage',
  'sans-position', 'position-nulle',
] as const;
export type ManqueDUnePhoto = typeof MANQUES_D_UNE_PHOTO[number];

/** Ce qu'une photo dit d'elle-même. `null` : elle ne le dit pas — jamais une valeur par défaut. */
export interface MetadonneesDUnePhoto {
  /** Le jour de la prise de vue, à l'heure du lieu (AAAA-MM-JJ). */
  readonly jour: string | null;
  /** L'heure de la prise de vue, à l'heure du lieu (HH:MM:SS). */
  readonly heure: string | null;
  /** Le décalage du lieu à ce moment (« +02:00 ») ; `null` : inconnu, et l'heure n'est alors pas un instant. */
  readonly decalage: string | null;
  /** L'instant ISO 8601 (avec son décalage) — seulement quand le décalage est connu. */
  readonly instant: string | null;
  /** D'où vient la date. */
  readonly origineDeLaDate: 'prise-de-vue' | 'numerisation' | 'modification' | null;
  /** La position écrite par l'appareil, en degrés décimaux. */
  readonly position: { readonly latitude: number; readonly longitude: number } | null;
  readonly manques: readonly ManqueDUnePhoto[];
}

/** Les octets lus d'abord : le bloc EXIF d'un JPEG tient dans les 64 premiers Ko, celui d'un HEIC peut être plus loin. */
export const OCTETS_LUS_D_ABORD = 256 * 1024;

type Format = 'jpeg' | 'heif' | 'webp' | 'png' | 'tiff' | 'inconnu';

/** Le format, lu à ses premiers octets — jamais à l'extension du nom. */
export function formatDesOctets(o: Uint8Array): Format {
  if (o.length >= 3 && at(o, 0) === 0xff && at(o, 1) === 0xd8 && at(o, 2) === 0xff) return 'jpeg';
  if (o.length >= 8 && at(o, 0) === 0x89 && texte(o, 1, 3) === 'PNG') return 'png';
  if (o.length >= 12 && texte(o, 0, 4) === 'RIFF' && texte(o, 8, 4) === 'WEBP') return 'webp';
  if (o.length >= 12 && texte(o, 4, 4) === 'ftyp' && /^(heic|heix|hevc|hevx|heim|heis|mif1|msf1|avif|avis)$/.test(texte(o, 8, 4))) return 'heif';
  if (o.length >= 4 && ((at(o, 0) === 0x49 && at(o, 1) === 0x49 && at(o, 2) === 0x2a && at(o, 3) === 0) || (at(o, 0) === 0x4d && at(o, 1) === 0x4d && at(o, 2) === 0 && at(o, 3) === 0x2a))) return 'tiff';
  return 'inconnu';
}

/** Le format peut-il porter des métadonnées que les premiers octets n'ont pas montrées ? (un HEIC les range plus loin) */
export const relireEnEntier = (o: Uint8Array): boolean => formatDesOctets(o) === 'heif';

/** Un octet, lu dans ses bornes (`noUncheckedIndexedAccess`) : hors du tableau, 0 — les bornes sont vérifiées avant. */
const at = (o: Uint8Array, i: number): number => o[i] ?? 0;

function texte(o: Uint8Array, debut: number, n: number): string {
  let s = '';
  for (let i = debut; i < debut + n && i < o.length; i++) s += String.fromCharCode(at(o, i));
  return s;
}

/** Le bloc TIFF des métadonnées : ses bornes dans `o`, ou `null` si le fichier n'en porte pas. */
function blocTiff(o: Uint8Array, format: Format): { debut: number; fin: number } | null {
  const estTiff = (i: number) => i + 8 <= o.length && ((at(o, i) === 0x49 && at(o, i + 1) === 0x49 && at(o, i + 2) === 0x2a && at(o, i + 3) === 0)
    || (at(o, i) === 0x4d && at(o, i + 1) === 0x4d && at(o, i + 2) === 0 && at(o, i + 3) === 0x2a));
  const apresExif = (i: number, fin: number) => (texte(o, i, 6) === 'Exif\0\0' && estTiff(i + 6) ? { debut: i + 6, fin } : null);
  if (format === 'tiff') return { debut: 0, fin: o.length };
  if (format === 'jpeg') {
    let i = 2;
    while (i + 4 <= o.length && at(o, i) === 0xff) {
      const marque = at(o, i + 1);
      if (marque === 0xd9 || marque === 0xda) break; // fin d'image, début des données : plus de métadonnées
      if (marque === 0xff) { i++; continue; }        // octet de remplissage
      if (marque >= 0xd0 && marque <= 0xd7) { i += 2; continue; }
      const longueur = (at(o, i + 2) << 8) | at(o, i + 3);
      if (longueur < 2) return null;
      if (marque === 0xe1) {
        const t = apresExif(i + 4, Math.min(o.length, i + 2 + longueur));
        if (t) return t;
      }
      i += 2 + longueur;
    }
    return null;
  }
  if (format === 'webp' || format === 'png') {
    // Des morceaux : RIFF (nom sur 4, taille LE sur 4, données paires) ; PNG (taille BE sur 4, nom sur 4, données, CRC).
    let i = format === 'webp' ? 12 : 8;
    while (i + 8 <= o.length) {
      const nom = format === 'webp' ? texte(o, i, 4) : texte(o, i + 4, 4);
      const taille = format === 'webp'
        ? (at(o, i + 4) | (at(o, i + 5) << 8) | (at(o, i + 6) << 16) | (at(o, i + 7) << 24)) >>> 0
        : ((at(o, i) << 24) | (at(o, i + 1) << 16) | (at(o, i + 2) << 8) | at(o, i + 3)) >>> 0;
      const donnees = i + 8;
      const fin = Math.min(o.length, donnees + taille);
      if ((format === 'webp' && nom === 'EXIF') || (format === 'png' && nom === 'eXIf')) {
        if (estTiff(donnees)) return { debut: donnees, fin };
        return apresExif(donnees, fin);
      }
      i = format === 'webp' ? donnees + taille + (taille % 2) : donnees + taille + 4;
    }
    return null;
  }
  if (format === 'heif') {
    // Un HEIC range ses métadonnées dans un « élément Exif » : 4 octets de décalage, puis « Exif\0\0 » et le TIFF.
    for (let i = 0; i + 14 <= o.length; i++) {
      if (at(o, i) === 0x45 && at(o, i + 1) === 0x78 && at(o, i + 2) === 0x69 && at(o, i + 3) === 0x66) {
        const t = apresExif(i, o.length);
        if (t) return t;
      }
    }
    return null;
  }
  return null;
}

/** Les champs d'un répertoire TIFF (IFD), lus dans leurs bornes. */
interface Champ { type: number; nombre: number; valeur: number }
const TAILLE_DU_TYPE: Readonly<Record<number, number>> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };

class LecteurTiff {
  private readonly le: boolean;
  constructor(private readonly o: Uint8Array, private readonly debut: number, private readonly fin: number) {
    this.le = at(o, debut) === 0x49;
  }
  private dans(pos: number, n: number): boolean { return pos >= 0 && n >= 0 && this.debut + pos + n <= this.fin; }
  u16(pos: number): number | null {
    if (!this.dans(pos, 2)) return null;
    const a = at(this.o, this.debut + pos), b = at(this.o, this.debut + pos + 1);
    return this.le ? a | (b << 8) : (a << 8) | b;
  }
  u32(pos: number): number | null {
    if (!this.dans(pos, 4)) return null;
    const p = this.debut + pos, x = this.o;
    return (this.le ? (at(x, p) | (at(x, p + 1) << 8) | (at(x, p + 2) << 16) | (at(x, p + 3) << 24)) : ((at(x, p) << 24) | (at(x, p + 1) << 16) | (at(x, p + 2) << 8) | at(x, p + 3))) >>> 0;
  }
  premierRepertoire(): number | null { return this.u32(4); }

  /** Un répertoire : ses champs par numéro. `null` : hors des bornes. */
  repertoire(pos: number): Map<number, Champ> | null {
    const n = this.u16(pos);
    if (n === null || n > 1000) return null;
    const champs = new Map<number, Champ>();
    for (let k = 0; k < n; k++) {
      const e = pos + 2 + k * 12;
      const tag = this.u16(e), type = this.u16(e + 2), nombre = this.u32(e + 4);
      if (tag === null || type === null || nombre === null) return null;
      const taille = (TAILLE_DU_TYPE[type] ?? 0) * nombre;
      // ≤ 4 octets : la valeur est DANS l'entrée ; au-delà, l'entrée porte où la lire.
      const valeur = taille <= 4 ? e + 8 : this.u32(e + 8);
      if (valeur === null) return null;
      champs.set(tag, { type, nombre, valeur });
    }
    return champs;
  }

  ascii(c: Champ | undefined): string | null {
    if (!c || c.type !== 2 || !this.dans(c.valeur, c.nombre)) return null;
    let s = '';
    for (let i = 0; i < c.nombre; i++) {
      const b = at(this.o, this.debut + c.valeur + i);
      if (b === 0) break;
      s += String.fromCharCode(b);
    }
    return s.trim() || null;
  }

  rationnels(c: Champ | undefined, n: number): number[] | null {
    if (!c || c.type !== 5 || c.nombre < n || !this.dans(c.valeur, 8 * n)) return null;
    const out: number[] = [];
    for (let i = 0; i < n; i++) {
      const num = this.u32(c.valeur + 8 * i), den = this.u32(c.valeur + 8 * i + 4);
      if (num === null || den === null || den === 0) return null;
      out.push(num / den);
    }
    return out;
  }

  pointeur(c: Champ | undefined): number | null {
    if (!c || (c.type !== 4 && c.type !== 13) || c.nombre !== 1) return null;
    return this.u32(c.valeur);
  }
}

const DEUX = (n: number) => String(n).padStart(2, '0');

/** « AAAA:MM:JJ HH:MM:SS » → jour et heure, ou `null` (le « 0000:00:00 » d'un appareil sans horloge, une date impossible). */
export function lireUneDate(s: string | null): { jour: string; heure: string } | null {
  const m = /^(\d{4})[:\-](\d{2})[:\-](\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(s ?? '');
  if (!m) return null;
  const [a, mo, j, h, mi, se] = [1, 2, 3, 4, 5, 6].map((k) => Number(m[k])) as [number, number, number, number, number, number];
  if (a < 1900 || mo < 1 || mo > 12 || j < 1 || h > 23 || mi > 59 || se > 60) return null;
  const jours = new Date(Date.UTC(a, mo, 0)).getUTCDate();
  if (j > jours) return null;
  return { jour: `${m[1]}-${m[2]}-${m[3]}`, heure: `${m[4]}:${m[5]}:${DEUX(Math.min(se, 59))}` };
}

/** « +02:00 », « -05:30 » — borné à ±14 h. */
export function lireUnDecalage(s: string | null): string | null {
  const m = /^([+-])(\d{2}):(\d{2})$/.exec((s ?? '').trim());
  if (!m) return null;
  const minutes = Number(m[2]) * 60 + Number(m[3]);
  return minutes <= 14 * 60 && Number(m[3]) < 60 ? `${m[1]}${m[2]}:${m[3]}` : null;
}

/**
 * LE DÉCALAGE TIRÉ DU GPS : l'heure locale de la prise moins l'heure universelle que le GPS a écrite, arrondie au quart
 * d'heure (les fuseaux du monde en sont tous des multiples). Écarté si l'écart dépasse ±14 h ou s'éloigne de plus de
 * 2 minutes d'un quart d'heure : deux horloges qui ne s'accordent pas ne font pas un fait.
 */
export function decalageParLeGps(local: { jour: string; heure: string }, utcJour: string | null, utcHeure: number[] | null): string | null {
  const j = /^(\d{4})[:\-](\d{2})[:\-](\d{2})$/.exec(utcJour ?? '');
  if (!j || !utcHeure || utcHeure.length < 3) return null;
  const [h, mi, se] = [0, 1, 2].map((k) => utcHeure[k] ?? NaN) as [number, number, number];
  if (![h, mi, se].every((x) => Number.isFinite(x) && x >= 0) || h >= 24 || mi >= 60 || se >= 61) return null;
  const utc = Date.UTC(Number(j[1]), Number(j[2]) - 1, Number(j[3]), Math.floor(h), Math.floor(mi), Math.floor(se));
  const [la, lm, lj] = [0, 1, 2].map((k) => Number(local.jour.split('-')[k])) as [number, number, number];
  const [lh, lmi, lse] = [0, 1, 2].map((k) => Number(local.heure.split(':')[k])) as [number, number, number];
  const loc = Date.UTC(la, lm - 1, lj, lh, lmi, lse);
  const minutes = (loc - utc) / 60_000;
  const quart = Math.round(minutes / 15) * 15;
  if (Math.abs(quart) > 14 * 60 || Math.abs(minutes - quart) > 2) return null;
  const a = Math.abs(quart);
  return `${quart < 0 ? '-' : '+'}${DEUX(Math.floor(a / 60))}:${DEUX(a % 60)}`;
}

const VIDE = { jour: null, heure: null, decalage: null, instant: null, origineDeLaDate: null, position: null } as const;

/** CE QUE LA PHOTO DIT D'ELLE-MÊME — ses octets (au moins les `OCTETS_LUS_D_ABORD` premiers). PUR, ne lève jamais. */
export function lireLesMetadonnees(octets: Uint8Array): MetadonneesDUnePhoto {
  try {
    return lire(octets);
  } catch {
    return sansRien('illisible');
  }
}

/** Rien de lisible : la cause, puis ce qu'elle emporte — un écran qui trie sur « sans-position » trouve aussi celle-ci. */
const sansRien = (cause: ManqueDUnePhoto): MetadonneesDUnePhoto => ({ ...VIDE, manques: [cause, 'sans-date', 'sans-position'] });

function lire(octets: Uint8Array): MetadonneesDUnePhoto {
  const format = formatDesOctets(octets);
  if (format === 'inconnu') return sansRien('format-inconnu');
  const bloc = blocTiff(octets, format);
  if (!bloc) return sansRien('sans-metadonnees');
  const t = new LecteurTiff(octets, bloc.debut, bloc.fin);
  const p0 = t.premierRepertoire();
  const ifd0 = p0 === null ? null : t.repertoire(p0);
  if (!ifd0) return sansRien('illisible');
  const pExif = t.pointeur(ifd0.get(0x8769));
  const pGps = t.pointeur(ifd0.get(0x8825));
  const exif = pExif === null ? null : t.repertoire(pExif);
  const gps = pGps === null ? null : t.repertoire(pGps);
  const manques: ManqueDUnePhoto[] = [];

  // LA DATE : la prise de vue, sinon la numérisation, sinon la modification du fichier (DITE).
  const candidates: Array<[MetadonneesDUnePhoto['origineDeLaDate'], string | null, number]> = [
    ['prise-de-vue', t.ascii(exif?.get(0x9003)), 0x9011],
    ['numerisation', t.ascii(exif?.get(0x9004)), 0x9012],
    ['modification', t.ascii(ifd0.get(0x0132)), 0x9010],
  ];
  let date: { jour: string; heure: string } | null = null;
  let origine: MetadonneesDUnePhoto['origineDeLaDate'] = null;
  let decalage: string | null = null;
  for (const [o, brut, tagDuDecalage] of candidates) {
    const d = lireUneDate(brut);
    if (!d) continue;
    date = d;
    origine = o;
    decalage = lireUnDecalage(t.ascii(exif?.get(tagDuDecalage)));
    break;
  }
  if (!date) manques.push('sans-date');
  else if (origine === 'modification') manques.push('date-de-modification');

  // LA POSITION : N/S, E/O, degrés-minutes-secondes ; (0, 0) écarté.
  let position: MetadonneesDUnePhoto['position'] = null;
  if (gps) {
    const lat = t.rationnels(gps.get(2), 3), lon = t.rationnels(gps.get(4), 3);
    const refLat = t.ascii(gps.get(1)), refLon = t.ascii(gps.get(3));
    if (lat && lon && refLat && refLon && /^[NS]$/i.test(refLat) && /^[EW]$/i.test(refLon)) {
      const deg = (x: number[]) => (x[0] ?? 0) + (x[1] ?? 0) / 60 + (x[2] ?? 0) / 3600;
      const latitude = (/^S$/i.test(refLat) ? -1 : 1) * deg(lat);
      const longitude = (/^W$/i.test(refLon) ? -1 : 1) * deg(lon);
      if (Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180) {
        if (latitude === 0 && longitude === 0) manques.push('position-nulle');
        else position = { latitude: Math.round(latitude * 1e6) / 1e6, longitude: Math.round(longitude * 1e6) / 1e6 };
      }
    }
    // LE DÉCALAGE PAR LE GPS : l'appareil n'a pas écrit son fuseau, mais l'heure universelle de la prise.
    if (date && !decalage && origine !== 'modification') {
      decalage = decalageParLeGps(date, t.ascii(gps.get(0x1d)), t.rationnels(gps.get(7), 3));
    }
  }
  if (!position && !manques.includes('position-nulle')) manques.push('sans-position');
  if (date && !decalage) manques.push('sans-decalage');

  return {
    jour: date?.jour ?? null,
    heure: date?.heure ?? null,
    decalage,
    instant: date && decalage ? `${date.jour}T${date.heure}${decalage}` : null,
    origineDeLaDate: origine,
    position,
    manques,
  };
}
