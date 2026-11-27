/**
 * `estLibre` du gabarit (`src/lib/occupations.ts`) grise d'avance ce que la base refuserait (`periode.exclusive`,
 * `test/backend/incident-deux-reservations-du-meme-creneau.test.ts`) : la même règle, la foule comptée instant par instant.
 */
import { describe, expect, it } from 'vitest';
import { estLibre } from '@/squelette/gabarit/src/lib/les-places';

const h = (x: string) => new Date(`2027-03-01T${x}:00+01:00`);
const o = (a: string, b: string) => ({ debut: h(a).toISOString(), fin: h(b).toISOString() });

describe('estLibre', () => {
  it('une place : un créneau qui touche sans chevaucher est libre, un qui chevauche ne l’est pas', () => {
    const prises = [o('09:00', '10:00')];
    expect(estLibre(prises, h('10:00'), h('11:00'))).toBe(true);
    expect(estLibre(prises, h('08:00'), h('09:00'))).toBe(true);
    expect(estLibre(prises, h('09:30'), h('10:30'))).toBe(false);
  });
  it('deux places : deux occupations qui se suivent ne s’additionnent pas, deux qui se recouvrent, si', () => {
    const prises = [o('09:00', '10:00'), o('10:00', '11:00'), o('09:30', '10:30')];
    expect(estLibre(prises, h('09:45'), h('10:15'), 2)).toBe(false);
    expect(estLibre(prises, h('10:30'), h('11:00'), 2)).toBe(true);
    expect(estLibre(prises, h('11:00'), h('12:00'), 1)).toBe(true);
  });
});
