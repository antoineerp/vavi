// Repris de constructor-v13@5bb786e : test/incident-la-capacite-ne-bornait-pas-son-service-public.test.ts
/**
 * ============================================================================
 * LA CAPACITÉ NE BORNAIT PAS SON SERVICE PUBLIC — et l'IP est partagée
 * ============================================================================
 * `geo.locate` appelle Nominatim (OpenStreetMap), dont la politique tolère UNE
 * requête par seconde et par application. Mesuré sur un export livré : le
 * champ « ville de naissance » appelait la capacité à CHAQUE frappe, dès trois
 * caractères, sans anti-rebond — « Villeurbanne » = dix requêtes en deux
 * secondes, pour un seul visiteur.
 *
 * L'IP qui appelle est celle de la PLATEFORME. Une app généreuse fait donc
 * bannir toutes les autres. Et la garde ne peut pas vivre dans le client : il
 * est réécrit à chaque génération — une règle écrite dans un prompt est une
 * règle qu'on paie à chaque fois et qu'on perd une fois sur deux.
 *
 * RÈGLE GÉNÉRALE (CLAUDE.md) : une capacité du substrat qui appelle un service
 * public borne son DÉBIT côté serveur, met en cache ce qui ne bouge pas, et
 * REFUSE en le nommant plutôt que d'empiler. Ce que la borne ne couvre pas
 * (plusieurs instances) se DIT dans le module, jamais ne se suppose.
 * ============================================================================
 */
import { readFile } from 'node:fs/promises';
import { describe, it, expect, beforeEach } from 'vitest';

import {
  fileDuService,
  cacheDuService,
  ServiceSature,
  reinitialiserLesBornes,
} from '@/lib/capacites/debit-de-service-public';

beforeEach(() => reinitialiserLesBornes());

describe('1 — la file : un passage par intervalle, quel que soit le nombre d\'appelants', () => {
  it('dix appels simultanés sortent espacés, dans l\'ordre', async () => {
    const file = fileDuService('essai', { intervalleMs: 30, attenteMaxMs: 10_000 });
    const debut = Date.now();
    const instants: number[] = [];
    await Promise.all(
      Array.from({ length: 10 }, () => file.passer(async () => { instants.push(Date.now() - debut); })),
    );
    expect(instants).toHaveLength(10);
    // L'invariant est « jamais AVANT son créneau », pas « l'écart mesuré vaut
    // l'intervalle » : sous charge, un `setTimeout` part en retard et l'écart
    // APPARENT entre deux passages se réduit d'autant, sans qu'aucun créneau
    // ait été volé. Un test écrit sur l'écart rougit alors sur la machine, pas
    // sur le code — et c'est un instrument faux de plus.
    for (let i = 0; i < instants.length; i++) {
      expect(instants[i], `passage ${i} servi avant son créneau`).toBeGreaterThanOrEqual(i * 30 - 5);
    }
    console.log(`  10 passages en ${instants[9]} ms (attendu ≥ 270 ms à 30 ms d'intervalle)`);
    expect(instants[9]).toBeGreaterThanOrEqual(265);
  });

  it('un appel isolé ne paie AUCUNE attente — la borne ne ralentit pas l\'usage normal', async () => {
    const file = fileDuService('isole', { intervalleMs: 1_000, attenteMaxMs: 5_000 });
    const debut = Date.now();
    await file.passer(async () => 'ok');
    expect(Date.now() - debut).toBeLessThan(50);
  });
});

describe('2 — au-delà de l\'attente acceptable, on REFUSE en le nommant', () => {
  it('le refus porte le nom du service et l\'attente, jamais un code nu', async () => {
    const file = fileDuService('sature', { intervalleMs: 1_000, attenteMaxMs: 1_500 });
    const lances = Array.from({ length: 5 }, () => file.passer(async () => 'ok').catch((e) => e));
    const resultats = await Promise.all(lances);
    const refus = resultats.filter((r) => r instanceof ServiceSature) as ServiceSature[];
    expect(refus.length).toBeGreaterThan(0);
    expect(refus[0]!.message).toMatch(/sature/);
    expect(refus[0]!.message).toMatch(/ms/);
    console.log(`  ${resultats.length - refus.length} passés, ${refus.length} refusés : « ${refus[0]!.message} »`);
  });
});

describe('3 — le cache : ce qui ne bouge pas ne se redemande pas', () => {
  it('une clé relue avant expiration ne repart pas au service', () => {
    const cache = cacheDuService<string>('lieux', 10_000, 100);
    cache.ecrire('lyon', 'Lyon, France');
    expect(cache.lire('lyon')).toBe('Lyon, France');
    expect(cache.lire('absente')).toBeUndefined();
  });

  it('une entrée expirée n\'est pas servie', async () => {
    const cache = cacheDuService<string>('court', 20, 100);
    cache.ecrire('x', 'valeur');
    await new Promise((r) => setTimeout(r, 40));
    expect(cache.lire('x')).toBeUndefined();
  });

  it('la taille est bornée : les plus vieilles entrées partent', () => {
    const cache = cacheDuService<number>('borne', 10_000, 3);
    for (let i = 0; i < 10; i++) cache.ecrire(`k${i}`, i);
    expect(cache.taille()).toBe(3);
    expect(cache.lire('k0')).toBeUndefined();
    expect(cache.lire('k9')).toBe(9);
  });
});

describe('4 — le service des lieux passe VRAIMENT par la file', () => {
  it('aucun appel réseau n\'échappe à la borne', async () => {
    const src = await readFile('lib/capacites/les-lieux.ts', 'utf-8');
    expect(src).toContain('.passer(() => appeler(');
    // Un appel direct contournerait la borne sans que rien ne rougisse.
    expect(src.match(/await\s+(fetch|appeler)\s*\(/g) ?? [], 'un appel hors de la file').toHaveLength(0);
    expect(src).toContain('cacheDuService');
    expect(src).toContain('tzlookup(');
  });
});
