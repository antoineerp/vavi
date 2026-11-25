/**
 * Les photos d'une app (demande d'Antoine du 25/11 : des sites aussi riches qu'en août, qui portaient de vraies photos) :
 * la photo posée est celle dont la banque dit voir le sujet ; un nom posé est gardé ; un sujet qu'aucune ne montre est dit,
 * rien n'est posé ; l'image posée a ses tailles et ses crédits ; un texte illisible ne casse rien.
 */
import { describe, expect, it } from 'vitest';
import { lireLesImages, poserLesImages, type Banque, type ImageTrouvee } from '@/lib/images/la-banque';

const une = (source: string, decrit: string): ImageTrouvee => ({ source: `https://images.unsplash.com/${source}`, largeur: 2400, hauteur: 1600, decrit,
  auteur: 'Ada', profil: 'https://unsplash.com/@ada', banque: 'Unsplash', lienBanque: 'https://unsplash.com/' });

function banque(trouvees: Record<string, ImageTrouvee[]>): Banque & { signalees: string[] } {
  const signalees: string[] = [];
  return { signalees, chercher: async (sujet) => trouvees[sujet] ?? [], signaler: async (i) => { signalees.push(i.source); } };
}

describe('les photos de l’app', () => {
  it('pose la photo qui montre le sujet, avec ses tailles et ses crédits, et la signale à la banque', async () => {
    const b = banque({ 'wooden bakery counter': [une('a', 'a city street at night'), une('b', 'bread on a wooden bakery counter')] });
    const r = await poserLesImages(undefined, [{ nom: 'comptoir', sujet: 'wooden bakery counter', alt: 'Le comptoir' }], b);
    const posees = lireLesImages(r.texte!);
    expect(posees.comptoir!.sources.map(([l]) => l)).toEqual([640, 1280, 1920]);
    expect(posees.comptoir!.sources[0]![1]).toMatch(/^https:\/\/images\.unsplash\.com\/b\?w=640/);
    expect(posees.comptoir).toMatchObject({ alt: 'Le comptoir', auteur: 'Ada', banque: 'Unsplash' });
    expect(b.signalees).toEqual(['https://images.unsplash.com/b']);
  });
  it('garde un nom déjà posé, dit un sujet qu’aucune photo ne montre, et ne réécrit rien sans changement', async () => {
    const avant = `${JSON.stringify({ comptoir: { alt: 'x', largeur: 1, hauteur: 1, sources: [[640, 'https://images.unsplash.com/z?w=640']], auteur: '', profil: '', banque: '', lienBanque: '' } })}\n`;
    const r = await poserLesImages(avant, [{ nom: 'comptoir', sujet: 'bread', alt: 'Pain' }, { nom: 'four', sujet: 'stone oven', alt: 'Four' }],
      banque({ 'stone oven': [une('c', 'a mountain lake')] }));
    expect(r.texte).toBeNull();
    expect(r.dits[0]).toMatch(/already set/);
    expect(r.dits[1]).toMatch(/no photo shows "stone oven" \(the bank sees: a mountain lake\)/);
  });
  it('un images.json illisible se lit vide', () => {
    expect(lireLesImages('pas du json')).toEqual({});
    expect(lireLesImages('[1]')).toEqual({});
  });
});
