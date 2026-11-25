/**
 * Les photos d'une app (demande d'Antoine du 25/11 : des sites aussi riches qu'en août, qui portaient de vraies photos) :
 * la photo posée est celle dont la banque dit voir le sujet ; un nom posé est gardé ; un sujet qu'aucune ne montre est dit,
 * rien n'est posé ; l'image posée a ses tailles et ses crédits ; un texte illisible ne casse rien.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { lireLesImages, poser, poserLesImages, type Banque, type ImageTrouvee } from '@/lib/images/la-banque';
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
