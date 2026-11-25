/**
 * INCIDENT 25/11 (Antoine, notes de frais) : « Cet écran ne vous est pas ouvert », et « Revenir à l'accueil » ne faisait
 * rien : l'accueil était l'écran fermé. Un rôle à qui l'accueil est fermé arrive sur son écran ; un compte sans rôle se
 * l'entend dire. Rouge sur le code d'avant (la fonction n'existait pas, l'écran fermé renvoyait toujours à `/`).
 */
import { describe, expect, it } from 'vitest';
import { apresUnEcranFerme } from '@/squelette/gabarit/src/lib/acces';

describe('après un écran fermé', () => {
  it('l’accueil fermé à ce rôle mène à son écran', () => {
    expect(apresUnEcranFerme('/', ['compta'], '/compta')).toEqual({ rendre: 'aller', vers: '/compta' });
  });
  it('un autre écran fermé renvoie à l’écran du rôle, jamais à lui-même', () => {
    expect(apresUnEcranFerme('/equipe', ['compta'], '/compta')).toEqual({ rendre: 'ferme', vers: '/compta' });
    expect(apresUnEcranFerme('/compta', ['salarie'], '/compta')).toEqual({ rendre: 'ferme', vers: '/' });
  });
  it('un compte sans aucun rôle l’entend dire', () => {
    expect(apresUnEcranFerme('/', [], '/')).toEqual({ rendre: 'sans-role' });
  });
});
