import { describe, it, expect } from 'vitest';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { lireLesFonctions, proprietaire, type Fonction } from '@/scripts/les-fonctions';
import { ecartsDeLaFermeture } from '@/scripts/fermeture';

const racine = join(__dirname, '..');
const lecture = lireLesFonctions(readFileSync(join(racine, 'FONCTIONS.md'), 'utf8'));

describe('FONCTIONS.md, la liste fermée', () => {
  it('se lit sans erreur', () => {
    expect(lecture.lue ? [] : lecture.erreurs).toEqual([]);
  });

  const fonctions = lecture.lue ? lecture.fonctions : [];

  it('chaque fonction présente a son module et son test', () => {
    const manques = fonctions
      .filter((f) => f.etat !== 'à reprendre')
      .flatMap((f) => [
        ...(existsSync(join(racine, f.module)) ? [] : [`${f.cle} : module ${f.module} absent`]),
        ...(existsSync(join(racine, f.test)) ? [] : [`${f.cle} : test ${f.test} absent`]),
      ]);
    expect(manques).toEqual([]);
  });

  it('une fonction « à reprendre » n’a pas encore de module : son état dirait faux', () => {
    const presentes = fonctions.filter((f) => f.etat === 'à reprendre' && existsSync(join(racine, f.module))).map((f) => f.cle);
    expect(presentes).toEqual([]);
  });

  it('aucun fichier n’importe hors de ce que sa fonction déclare', () => {
    expect(ecartsDeLaFermeture(racine, fonctions)).toEqual([]);
  });
});

describe('la lecture refuse une liste mal formée', () => {
  const entete = '| Clé | Fonction | Module | Test | Dépend de | État | Lot |\n| --- | --- | --- | --- | --- | --- | --- |\n';
  it('un état inconnu, une dépendance qui n’existe pas, un module partagé', () => {
    const r = lireLesFonctions(entete
      + '| a | A | lib/a | test/a.test.ts | z | finie | 1 |\n'
      + '| b | B | lib/a | test/b.test.ts | — | neuve | 1 |\n');
    expect(r.lue).toBe(false);
    if (!r.lue) {
      expect(r.erreurs.join('\n')).toMatch(/état « finie »/);
      expect(r.erreurs.join('\n')).toMatch(/dépend de « z »/);
      expect(r.erreurs.join('\n')).toMatch(/partagent le module lib\/a/);
    }
  });
  it('le module le plus long possède le chemin', () => {
    const f = (cle: string, module: string): Fonction => ({ cle, nom: cle, module, test: 'test/x.test.ts', dependDe: [], etat: 'neuve', lot: 1 });
    expect(proprietaire('lib/a/b/c.ts', [f('a', 'lib/a'), f('ab', 'lib/a/b')])?.cle).toBe('ab');
    expect(proprietaire('lib/ax/c.ts', [f('a', 'lib/a')])).toBeNull();
  });
});

describe('la fermeture discrimine (vérifier l’instrument)', () => {
  it('rougit sur un intrus, une dépendance non déclarée et un SDK de modèle', () => {
    const d = mkdtempSync(join(tmpdir(), 'fermeture-'));
    try {
      mkdirSync(join(d, 'lib/a'), { recursive: true });
      mkdirSync(join(d, 'lib/b'), { recursive: true });
      mkdirSync(join(d, 'lib/intrus'), { recursive: true });
      writeFileSync(join(d, 'lib/b/b.ts'), 'export const b = 1;\n');
      writeFileSync(join(d, 'lib/a/a.ts'), "import { b } from '@/lib/b/b';\nimport Anthropic from '@anthropic-ai/sdk';\nexport const a = b;\n");
      writeFileSync(join(d, 'lib/intrus/x.ts'), 'export const x = 1;\n');
      const f = (cle: string, dependDe: string[] = []): Fonction => ({ cle, nom: cle, module: `lib/${cle}`, test: 'test/x.test.ts', dependDe, etat: 'neuve', lot: 1 });
      const ecarts = ecartsDeLaFermeture(d, [f('a'), f('b')]);
      expect(ecarts.some((e) => e.includes('lib/intrus/x.ts'))).toBe(true);
      expect(ecarts.some((e) => e.includes('absent de son « Dépend de »'))).toBe(true);
      expect(ecarts.some((e) => e.includes('@anthropic-ai/sdk'))).toBe(true);
      // Déclarée, la dépendance passe.
      const apres = ecartsDeLaFermeture(d, [f('a', ['b']), f('b')]);
      expect(apres.some((e) => e.includes('absent de son « Dépend de »'))).toBe(false);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });
});
