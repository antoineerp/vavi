/**
 * Les photos d'une app (demande d'Antoine du 25/11 : des sites aussi riches qu'en août, qui portaient de vraies photos) :
 * la photo posée est celle dont la banque dit voir le sujet ; un nom posé est gardé ; un sujet qu'aucune ne montre est dit,
 * rien n'est posé ; l'image posée a ses tailles et ses crédits ; un texte illisible ne casse rien.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { lireLesImages, poser, poserLesImages, type Banque, type ImageTrouvee } from '@/lib/images/la-banque';
import { reprendreLesImages, type ImageReprise } from '@/lib/images/la-reprise';
import { FICHIER_D_UNE_PHOTO, avecLaPhotoFournie, leFichierDeLaPhoto, leFormatDUnePhoto, sansLesMetadonnees } from '@/lib/images/la-photo-fournie';

const une = (source: string, decrit: string): ImageTrouvee => ({ source: `https://images.unsplash.com/${source}`, largeur: 2400, hauteur: 1600, decrit,
  auteur: 'Ada', profil: 'https://unsplash.com/@ada', banque: 'Unsplash', lienBanque: 'https://unsplash.com/' });

function banque(trouvees: Record<string, ImageTrouvee[]>): Banque & { signalees: string[] } {
  const signalees: string[] = [];
  return { signalees, chercher: async (sujet) => trouvees[sujet] ?? [], signaler: async (i) => { signalees.push(i.source); } };
}

describe('les photos de l’app', () => {
  it('pose la photo qui montre le sujet, avec ses tailles et ses crédits, et la signale à la banque', async () => {
    const b = banque({ 'wooden bakery counter': [une('a', 'a city street at night'), une('b', 'bread on a wooden bakery counter')] });
    const r = await poserLesImages(undefined, [{ nom: 'comptoir', sujet: 'wooden bakery counter', alt: 'Le comptoir' }], b);
    const posees = lireLesImages(r.texte!);
    expect(posees.comptoir!.sources.map(([l]) => l)).toEqual([640, 1280, 1920]);
    expect(posees.comptoir!.sources[0]![1]).toMatch(/^https:\/\/images\.unsplash\.com\/b\?w=640/);
    expect(posees.comptoir).toMatchObject({ alt: 'Le comptoir', auteur: 'Ada', banque: 'Unsplash' });
    expect(b.signalees).toEqual(['https://images.unsplash.com/b']);
  });
  it('garde un nom déjà posé, dit un sujet qu’aucune photo ne montre, et ne réécrit rien sans changement', async () => {
    const avant = `${JSON.stringify({ comptoir: { alt: 'x', largeur: 1, hauteur: 1, sources: [[640, 'https://images.unsplash.com/z?w=640']], auteur: '', profil: '', banque: '', lienBanque: '' } })}\n`;
    const r = await poserLesImages(avant, [{ nom: 'comptoir', sujet: 'bread', alt: 'Pain' }, { nom: 'four', sujet: 'stone oven', alt: 'Four' }],
      banque({ 'stone oven': [une('c', 'a mountain lake')] }));
    expect(r.texte).toBeNull();
    expect(r.dits[0]).toMatch(/already set/);
    expect(r.dits[1]).toMatch(/no photo shows "stone oven" \(the bank sees: a mountain lake\)/);
  });
  it('un images.json illisible se lit vide', () => {
    expect(lireLesImages('pas du json')).toEqual({});
    expect(lireLesImages('[1]')).toEqual({});
  });
});

describe('la photo fournie par la personne (« Gérer le contenu »)', () => {
  const lire = (n: string) => new Uint8Array(readFileSync(join(__dirname, 'images-fournies', n)));
  it('son format et ses dimensions se lisent à ses octets : JPEG, PNG, WebP (avec perte, sans perte, étendu)', () => {
    expect(leFormatDUnePhoto(lire('photo.jpg'))).toEqual({ type: 'image/jpeg', extension: 'jpg', largeur: 30, hauteur: 20 });
    expect(leFormatDUnePhoto(lire('photo.png'))).toEqual({ type: 'image/png', extension: 'png', largeur: 40, hauteur: 10 });
    expect(leFormatDUnePhoto(lire('photo-simple.webp'))).toMatchObject({ type: 'image/webp', largeur: 33, hauteur: 17 });
    expect(leFormatDUnePhoto(lire('photo-sans-perte.webp'))).toMatchObject({ largeur: 7, hauteur: 9 });
    expect(leFormatDUnePhoto(lire('photo-avec-exif.webp'))).toMatchObject({ largeur: 50, hauteur: 25 });
  });
  it('un SVG, un texte, une image tronquée ne sont pas des photos', () => {
    expect(leFormatDUnePhoto(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'))).toBeNull();
    expect(leFormatDUnePhoto(new TextEncoder().encode('bonjour'))).toBeNull();
    expect(leFormatDUnePhoto(lire('photo.jpg').subarray(0, 12))).toBeNull();
  });
  it('perd ses métadonnées (le lieu de la prise de vue), garde ses dimensions', () => {
    const contient = (o: Uint8Array, mot: string) => Buffer.from(o).includes(mot);
    for (const n of ['photo.jpg', 'photo.png', 'photo-avec-exif.webp']) {
      const avant = lire(n);
      const f = leFormatDUnePhoto(avant)!;
      const apres = sansLesMetadonnees(avant, f);
      expect(contient(avant, n.endsWith('png') ? 'GPS' : 'PhoneMaker'), n).toBe(true);
      expect(contient(apres, 'GPS') || contient(apres, 'PhoneMaker') || contient(apres, 'Exif'), n).toBe(false);
      expect(leFormatDUnePhoto(apres)).toEqual(f);
      expect(apres.length).toBeLessThan(avant.length);
    }
    const simple = lire('photo-simple.webp');
    expect(Buffer.from(sansLesMetadonnees(simple, leFormatDUnePhoto(simple)!)).equals(Buffer.from(simple))).toBe(true);
  });
  it('se montre à la place de la photo de la banque, qui reste pour y revenir ; son nom est son empreinte', () => {
    const posee = poser({ source: 'https://images.unsplash.com/p', largeur: 2000, hauteur: 1400, decrit: 'd', auteur: 'A', profil: '', banque: 'Unsplash', lienBanque: '' }, 'La salle');
    const avant = JSON.stringify({ salle: posee });
    const fournie = { source: 'https://vavi.test/photos/p/x.jpg', largeur: 30, hauteur: 20, alt: '' };
    const r = avecLaPhotoFournie(avant, 'salle', fournie);
    if (!r.ok) throw new Error(r.detail);
    expect(lireLesImages(r.texte).salle).toEqual({ ...posee, fournie: { ...fournie, alt: 'La salle' } });
    const retour = avecLaPhotoFournie(r.texte, 'salle', null);
    expect(retour.ok && lireLesImages(retour.texte).salle).toEqual(posee);
    expect(avecLaPhotoFournie(avant, 'absente', fournie)).toMatchObject({ ok: false });
    const o = lire('photo.jpg');
    expect(leFichierDeLaPhoto(o, leFormatDUnePhoto(o)!)).toMatch(FICHIER_D_UNE_PHOTO);
  });
});

/** Un PNG de `l`×`h` dont un bloc tEXt porte un lieu : l'en-tête suffit à le reconnaître. */
function unPng(l: number, h: number): Uint8Array {
  const bloc = (nom: string, corps: number[]) => { const n = corps.length; return [(n >>> 24) & 255, (n >> 16) & 255, (n >> 8) & 255, n & 255, ...[...nom].map((x) => x.charCodeAt(0)), ...corps, 0, 0, 0, 0]; };
  const u32 = (v: number) => [(v >>> 24) & 255, (v >> 16) & 255, (v >> 8) & 255, v & 255];
  return Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...bloc('IHDR', [...u32(l), ...u32(h), 8, 2, 0, 0, 0]),
    ...bloc('tEXt', [...'GPS 48.85,2.35'].map((x) => x.charCodeAt(0))), ...bloc('IEND', [])]);
}

