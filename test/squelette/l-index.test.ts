/**
 * L'index d'un projet (Antoine, 26/11) : qui importe chaque fichier, et les pages avec leur adresse et leur titre.
 * Calculé par vavi depuis les fichiers, jamais écrit par Claude.
 */
import { describe, expect, it } from 'vitest';
import { lIndex } from '@/squelette/l-index';

const siens = new Map([
  ['src/pages/index.tsx', "import { Carte } from '@/composants/Carte';\nimport { Hero } from '@/briques/sections';\nexport const titre = 'Accueil';\nexport default () => null;"],
  ['src/pages/catalogue/index.tsx', "import { Carte } from '../../composants/Carte';\nimport React from 'react';\nexport const titre = \"Catalogue\";\nexport default () => null;"],
  ['src/pages/produit/$id.tsx', "import { Carte } from '@/composants/Carte.tsx';\nexport default () => null;"],
  ['src/composants/Carte.tsx', "import { prix } from './prix';\nexport const Carte = () => null;"],
  ['src/composants/prix.ts', 'export const prix = 1;'],
  ['src/pages/404.tsx', 'export default () => null;'],
]);
const cadre = new Set(['src/briques/sections.tsx']);

describe('l’index d’un projet', () => {
  const i = lIndex(siens, (c) => cadre.has(c));
  it('dit, pour chaque fichier, les fichiers de Claude qui l’importent (alias, relatif, extension écrite), sans les paquets', () => {
    expect(i.utilisePar.get('src/composants/Carte.tsx')).toEqual(['src/pages/catalogue/index.tsx', 'src/pages/index.tsx', 'src/pages/produit/$id.tsx']);
    expect(i.utilisePar.get('src/composants/prix.ts')).toEqual(['src/composants/Carte.tsx']);
    expect(i.utilisePar.get('src/briques/sections.tsx')).toEqual(['src/pages/index.tsx']);
    expect([...i.utilisePar.keys()].some((k) => k.includes('react'))).toBe(false);
    expect(i.utilisePar.has('src/pages/index.tsx')).toBe(false);
  });
  it('liste les pages, leur adresse et le titre écrit en toutes lettres ; 404 n’en est pas une', () => {
    expect(i.pages).toEqual([
      { path: 'src/pages/index.tsx', address: '/', title: 'Accueil' },
      { path: 'src/pages/catalogue/index.tsx', address: '/catalogue', title: 'Catalogue' },
      { path: 'src/pages/produit/$id.tsx', address: '/produit/:id', title: null },
    ]);
  });
});
