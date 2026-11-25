import { describe, expect, it } from 'vitest';
import { lesJours } from '@/app/_partage/la-courbe';

describe('la courbe des visites', () => {
  it('rend chaque jour de la période, 0 quand rien n’est vu, le dernier jour étant aujourd’hui', () => {
    const maintenant = Date.parse('2026-11-25T12:00:00Z');
    const s = lesJours([{ jour: '2026-11-24', visites: 4 }, { jour: '2026-11-10', visites: 9 }], 3, maintenant);
    expect(s).toEqual([{ jour: '2026-11-23', visites: 0 }, { jour: '2026-11-24', visites: 4 }, { jour: '2026-11-25', visites: 0 }]);
  });
});
