/**
 * Le nom lisible d'un site (Antoine, 26/11 : « ok pour point 1 ») : tiré du nom du projet, jamais un nom de la plateforme ;
 * le site en ligne servi à `<nom>.<domaine des apps>`, son identifiant y renvoie, l'aperçu garde le sien ; la carte garde
 * les noms quand la base tombe.
 */
import { describe, expect, it } from 'vitest';
import { estUnNomPermis, unNomDeSite } from '@/lib/domaines/les-noms';
import { laCarte, laCarteDesDomaines } from '@/lib/domaines/les-domaines';
import { lAdresseDeLApp, lAppDeLHote, laDecision } from '@/lib/publication/les-adresses-des-apps';
import { leRetour } from '@/lib/vente/la-vente';

const P = '0f1e2d3c-4b5a-4968-8776-655443322110';
const D = 'sites.vavi.dev';

describe('le nom tiré du projet', () => {
  it('sans accent, en minuscules, à tirets', () => {
    expect(unNomDeSite('Salon de Coiffure — Élodie !')).toBe('salon-de-coiffure-elodie');
    expect(unNomDeSite('3 Pommes')).toBe('pommes');
  });
  it('jamais un nom de la plateforme, un aperçu, ni trop court', () => {
    for (const n of ['www', 'api', 'console', 'apercu-truc', 'a', 'ab-', 'a--b']) expect(estUnNomPermis(n)).toBe(false);
    expect(unNomDeSite('Admin')).toBeNull();
    expect(unNomDeSite('x'.repeat(60))?.length).toBeLessThanOrEqual(40);
  });
});

describe('le site servi à son nom', () => {
  const o = { console: 'https://www.vavi.dev', domaine: D, domaines: laCarte([], [{ nom: 'salon', projet: P }]) };
  it('l’adresse du site en ligne est celle du nom ; l’aperçu garde son identifiant', () => {
    expect(lAdresseDeLApp(P, 'en_ligne', { ...o, nom: 'salon' })).toBe(`https://salon.${D}/`);
    expect(lAdresseDeLApp(P, 'apercu', { ...o, nom: 'salon' })).toBe(`https://apercu-${P}.${D}/`);
  });
  it('le nom sert le site en ligne ; un nom inconnu, rien', () => {
    expect(lAppDeLHote(`salon.${D}`, D, o.domaines.parNom)).toEqual({ projet: P, lequel: 'en_ligne' });
    expect(lAppDeLHote(`apercu-salon.${D}`, D, o.domaines.parNom)).toBeNull();
    expect(laDecision(`salon.${D}`, '/a', '?x=1', o)).toEqual({ faire: 'reecrire', chemin: `/s/${P}/a` });
    expect(laDecision(`autre.${D}`, '/', '', o)).toEqual({ faire: 'refuser' });
  });
  it('l’identifiant renvoie au nom, l’aperçu jamais', () => {
    expect(laDecision(`${P}.${D}`, '/a', '?x=1', o)).toEqual({ faire: 'rediriger', adresse: `https://salon.${D}/a?x=1` });
    expect(laDecision(`apercu-${P}.${D}`, '/', '', o)).toEqual({ faire: 'reecrire', chemin: `/p/${P}/` });
    expect(laDecision('www.vavi.dev', `/s/${P}/a`, '', o)).toEqual({ faire: 'rediriger', adresse: `https://salon.${D}/a` });
  });
  it('le retour du paiement garde une page du site à son nom', () => {
    expect(leRetour(`https://salon.${D}/merci`, 'https://www.vavi.dev', P, true, D, 'salon')).toMatch(`https://salon.${D}/merci`);
    expect(leRetour(`https://autre.${D}/merci`, 'https://www.vavi.dev', P, true, D, 'salon')).toMatch(new RegExp(`^https://salon\\.${D.replace(/\./g, '\\.')}/`));
  });
});

describe('la carte', () => {
  it('garde les noms lus quand leur lecture tombe', async () => {
    const lire = async () => ({ lu: true as const, valeur: [] });
    const a = await laCarteDesDomaines(lire, 1_000_000_000, async () => ({ lu: true as const, valeur: [{ nom: 'salon', projet: P }] }));
    expect(a.parNom.get('salon')).toBe(P);
    const b = await laCarteDesDomaines(lire, 1_000_100_000, async () => ({ lu: false as const, pourquoi: 'panne' }));
    expect(b.nomParProjet.get(P)).toBe('salon');
  });
});
