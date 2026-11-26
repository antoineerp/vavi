/**
 * INCIDENT 26/11 (essai de la console) : toutes les pages d'un site neuf avaient la même description, celle de l'app, et
 * rien ne le disait à Claude. Une page déclare la sienne (`export const description`), la tête de la page la prend, et le
 * build vert nomme les pages publiques qui n'en ont pas.
 */
import { describe, expect, it } from 'vitest';
import { faitDePage } from '@/squelette/gabarit/src/lib/faits';
import { lesPagesSansDescription } from '@/squelette/les-descriptions';

const PAGE = (extra: string) => `import { PUBLIC } from '@/lib/acces';\nexport const acces = PUBLIC;\nexport const titre = 'Les cours';\n${extra}export default function P() { return <h1>x</h1>; }\n`;

describe('la description d’une page', () => {
  it('se déclare comme le titre, en texte ou par langue, et se lit dans les faits', () => {
    expect(faitDePage('cours.tsx', PAGE("export const description = 'Initiation et perfectionnement au tour, à Lyon.';\n")).description).toBe('Initiation et perfectionnement au tour, à Lyon.');
    expect(faitDePage('cours.tsx', PAGE("export const description = { fr: 'Les cours', en: 'Classes' };\n")).description).toEqual({ fr: 'Les cours', en: 'Classes' });
    expect(faitDePage('cours.tsx', PAGE('')).description).toBeNull();
    expect(() => faitDePage('cours.tsx', PAGE('export const description = texte;\n'))).toThrow(/description/);
  });
  it('le build nomme les pages publiques sans description propre, hors fiche, page réservée et choix du propriétaire', () => {
    const siens = new Map([
      ['src/pages/index.tsx', PAGE('')],
      ['src/pages/cours.tsx', PAGE("export const description = 'Les cours de tournage.';\n")],
      ['src/pages/tarifs.tsx', PAGE('')],
      ['src/pages/ateliers/$id.tsx', PAGE('')],
      ['src/pages/espace.tsx', "import { COMPTE } from '@/lib/acces';\nexport const acces = COMPTE;\nexport default function E() { return null; }\n"],
      ['src/Chrome.tsx', 'export default function C() { return null; }'],
    ]);
    expect(lesPagesSansDescription(siens)).toEqual(['/', '/tarifs']);
    expect(lesPagesSansDescription(siens, JSON.stringify({ pages: { '/tarifs': { description: 'Nos tarifs.' } } }))).toEqual(['/']);
  });
  it('la tête de la page prend la description déclarée avant celle de l’app', async () => {
    const src = (await import('node:fs')).readFileSync('squelette/gabarit/src/lib/referencement.ts', 'utf8');
    expect(src).toMatch(/choisi\.description \|\| \(page \? descriptionDe\(page\) : null\) \|\| APP\.description/);
  });
});