describe('la reprise des images d’un site (Antoine, 26/11 : sous la déclaration de la personne)', () => {
  const droits = { declaration: '« ce sont mes photos »', le: '2026-11-26T10:00:00.000Z' };
  const deps = (octets: Record<string, Uint8Array | string>) => {
    const gardees: string[] = [];
    return { gardees, d: { projet: 'p1', adresse: 'https://vavi.test', garder: async (cle: string) => { gardees.push(cle); },
      lire: async (url: string) => { const o = octets[url]; return typeof o === 'string' || o === undefined ? (o ?? 'the site answered 404') : { octets: o, coupe: false }; } } };
  };
  it('pose l’image reconnue, sans ses métadonnées, servie par vavi, avec la déclaration, la date et l’adresse d’origine', async () => {
    const { d, gardees } = deps({ 'https://site.fr/a.png': unPng(1200, 800) });
    const r = await reprendreLesImages(undefined, [{ nom: 'atelier', url: 'https://site.fr/a.png', alt: 'L’atelier', credit: 'Clara' }], droits, d);
    expect(r.dits).toEqual(['atelier: set (1200×800 px, metadata removed).']);
    const i = lireLesImages(r.texte!).atelier as ImageReprise;
    expect(i.sources[0]![1]).toMatch(/^https:\/\/vavi\.test\/photos\/p1\/[0-9a-f]{32}\.png$/);
    expect(i.reprise).toEqual({ depuis: 'https://site.fr/a.png', droits: '« ce sont mes photos »', le: droits.le });
    expect([i.auteur, i.banque, i.lienBanque]).toEqual(['Clara', 'site.fr', 'https://site.fr']);
    expect(gardees).toEqual([`photos/p1/${i.sources[0]![1].split('/').pop()}`]);
  });
  it('dit chaque refus avec sa raison et ne pose rien : une page HTML, une icône, une porte fermée', async () => {
    const { d, gardees } = deps({ 'https://site.fr/page': new TextEncoder().encode('<html></html>'), 'https://site.fr/i.png': unPng(64, 64), 'https://x.fr/y.png': 'refused by vavi\'s gate: interne' });
    const r = await reprendreLesImages('{}', [{ nom: 'a', url: 'https://site.fr/page', alt: 'aaa' }, { nom: 'b', url: 'https://site.fr/i.png', alt: 'bbb' }, { nom: 'c', url: 'https://x.fr/y.png', alt: 'ccc' }], droits, d);
    expect(r.texte).toBeNull();
    expect(gardees).toEqual([]);
    expect(r.dits[0]).toMatch(/not a JPEG, PNG or WebP/);
    expect(r.dits[1]).toMatch(/icon or a thumbnail/);
    expect(r.dits[2]).toMatch(/gate/);
  });
});
