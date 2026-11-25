import { describe, expect, it } from 'vitest';
import { ilYA, lActivite, lEtat, lEvolution, laTeinte, lesJours } from '@/app/_partage/le-pilotage';
import type { Projet } from '@/lib/projets/les-projets';

const projet = (x: Partial<Projet>): Projet => ({ id: 'a', nom: 'A', version: 1, apercuEmpreinte: null, enLigneEmpreinte: null, enLigneLe: null, basePoseeLe: null, modifieLe: '2026-11-25T10:00:00Z', chantier: null, ...x });
const MAINTENANT = Date.parse('2026-11-25T12:00:00Z');

describe('les écrans de pilotage', () => {
  it('l’état d’un projet : en ligne, à publier, aperçu seul, rien', () => {
    expect(lEtat(projet({}))).toBe('vide');
    expect(lEtat(projet({ apercuEmpreinte: 'x' }))).toBe('apercu');
    expect(lEtat(projet({ apercuEmpreinte: 'x', enLigneEmpreinte: 'x' }))).toBe('en_ligne');
    expect(lEtat(projet({ apercuEmpreinte: 'y', enLigneEmpreinte: 'x' }))).toBe('a_publier');
  });
  it('chaque jour de la période, 0 quand rien n’est vu, les mêmes jours additionnés', () => {
    expect(lesJours([{ jour: '2026-11-24', visites: 4 }, { jour: '2026-11-24', visites: 1 }, { jour: '2026-11-10', visites: 9 }], 3, MAINTENANT))
      .toEqual([{ jour: '2026-11-23', visites: 0 }, { jour: '2026-11-24', visites: 5 }, { jour: '2026-11-25', visites: 0 }]);
  });
  it('l’évolution d’une semaine sur l’autre, rien quand la semaine d’avant est vide (jamais +∞)', () => {
    const s = (a: number[]) => a.map((visites) => ({ visites }));
    expect(lEvolution(s([1, 1, 1, 1, 1, 1, 4, 2, 2, 2, 2, 2, 2, 3]))).toBe(50);
    expect(lEvolution(s([0, 0, 0, 0, 0, 0, 0, 2, 2, 2, 2, 2, 2, 3]))).toBeNull();
  });
  it('l’activité, la plus récente d’abord ; une teinte stable hors des violets ; le temps en mots', () => {
    const a = lActivite([projet({ id: 'a', enLigneLe: '2026-11-25T09:00:00Z' }), projet({ id: 'b', modifieLe: '2026-11-25T11:00:00Z' })], 5);
    expect(a.map((e) => `${e.projet.id}:${e.nature}`)).toEqual(['b:version', 'a:version', 'a:en_ligne']);
    expect(laTeinte('abc')).toBe(laTeinte('abc'));
    for (const id of ['a', 'b', 'c', 'd', 'e', 'f']) expect(laTeinte(id) < 250 || laTeinte(id) > 330).toBe(true);
    expect(ilYA('2026-11-25T11:55:00Z', MAINTENANT, 'fr')).toBe('il y a 5 min');
    expect(ilYA('2026-11-25T09:00:00Z', MAINTENANT, 'en')).toBe('3 h ago');
  });
});
