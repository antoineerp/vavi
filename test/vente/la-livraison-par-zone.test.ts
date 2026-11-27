/**
 * La livraison par zone et au poids (Antoine, 27/11) : le prix de l'envoi suit le pays et le poids du colis, lus en base
 * comme le prix. Avant : un seul prix pour tous les pays et tous les colis ; un colis de 12 kg vers le Canada payait
 * l'envoi d'une lettre en France.
 */
import { describe, expect, it } from 'vitest';
import { DIRECTION, unManifeste } from '../aides/un-manifeste';
import { laBoutique } from '@/lib/vente/la-boutique';
import { chiffrer, lePanierMontre, type ArticleLu } from '@/lib/vente/le-chiffrage';
import { lireLeManifeste } from '@/lib/backend/app/manifeste';
import { ouvrirLaVente, type DependancesDeLaVente } from '@/lib/vente/la-vente';

const MANIFESTE = { version: 1, nom: 'Essai', description: 'Un essai.', langues: { principale: 'fr' }, direction: DIRECTION, nature: 'boutique', fonctions: { panier: true },
  roles: [{ nom: 'gerant', libelle: 'Gérant', obtenu: 'proprietaire' }],
  tables: [
    { nom: 'piece', libelle: 'Pièces', appartenance: 'publique', lecture: ['visiteur', 'gerant'], ecriture: ['gerant'],
      champs: [{ nom: 'nom', libelle: 'Nom', type: 'texte', obligatoire: true }, { nom: 'prix', libelle: 'Prix', type: 'montant', obligatoire: true },
        { nom: 'poids', libelle: 'Poids (kg)', type: 'nombre' }],
      vente: { prix: 'prix', libelle: 'nom', poids: 'poids' } },
  ],
  vente: { pays: 'FR', devise: 'EUR', livraison: { pays: ['FR'], prix: 9, offerteDes: 150, zones: [
    { nom: 'France', pays: ['FR'], tranches: [{ jusqua: 5, prix: 8.9 }, { jusqua: 1, prix: 4.9 }, { jusqua: 20, prix: 14.9 }] },
    { nom: 'Europe', pays: ['BE', 'DE'], offerteDes: null, tranches: [{ jusqua: 2, prix: 12 }, { jusqua: 10, prix: 22 }] },
    { nom: 'Suisse', pays: ['CH'], prix: 25 },
  ] } } };
const B = laBoutique(unManifeste(MANIFESTE))!;
const piece = (x: Partial<ArticleLu> & { id: string }): ArticleLu => ({ prix: 20, libelle: 'Bol', stock: null, tva: null, poids: 0.8, options: null, ...x });
const panier = (quantite: number, x: Partial<ArticleLu> = {}) => {
  const c = chiffrer(B, [{ table: 'piece', id: 'a', quantite }], new Map([['piece', [piece({ id: 'a', ...x })]]]), null, undefined);
  if (c.forme !== 'chiffre') throw new Error(c.raison);
  return c.panier;
};
const envoi = (quantite: number, pays: string, x: Partial<ArticleLu> = {}) => lePanierMontre(B, panier(quantite, x), { pays, retrait: false });

