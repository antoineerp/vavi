/**
 * Le kit de la fiche App Store (Antoine, 28/11, voie 1) : les textes tenus aux limites d'Apple (ajustés sans changer leur
 * sens, refusés avec leur longueur sinon), le parcours qui photographie chaque écran dans chaque langue, et l'archive ;
 * dans un vrai Chromium (VAVI_NAVIGATEUR=oui), une capture de l'iPhone sort à 1320 × 2868, celle de l'iPad à 2064 × 2752.
 */
import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { inflateRawSync } from 'node:zlib';
import { APPAREILS, LIMITES, cleDuKit, lAdresseDansLaLangue, laLocaleDApple, leKit, leZipDuKit, lesEtapesDuKit, relireLesFiches, type FicheDUneLangue } from '@/lib/app-store/la-fiche';
import { jouerLeParcours, type NavigateurDuParcours } from '@/lib/parcours/le-parcours';

const fiche = (x: Partial<FicheDUneLangue> = {}): FicheDUneLangue => ({
  langue: 'fr', nom: 'Atelier Argile', sousTitre: 'Cours de poterie à Lyon', promo: '', description: 'Réservez un cours de poterie en deux gestes.', motsCles: 'poterie,cours,céramique', ...x,
});

describe('les textes de la fiche', () => {
  it('ajuste ce qui garde son sens, et le dit : mots-clés séparés par une virgule seule, doublons retirés, espaces', () => {
    const r = relireLesFiches([fiche({ motsCles: 'poterie, cours ;  Poterie,\nargile ', nom: '  Atelier   Argile ' })], ['fr', 'en']);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.fiches[0]).toMatchObject({ nom: 'Atelier Argile', motsCles: 'poterie,cours,argile' });
    expect(r.ajuste.join(' ')).toMatch(/keywords written as "poterie,cours,argile".*repeated keyword removed/);
    expect(r.ajuste.join(' ')).toMatch(/extra spaces/);
    expect(relireLesFiches([fiche()], ['fr'])).toEqual({ ok: true, fiches: [fiche()], ajuste: [] });
  });
  it('refuse ce qui dépasse, longueur à l’appui ; les mots-clés se comptent en octets (une lettre accentuée en prend 2)', () => {
    const r = relireLesFiches([fiche({ nom: 'x'.repeat(31), sousTitre: 'y'.repeat(31), promo: 'p'.repeat(171), description: 'd'.repeat(4001), motsCles: 'é'.repeat(51) })], ['fr']);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.ecarts).toEqual([
      'fr: the name has 31 characters, Apple allows 30', 'fr: the subtitle has 31 characters, Apple allows 30',
      'fr: the promotional text has 171 characters, Apple allows 170', 'fr: the description has 4001 characters, Apple allows 4000',
      'fr: the keywords take 102 bytes, Apple allows 100 (an accented letter takes 2)',
    ]);
    // Juste à la limite : accepté.
    expect(relireLesFiches([fiche({ nom: 'x'.repeat(LIMITES.nom), motsCles: 'é'.repeat(50) })], ['fr']).ok).toBe(true);
  });
  it('une langue que l’app n’a pas, ou donnée deux fois, est refusée', () => {
    const r = relireLesFiches([fiche(), fiche(), fiche({ langue: 'de' })], ['fr', 'en']);
    expect(r.ok ? [] : r.ecarts).toEqual(['fr: given twice', 'de: the app is not in this language (its languages: fr, en)']);
  });
  it('les langues prennent le code d’App Store Connect', () => {
    expect(['fr', 'en', 'pt-BR', 'zh', 'xx'].map(laLocaleDApple)).toEqual(['fr-FR', 'en-US', 'pt-BR', 'zh-Hans', 'xx']);
  });
});

describe('les écrans photographiés', () => {
  it('chaque écran, ouvert dans chaque langue à son adresse, ses étapes jouées, puis photographié', () => {
    expect(lAdresseDansLaLangue('/', 'en', 'fr')).toBe('/en');
    expect(lAdresseDansLaLangue('/planning', 'fr', 'fr')).toBe('/planning');
    expect(lesEtapesDuKit([{ nom: 'Accueil', adresse: '/', etapes: [] }, { nom: 'Le planning', adresse: '/planning', etapes: [{ action: 'click', target: 'Semaine' }] }], ['fr', 'en'], 'fr')).toEqual([
      { action: 'open', path: '/' }, { action: 'shoot', name: 'fr/01-accueil' },
      { action: 'open', path: '/planning' }, { action: 'click', target: 'Semaine' }, { action: 'shoot', name: 'fr/02-le-planning' },
      { action: 'open', path: '/en' }, { action: 'shoot', name: 'en/01-accueil' },
      { action: 'open', path: '/en/planning' }, { action: 'click', target: 'Semaine' }, { action: 'shoot', name: 'en/02-le-planning' },
    ]);
  });
  it('les tailles d’Apple : 440 × 956 en densité 3, 1032 × 1376 en densité 2', () => {
    const px = (a: keyof typeof APPAREILS) => `${APPAREILS[a].ecran.width * APPAREILS[a].ecran.echelle} × ${APPAREILS[a].ecran.height * APPAREILS[a].ecran.echelle}`;
    expect([px('iphone'), px('ipad')]).toEqual([APPAREILS.iphone.pixels, APPAREILS.ipad.pixels]);
    expect([px('iphone'), px('ipad')]).toEqual(['1320 × 2868', '2064 × 2752']);
  });
});

