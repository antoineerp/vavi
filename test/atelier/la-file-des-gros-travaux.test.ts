/**
 * La file des gros travaux : jamais plus de builds et de navigateurs à la fois que de places, les suivants attendent dans
 * l'ordre, une place est rendue même quand le travail échoue ; et le serveur réel y fait passer les quatre.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { enFile, placesDuServeur, uneFile } from '@/lib/atelier/la-file';

const attendre = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('la file des gros travaux', () => {
  it('cinq travaux demandés ensemble : deux à la fois au plus, dans l’ordre d’arrivée, tous menés au bout', async () => {
    const f = uneFile(2);
    let enMemeTemps = 0, auPlus = 0;
    const ordre: number[] = [];
    const r = await Promise.all([0, 1, 2, 3, 4].map((i) => f.passer(async () => {
      ordre.push(i); enMemeTemps++; auPlus = Math.max(auPlus, enMemeTemps);
      await attendre(15);
      enMemeTemps--;
      return i * 10;
    })));
    expect(auPlus).toBe(2);
    expect(ordre).toEqual([0, 1, 2, 3, 4]);
    expect(r).toEqual([0, 10, 20, 30, 40]);
    expect([f.enCours(), f.enAttente()]).toEqual([0, 0]);
  });

  it('un travail qui échoue rend sa place : le suivant passe', async () => {
    const f = uneFile(1);
    const a = f.passer(async () => { await attendre(5); throw new Error('rouge'); });
    const b = f.passer(async () => 'vert');
    await expect(a).rejects.toThrow('rouge');
    await expect(b).resolves.toBe('vert');
    expect(f.enCours()).toBe(0);
  });

  it('les places du serveur : 2 par défaut, la variable lue si elle est sensée', () => {
    expect(placesDuServeur({})).toBe(2);
    expect(placesDuServeur({ VAVI_GROS_TRAVAUX_EN_MEME_TEMPS: '3' })).toBe(3);
    expect(placesDuServeur({ VAVI_GROS_TRAVAUX_EN_MEME_TEMPS: '0' })).toBe(2);
    expect(placesDuServeur({ VAVI_GROS_TRAVAUX_EN_MEME_TEMPS: 'beaucoup' })).toBe(2);
    expect(uneFile(0).enCours()).toBe(0);
  });

  it('enFile passe par la file donnée', async () => {
    const f = uneFile(1);
    let dedans = 0, auPlus = 0;
    await Promise.all([1, 2, 3].map(() => enFile('essai', async () => { dedans++; auPlus = Math.max(auPlus, dedans); await attendre(5); dedans--; }, f)));
    expect(auPlus).toBe(1);
  });

  it('le serveur réel fait passer le build, le pré-rendu, les captures et les parcours par la file', () => {
    const source = readFileSync('lib/mcp/le-contexte-reel.ts', 'utf8');
    for (const q of ['build', 'pré-rendu', 'captures', 'parcours']) expect(source).toContain(`enFile('${q}'`);
    expect(source).not.toMatch(/construire: \(arbre, b\) => construireLApp/);
  });
});
