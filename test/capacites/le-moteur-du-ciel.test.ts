// Repris de constructor-v13@5bb786e : test/moteur-ephemeride-planetaire.test.ts
/**
 * ============================================================================
 * LE MOTEUR D'ÉPHÉMÉRIDE — validé contre des positions PUBLIÉES
 * ============================================================================
 * La simulation `simulation-moteurs-par-domaine` avait établi que le substrat
 * n'avait AUCUN moteur pour les positions planétaires : le commentaire les
 * renvoyait à une lib jamais livrée, et une app d'astrologie générée écrivait
 * donc des nombres plausibles que personne ne pouvait vérifier. C'est le faux
 * le plus difficile à détecter — il a la forme d'un résultat.
 *
 * Ce test ne vérifie pas que le code fait ce que le code fait : il compare la
 * sortie à des positions d'éphémérides PUBLIÉES (tolérance large, largement
 * suffisante pour distinguer un vrai calcul d'une invention). Un test qui
 * comparerait le moteur à lui-même ne prouverait rien.
 *
 * Les valeurs de référence (longitude écliptique géocentrique, zodiaque
 * tropical) sont des repères astronomiques publics et stables :
 *  • 2024-01-01 12:00 UTC — Mars ≈ 27° Sagittaire (267°), Jupiter ≈ 5° Taureau
 *    (35°), Saturne ≈ 5° Poissons (335°) ;
 *  • 2000-01-01 12:00 UTC (J2000) — Soleil ≈ 280° (10° Capricorne).
 * ============================================================================
 */
import { describe, it, expect } from 'vitest';

import {
  PLANETES,
  planetEclipticLongitude,
  computeEphemeris,
  computeAstroAsync,
  sunEclipticLongitude,
  astroOpNeedsCoords,
} from '@/lib/capacites/le-moteur-du-ciel';

const D = (iso: string) => new Date(iso);

/** Écart angulaire absolu, en tenant compte du passage 360→0. */
const ecart = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));

describe('1 — les positions correspondent aux éphémérides publiées', () => {
  const CAS: Array<[typeof PLANETES[number], string, number]> = [
    ['mars', '2024-01-01T12:00:00Z', 267.5],
    ['jupiter', '2024-01-01T12:00:00Z', 35.0],
    ['saturn', '2024-01-01T12:00:00Z', 335.0],
  ];

  it.each(CAS)('%s au %s ≈ %s°', async (planete, date, attendu) => {
    const lon = await planetEclipticLongitude(planete, D(date));
    console.log(`  ${planete.padEnd(8)} ${date} → ${lon.toFixed(2)}° (référence ≈ ${attendu}°)`);
    expect(ecart(lon, attendu)).toBeLessThan(2);
  }, 30000);

  it('le Soleil à J2000 est à ~280° (10° Capricorne)', () => {
    expect(ecart(sunEclipticLongitude(D('2000-01-01T12:00:00Z')), 280.5)).toBeLessThan(1);
  });

  it('Pluton est servi aussi — il n\'est pas dans VSOP87, il a son module', async () => {
    const lon = await planetEclipticLongitude('pluto', D('2024-01-01T12:00:00Z'));
    console.log(`  pluto    2024-01-01 → ${lon.toFixed(2)}° (référence ≈ 299° / 29° Capricorne)`);
    expect(ecart(lon, 299.5)).toBeLessThan(3);
  }, 30000);
});