describe('la livraison par zone et au poids', () => {
  it('INCIDENT — le prix suit la tranche du poids du colis dans la zone du pays (les tranches lues dans l’ordre du poids)', () => {
    expect(envoi(1, 'FR').livraison.centimes).toBe(490);     // 0,8 kg ≤ 1
    expect(envoi(2, 'FR').livraison.centimes).toBe(890);     // 1,6 kg ≤ 5
    expect(envoi(7, 'FR').livraison.centimes).toBe(1490);    // 5,6 kg ≤ 20 (140 €, sous le seuil)
  });
  it('la limite d’une tranche est incluse ; le récapitulatif nomme la zone', () => {
    const m = envoi(1, 'BE', { poids: 2 });
    expect(m.livraison.centimes).toBe(1200);
    expect(m.recapitulatif.find((l) => l.libelle.startsWith('Livraison'))).toEqual({ libelle: 'Livraison (Europe)', centimes: 1200 });
  });
  it('un colis plus lourd que la dernière tranche ne part pas : le panier le dit', () => {
    const m = envoi(13, 'BE'); // 10,4 kg
    expect(m.livraison.impossible).toMatch(/10\.4 kg.*Europe.*10 kg/);
    expect(m.aPayerCentimes).toBe(13 * 2000);
  });
  it('un article sans poids : l’envoi au poids ne se calcule pas, et l’article est nommé', () => {
    expect(envoi(1, 'FR', { poids: null }).livraison.impossible).toMatch(/« Bol » n’a pas encore de poids/);
  });
  it('une zone sans tranche a son prix ; le seuil d’envoi offert est celui de la zone (`null` : jamais)', () => {
    expect(envoi(1, 'CH', { poids: 50 }).livraison.centimes).toBe(2500);
    expect(envoi(8, 'FR').livraison.centimes).toBe(0);       // 160 € ≥ 150 €, offert même au poids
    expect(envoi(8, 'DE').livraison.centimes).toBe(2200);    // Europe : jamais offert
  });
  it('les pays des zones sont desservis, et c’est dit ; un pays dans deux zones, des tranches sans poids : refusés', () => {
    const r = lireLeManifeste(MANIFESTE);
    if (!r.ok) throw new Error(r.erreurs.join(' | '));
    expect(r.manifeste.vente!.livraison.pays).toEqual(['FR', 'BE', 'DE', 'CH']);
    expect(r.repare.join(' ')).toMatch(/BE, DE, CH ajouté/);
    const deux = structuredClone(MANIFESTE);
    deux.vente.livraison.zones[2]!.pays = ['CH', 'BE'];
    expect(lireLeManifeste(deux)).toMatchObject({ ok: false, erreurs: [expect.stringMatching(/BE est dans deux zones/)] });
    const sansPoids = structuredClone(MANIFESTE);
    delete (sansPoids.tables[0]!.vente as { poids?: string }).poids;
    expect(lireLeManifeste(sansPoids)).toMatchObject({ ok: false, erreurs: [expect.stringMatching(/piece déclare le champ du poids/)] });
  });
  it('le paiement : la commande porte l’envoi de la zone ; un colis que la zone ne prend pas ne s’ouvre pas, aucune commande créée', async () => {
    const appels: { fonction: string; args: Record<string, unknown> }[] = [];
    const monde = (poids: number): DependancesDeLaVente => ({
      async rpc(fonction, args) {
        appels.push({ fonction, args });
        if (fonction === 'app_articles_a_vendre') return { data: [piece({ id: 'a', poids })], error: null };
        if (fonction === 'app_ouvrir_une_commande') return { data: 'c1', error: null };
        return { data: null, error: null };
      },
      leProjet: async () => ({ lu: true, valeur: { proprietaire: 'proprio', appJson: JSON.stringify(unManifeste(MANIFESTE)) } }),
      leCompte: async () => ({ cle: 'sk_test_x', compte: 'acct_x' }), secretDuWebhook: 'whsec_x', journal: () => {},
      stripe: async () => ({ ok: true, json: async () => ({ id: 'cs_1', url: 'https://checkout.stripe.test/cs_1' }) }),
    });
    const acheteur = { nom: 'Ada Lovelace', courriel: 'ada@exemple.fr', adresse: { line1: '1 Rue', postal_code: '1000', city: 'Bruxelles', country: 'BE' } };
    const P = '0f1e2d3c-4b5a-4968-8776-655443322110';
    expect((await ouvrirLaVente(monde(1.5), P, { lignes: [{ table: 'piece', id: 'a', quantite: 1 }], acheteur }, null, 'https://vavi.test')).statut).toBe(200);
    expect(appels.find((a) => a.fonction === 'app_ouvrir_une_commande')?.args).toMatchObject({ p_livraison: 1200, p_montant: 3200 });
    appels.length = 0;
    const lourd = await ouvrirLaVente(monde(11), P, { lignes: [{ table: 'piece', id: 'a', quantite: 1 }], acheteur }, null, 'https://vavi.test');
    expect(lourd).toMatchObject({ statut: 409, corps: { error: expect.stringMatching(/11 kg.*Europe/) } });
    expect(appels.some((a) => a.fonction === 'app_ouvrir_une_commande')).toBe(false);
  });
});