/** Les fichiers d'un zip (méthode deflate), relus. */
function lesFichiersDuZip(zip: Buffer): Map<string, Buffer> {
  const f = new Map<string, Buffer>();
  let i = 0;
  while (zip.readUInt32LE(i) === 0x04034b50) {
    const serre = zip.readUInt32LE(i + 18), n = zip.readUInt16LE(i + 26), x = zip.readUInt16LE(i + 28);
    const nom = zip.subarray(i + 30, i + 30 + n).toString('utf8');
    f.set(nom, inflateRawSync(zip.subarray(i + 30 + n + x, i + 30 + n + x + serre)));
    i += 30 + n + x + serre;
  }
  return f;
}

describe('l’archive du kit', () => {
  it('un dossier par langue, ses textes, ses captures par appareil, et le LISEZ-MOI qui dit ce qui reste à faire', () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
    const photos = new Map([['iphone', [{ nom: 'fr/01-accueil', jpeg }, { nom: 'en/01-accueil', jpeg }]], ['ipad', [{ nom: 'fr/01-accueil', jpeg }]]] as const);
    const kit = leKit({ nom: 'Atelier Argile', le: '2026-11-28T12:00:00Z', fiches: [fiche(), fiche({ langue: 'en', nom: 'Clay Studio' })], photos });
    expect([...kit.keys()].sort()).toEqual(['LISEZ-MOI.txt', 'en-US/fiche.txt', 'en-US/iphone-6.9/01-accueil.jpg', 'fr-FR/fiche.txt', 'fr-FR/ipad-13/01-accueil.jpg', 'fr-FR/iphone-6.9/01-accueil.jpg']);
    expect(kit.get('fr-FR/fiche.txt')).toContain('Nom / Name (14/30)\nAtelier Argile');
    expect(kit.get('fr-FR/fiche.txt')).toContain('Mots-clés / Keywords (24/100 octets / bytes)');
    const lisez = String(kit.get('LISEZ-MOI.txt'));
    expect(lisez).toMatch(/4\.2\.6/);
    expect(lisez).toMatch(/Sur l'écran d'accueil/);
    expect(lisez).toMatch(/1320 × 2868/);
    const relu = lesFichiersDuZip(leZipDuKit({ nom: 'Atelier Argile', le: '2026-11-28T12:00:00Z', fiches: [fiche()], photos: new Map([['iphone', [{ nom: 'fr/01-accueil', jpeg }]]]) }));
    expect(relu.get('fr-FR/iphone-6.9/01-accueil.jpg')).toEqual(jpeg);
    expect(cleDuKit('p1')).toBe('kits-app-store/p1.zip');
  });
});

/** La largeur et la hauteur d'un JPEG, lues dans son en-tête (SOF0/SOF2). */
function tailleDuJpeg(j: Buffer): string {
  let i = 2;
  while (i < j.length) {
    const marque = j[i + 1]!;
    if (marque === 0xc0 || marque === 0xc2) return `${j.readUInt16BE(i + 7)} × ${j.readUInt16BE(i + 5)}`;
    i += 2 + j.readUInt16BE(i + 2);
  }
  return '?';
}

describe.runIf(process.env.VAVI_NAVIGATEUR === 'oui')('les captures aux tailles d’Apple, dans un vrai navigateur', () => {
  it('l’iPhone sort à 1320 × 2868 et l’iPad à 2064 × 2752, en JPEG, chaque langue à son adresse', async () => {
    const { chromium } = createRequire(__filename)('playwright') as { chromium: { launch(): Promise<unknown> } };
    const page = (t: string) => `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><h1>${t}</h1></body></html>`;
    const vues: string[] = [];
    const lire = async (s: readonly string[]) => { vues.push(`/${s.join('/')}`); return { statut: 200, type: 'text/html; charset=utf-8', corps: Buffer.from(page(s[0] === 'en' ? 'Hello' : 'Bonjour')) }; };
    const etapes = lesEtapesDuKit([{ nom: 'Accueil', adresse: '/', etapes: [{ action: 'expect', text: 'o' }] }], ['fr', 'en'], 'fr');
    const tailles: string[] = [];
    for (const a of ['iphone', 'ipad'] as const) {
      const r = await jouerLeParcours((await chromium.launch()) as NavigateurDuParcours, etapes, { lire, base: 'https://abc.supabase.co', images: [], langue: 'fr', ecran: APPAREILS[a].ecran });
      expect(r.arret).toBeNull();
      expect(r.photos?.map((p) => p.nom)).toEqual(['fr/01-accueil', 'en/01-accueil']);
      tailles.push(...(r.photos ?? []).map((p) => tailleDuJpeg(p.jpeg)));
    }
    expect(tailles).toEqual(['1320 × 2868', '1320 × 2868', '2064 × 2752', '2064 × 2752']);
    expect(vues).toContain('/en');
  }, 90_000);
});