describe('2 — ce n\'est pas une valeur figée : la position BOUGE, dans le bon sens', () => {
  it('Mars avance d\'environ un demi-degré par jour', async () => {
    const j1 = await planetEclipticLongitude('mars', D('2024-03-01T00:00:00Z'));
    const j2 = await planetEclipticLongitude('mars', D('2024-03-02T00:00:00Z'));
    const mouvement = j2 - j1;
    console.log(`  Mars : ${j1.toFixed(3)}° → ${j2.toFixed(3)}° (${mouvement.toFixed(3)}°/jour)`);
    expect(mouvement).toBeGreaterThan(0.3);
    expect(mouvement).toBeLessThan(0.9);
  }, 30000);

  it('la rétrogradation est MESURÉE, pas déclarée', async () => {
    // Mercure rétrograde du 1er au 25 avril 2024 — fait astronomique public.
    const eph = await computeEphemeris(D('2024-04-10T12:00:00Z'));
    const mercure = eph.bodies.find((b) => b.body === 'mercury')!;
    console.log(`  Mercure 2024-04-10 : ${mercure.eclipticLongitude.toFixed(2)}°, ${mercure.dailyMotion.toFixed(3)}°/j, rétrograde=${mercure.retrograde}`);
    expect(mercure.retrograde).toBe(true);
    expect(mercure.dailyMotion).toBeLessThan(0);

    // …et hors période, elle est directe.
    const apres = await computeEphemeris(D('2024-06-10T12:00:00Z'));
    expect(apres.bodies.find((b) => b.body === 'mercury')!.retrograde).toBe(false);
  }, 60000);
});

describe('3 — l\'éphéméride complète est exploitable telle quelle', () => {
  it('elle rend les dix corps, en degrés', async () => {
    const eph = await computeEphemeris(D('2024-01-01T12:00:00Z'));
    expect(eph.unit).toBe('degrees');
    expect(eph.bodies.map((b) => b.body)).toEqual(['sun', 'moon', ...PLANETES]);
    for (const b of eph.bodies) {
      expect(b.eclipticLongitude).toBeGreaterThanOrEqual(0);
      expect(b.eclipticLongitude).toBeLessThan(360);
      expect(Number.isFinite(b.dailyMotion)).toBe(true);
    }
  }, 60000);

  it('le substrat rend la PHYSIQUE, jamais l\'interprétation', async () => {
    // Ni signe, ni maison, ni aspect : le découpage dépend d'une tradition
    // (tropical vs sidéral) que le substrat n'a pas à trancher (règle 1).
    const eph = await computeEphemeris(D('2024-01-01T12:00:00Z'));
    const champs = Object.keys(eph.bodies[0]!);
    // `precisionDeg` s'est ajouté le 20/09 : ce qui reste approché DÉCLARE sa
    // tolérance, faute de quoi une série tronquée de 57 termes passe pour une
    // éphéméride (`incident-la-lune-etait-tronquee-de-soixante-termes`). La
    // liste reste EXHAUSTIVE : c'est elle qui interdit qu'un signe s'y glisse.
    expect(champs.sort()).toEqual(['body', 'dailyMotion', 'eclipticLongitude', 'precisionDeg', 'retrograde']);
    expect(JSON.stringify(eph)).not.toMatch(/sagittaire|capricorne|aries|maison|house/i);
  }, 60000);
});

describe('4 — la frontière refuse proprement, et n\'exige pas de coordonnées', () => {
  it('les ops planétaires sont géocentriques : pas de lat/lon requis', () => {
    expect(astroOpNeedsCoords('planetEclipticLongitude')).toBe(false);
    expect(astroOpNeedsCoords('ephemeris')).toBe(false);
    // …contrairement à une position horizontale, qui dépend de l'observateur.
    expect(astroOpNeedsCoords('sunPosition')).toBe(true);
  });

  it('une planète inconnue est refusée avec la liste des valeurs admises', async () => {
    await expect(computeAstroAsync('planetEclipticLongitude', '2024-01-01T12:00:00Z', 'nibiru'))
      .rejects.toThrow(/planète inconnue.*mercury/s);
  });

  it('une date invalide est refusée', async () => {
    await expect(computeAstroAsync('ephemeris', 'pas-une-date')).rejects.toThrow(/date invalide/);
  });
});

describe('5 — la dépendance est RÉELLEMENT livrée (c\'était tout le problème)', () => {
  it('astronomia est dans les dépendances de la plateforme', async () => {
    const { readFile } = await import('node:fs/promises');
    const pkg = JSON.parse(await readFile('package.json', 'utf-8'));
    expect(pkg.dependencies?.astronomia, 'astronomia doit être une dépendance réelle').toBeTruthy();
  });
});
