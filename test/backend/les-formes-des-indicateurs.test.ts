/**
 * LES FIGURES D'UN TABLEAU DE BORD (Antoine, 27/11 : « pour les apps métier on avait tous les graphiques financiers
 * modernes, des Gantt… ») : un indicateur réparti se déclare dans dix formes, celles du temps sur une date, celles d'un champ
 * sur un champ ; le cumul et la cascade ne posent bout à bout qu'un nombre ou une somme. Chaque forme a son dessin dans le
 * gabarit, et aucune couleur ne tourne autour de l'accent (le violet est banni).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { lireLeManifeste } from '@/lib/backend/app/manifeste';
import { FORMES_DANS_LE_TEMPS, FORMES_PAR_UN_CHAMP } from '@/lib/backend/app/les-indicateurs';
import { DIRECTION } from '../aides/un-manifeste';

const app = (indicateur: Record<string, unknown>) => lireLeManifeste({
  version: 1, nature: 'app', nom: 'Pilotage', description: 'Un essai.', langues: { principale: 'fr' }, direction: DIRECTION,
  organisations: 'une', roles: [{ nom: 'gerant', libelle: 'Gérant', obtenu: 'proprietaire' }],
  tables: [{ nom: 'ventes', libelle: 'Ventes', appartenance: 'organisation', lecture: ['gerant'], ecriture: ['gerant'], champs: [
    { nom: 'titre', libelle: 'Titre', type: 'texte', obligatoire: true }, { nom: 'montant', libelle: 'Montant', type: 'montant' },
    { nom: 'le', libelle: 'Date', type: 'date' }, { nom: 'canal', libelle: 'Canal', type: 'choix', valeurs: ['web', 'boutique'] }] }],
  indicateurs: [{ nom: 'ca', libelle: 'CA', table: 'ventes', ...indicateur }],
});
const erreurs = (x: ReturnType<typeof app>) => (x.ok ? '' : x.erreurs.join(' | '));
const temps = { calcul: 'somme', champ: 'montant', par: { date: 'le', unite: 'mois' } };
const champ = { calcul: 'somme', champ: 'montant', par: { champ: 'canal' } };

describe('les formes d’un indicateur réparti', () => {
  it('chaque forme du temps se déclare sur une date, chaque forme d’un champ sur un champ', () => {
    for (const forme of FORMES_DANS_LE_TEMPS) expect(erreurs(app({ ...temps, forme })), forme).toBe('');
    for (const forme of FORMES_PAR_UN_CHAMP) expect(erreurs(app({ ...champ, forme })), forme).toBe('');
    expect(erreurs(app({ ...champ, forme: 'cascade' }))).toMatch(/par un champ : sa forme est `barres`, `anneau`, `entonnoir`/);
    expect(erreurs(app({ ...temps, forme: 'entonnoir' }))).toMatch(/dans le temps : sa forme est `colonnes`, `courbe`, `aire`/);
  });
  it('le cumul et la cascade posent bout à bout un nombre ou une somme, sans série', () => {
    expect(erreurs(app({ ...temps, calcul: 'moyenne', forme: 'cumul' }))).toMatch(/`cumul` pose les valeurs bout à bout/);
    expect(erreurs(app({ ...temps, par: { ...temps.par, serie: 'canal' }, forme: 'cascade' }))).toMatch(/`cascade` pose les valeurs bout à bout/);
    expect(erreurs(app({ ...temps, calcul: 'moyenne', forme: 'tuile' }))).toBe('');
    expect(erreurs(app({ ...temps, par: { ...temps.par, serie: 'canal' }, forme: 'aire' }))).toBe('');
  });
  it('chaque forme a son dessin dans le gabarit, et aucune couleur ne tourne autour de l’accent', () => {
    const lire = (f: string) => readFileSync(join(__dirname, '../../squelette/gabarit/src/briques', f), 'utf8');
    const figures = lire('figures.tsx');
    const table = /const FIGURES[^\n]*?>> = \{([^}]*)\}/.exec(figures)?.[1] ?? '';
    for (const forme of [...FORMES_DANS_LE_TEMPS, ...FORMES_PAR_UN_CHAMP]) expect(table, forme).toMatch(new RegExp(`\\b${forme}:`));
    for (const f of ['figures.tsx', 'figures-de-plus.tsx', 'Frise.tsx']) expect(lire(f), f).not.toMatch(/calc\(h \+/);
  });
});
