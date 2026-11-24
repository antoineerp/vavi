import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { laFicheDe, lesDeclarations } from '@/squelette/la-fiche';
import { CHEMINS_EN_FICHE, CHEMINS_A_LIRE_ENTIERS, DOSSIER_DU_GABARIT, laFiche } from '@/squelette/registre';

describe('la fiche du gabarit', () => {
  it('est celle que le gabarit donne aujourd’hui (sinon : npx tsx scripts/la-fiche.ts)', () => {
    const refaite = laFicheDe(CHEMINS_EN_FICHE.map((c) => [c, readFileSync(join(DOSSIER_DU_GABARIT, c), 'utf8')] as const));
    expect(laFiche()).toBe(refaite);
  });
  it('rend les déclarations sans le code (l’instrument discrimine)', () => {
    const d = lesDeclarations('a.ts', "import x from 'y';\n/** Doc. */\nexport function f(a: number): number { return a * 2 + x; }\nconst cache = 1;\n");
    expect(d).toMatch(/\/\*\* Doc\. \*\/\nexport declare function f\(a: number\): number;/);
    expect(d).not.toMatch(/return|cache|import/);
  });
  it('ne prend que les fichiers du gabarit : ce qui dérive d’app.json se lit entier', () => {
    expect(CHEMINS_A_LIRE_ENTIERS).toEqual(['app.json', 'src/donnees/types.ts']);
    expect(CHEMINS_EN_FICHE.some((c) => CHEMINS_A_LIRE_ENTIERS.includes(c))).toBe(false);
  });
});
