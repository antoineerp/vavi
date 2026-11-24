/**
 * La vente, en fonctions pures : le prix vient de la base et jamais du navigateur (l'incident « L'Atelier du Cuir Cousu »
 * de constructor-v13), la livraison, la remise, la TVA ventilée, les coordonnées, l'adresse de retour, la signature du
 * webhook. Et la vente de bout en bout contre une base et un Stripe joués : la commande payée une fois, au bon montant.
 */
import { describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import { unManifeste } from '../aides/un-manifeste';
import { laBoutique, type Boutique } from '@/lib/vente/la-boutique';
import { chiffrer, laVentilation, lePanierMontre, lireLesCoordonnees, lireLesLignes, tauxDeLaLigne, type ArticleLu } from '@/lib/vente/le-chiffrage';
import { verifierLaSignature } from '@/lib/vente/stripe';
import { chiffrerLePanier, confirmerLaVente, leRetour, lireLaFacture, ouvrirLaVente, type DependancesDeLaVente } from '@/lib/vente/la-vente';
import { lesTauxDuPays } from '@/lib/vente/les-taux-de-tva';

const P = '0f1e2d3c-4b5a-4968-8776-655443322110';
const MANIFESTE = { nature: 'boutique', fonctions: { panier: true },
  roles: [{ nom: 'gerant', libelle: 'Gérant', obtenu: 'proprietaire' }, { nom: 'client', libelle: 'Client', obtenu: 'inscription' }],
  tables: [
    { nom: 'the', libelle: 'Thés', appartenance: 'publique', lecture: ['visiteur', 'client', 'gerant'], ecriture: ['gerant'],
      champs: [{ nom: 'nom', libelle: 'Nom', type: 'texte', obligatoire: true }, { nom: 'prix', libelle: 'Prix', type: 'montant', obligatoire: true },
        { nom: 'stock', libelle: 'Stock', type: 'entier' }, { nom: 'taux', libelle: 'TVA', type: 'nombre' }, { nom: 'tailles', libelle: 'Tailles', type: 'texte' }],
      vente: { prix: 'prix', libelle: 'nom', stock: 'stock', tva: 'taux', options: 'tailles' } },
    { nom: 'code', libelle: 'Codes', appartenance: 'publique', lecture: ['gerant'], ecriture: ['gerant'],
      champs: [{ nom: 'code', libelle: 'Code', type: 'texte', obligatoire: true }, { nom: 'pourcentage', libelle: '%', type: 'nombre' }] },
  ],
  vente: { pays: 'FR', devise: 'EUR', livraison: { pays: ['FR', 'BE'], prix: 5, offerteDes: 100, retrait: '3 rue du Port' }, remise: { table: 'code', code: 'code', pourcentage: 'pourcentage' } } };
const B: Boutique = laBoutique(unManifeste(MANIFESTE))!;
const the = (x: Partial<ArticleLu> & { id: string }): ArticleLu => ({ prix: 12, libelle: 'Sencha', stock: null, tva: null, poids: null, options: null, ...x });

describe('le chiffrage d’un panier', () => {
  it('INCIDENT — un prix envoyé par le navigateur ne compte pas : seul celui de la base est payé', () => {
    const lignes = lireLesLignes([{ table: 'the', id: 'a', quantite: 2, prix: 0.01, centimes: 1 }]);
    if (typeof lignes === 'string') throw new Error(lignes);
    const c = chiffrer(B, lignes, new Map([['the', [the({ id: 'a', prix: '12.50' })]]]), null, undefined);
    if (c.forme !== 'chiffre') throw new Error(c.raison);
    expect(c.panier.articlesCentimes).toBe(2500);
    expect(c.panier.lignes[0]).toMatchObject({ centimes: 1250, quantite: 2, taux: 20 });
  });
  it('une ligne mal formée est refusée en la nommant ; une table qui ne se vend pas aussi', () => {
    expect(lireLesLignes([])).toMatch(/lignes/);
    expect(lireLesLignes([{ table: 'the; drop', id: 'a' }])).toMatch(/lignes\[0\]/);
    expect(lireLesLignes([{ table: 'the', id: 'a', quantite: 100 }])).toMatch(/quantite/);
    expect(chiffrer(B, [{ table: 'code', id: 'x', quantite: 1 }], new Map(), null, undefined)).toMatchObject({ forme: 'refus', statut: 400 });
  });
  it('le stock, la variante et l’article disparu', () => {
    const lu = (x: Partial<ArticleLu>) => new Map([['the', [the({ id: 'a', ...x })]]]);
    expect(chiffrer(B, [{ table: 'the', id: 'a', quantite: 3 }], lu({ stock: 2 }), null, undefined)).toMatchObject({ forme: 'refus', raison: expect.stringContaining('2') });
    expect(chiffrer(B, [{ table: 'the', id: 'a', quantite: 1 }], lu({ options: 'S, M' }), null, undefined)).toMatchObject({ forme: 'refus', raison: expect.stringContaining('S, M') });
    const v = chiffrer(B, [{ table: 'the', id: 'a', quantite: 1, option: 'M' }], lu({ options: 'S, M' }), null, undefined);
    expect(v.forme === 'chiffre' && v.panier.lignes[0]!.libelle).toBe('Sencha — M');
    const r = chiffrer(B, [{ table: 'the', id: 'zz', quantite: 1 }], lu({}), null, undefined);
    expect(r.forme === 'chiffre' && r.panier.retirees).toEqual([{ table: 'the', id: 'zz', quantite: 1 }]);
  });
  it('la remise d’un code baisse le prix payé ; un code qui ne vaut pas est dit', () => {
    const lu = new Map([['the', [the({ id: 'a', prix: 50 })]]]);
    const c = chiffrer(B, [{ table: 'the', id: 'a', quantite: 1 }], lu, 'BIENVENUE', { pourcentage: 10, montant: null });
    if (c.forme !== 'chiffre') throw new Error(c.raison);
    const m = lePanierMontre(B, c.panier, { pays: 'FR', retrait: false });
    expect(m.aPayerCentimes).toBe(4500 + 500);
    expect(m.recapitulatif.map((l) => l.libelle)).toEqual(['Sous-total', 'Remise « BIENVENUE »', 'Livraison', 'Total', 'dont TVA 20 %']);
    const non = chiffrer(B, [{ table: 'the', id: 'a', quantite: 1 }], lu, 'FAUX', null);
    expect(non.forme === 'chiffre' && non.panier.remise).toEqual({ code: 'FAUX', refusee: true });
  });
  it('la livraison : payante, offerte à partir de son seuil, rien au retrait', () => {
    const c = (prix: number) => { const x = chiffrer(B, [{ table: 'the', id: 'a', quantite: 1 }], new Map([['the', [the({ id: 'a', prix })]]]), null, undefined); if (x.forme !== 'chiffre') throw new Error(); return x.panier; };
    expect(lePanierMontre(B, c(20), { pays: 'FR', retrait: false }).aPayerCentimes).toBe(2500);
    expect(lePanierMontre(B, c(120), { pays: 'FR', retrait: false }).aPayerCentimes).toBe(12000);
    expect(lePanierMontre(B, c(20), { pays: null, retrait: true }).aPayerCentimes).toBe(2000);
  });
});

describe('la TVA', () => {
  it('le taux d’un article : le sien s’il est légal, sinon le normal ; inconnu : non calculable, jamais 0', () => {
    expect(tauxDeLaLigne(5.5, lesTauxDuPays('FR'))).toBe(5.5);
    expect(tauxDeLaLigne(7, lesTauxDuPays('FR'))).toBeNull();
    expect(tauxDeLaLigne(null, lesTauxDuPays('FR'))).toBe(20);
    expect(tauxDeLaLigne(null, lesTauxDuPays('US'))).toBeNull();
  });
  it('la ventilation par taux, la livraison au prorata ; un vendeur en franchise dit sa mention', () => {
    const v = laVentilation([{ centimes: 1200, quantite: 1, taux: 20 }, { centimes: 1055, quantite: 1, taux: 5.5 }], 500, B.tva, { tvaNonApplicable: 'x' } as never);
    expect(v?.parTaux.reduce((t, x) => t + x.ttcCentimes, 0)).toBe(2755);
    expect(v?.parTaux[0]).toMatchObject({ taux: 20, ttcCentimes: 1200 + 266 });
    expect(laVentilation([{ centimes: 1000, quantite: 1, taux: 20 }], 0, { ...B.tva, assujettie: false }, { tvaNonApplicable: 'x' } as never))
      .toEqual({ parTaux: [], nonApplicable: 'TVA non applicable, art. 293 B du CGI' });
  });
});

describe('ce que l’acheteur saisit', () => {
  it('l’adresse est exigée pour un envoi, vers un pays desservi ; le retrait n’en demande pas', () => {
    const base = { nom: 'Ada Lovelace', courriel: 'ada@exemple.fr' };
    expect(lireLesCoordonnees({ ...base, adresse: { line1: '1 rue', postal_code: '75001', city: 'Paris', country: 'fr' } }, B.livraison)).toMatchObject({ adresse: { country: 'FR' } });
    expect(lireLesCoordonnees({ ...base, adresse: { line1: '1 rue', postal_code: '1', city: 'Rome', country: 'IT' } }, B.livraison)).toBe('acheteur.adresse.country');
    expect(lireLesCoordonnees({ ...base, retrait: true }, B.livraison)).toMatchObject({ retrait: true, adresse: null });
    expect(lireLesCoordonnees({ nom: 'A', courriel: 'x' }, B.livraison)).toBe('acheteur.nom');
  });
  it('le retour du paiement reste une page de ce projet servie par vavi : une autre adresse ramène à l’accueil du site', () => {
    expect(leRetour(`https://vavi.test/s/${P}/panier`, 'https://vavi.test', P, true)).toBe(`https://vavi.test/s/${P}/panier?payment=success`);
    expect(leRetour('https://pirate.test/s/x', 'https://vavi.test', P, false)).toBe(`https://vavi.test/s/${P}/`);
    expect(leRetour(`https://vavi.test/p/autre/`, 'https://vavi.test', P, false)).toBe(`https://vavi.test/s/${P}/`);
  });
});

const signer = (corps: string, secret: string, t = Math.floor(Date.now() / 1000)) => `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${corps}`).digest('hex')}`;

describe('la signature du webhook', () => {
  it('signé par le secret : cru ; autre secret, corps changé, horodatage vieux : refusé ; rotation : une des signatures suffit', () => {
    const corps = '{"id":"evt"}';
    expect(verifierLaSignature(corps, signer(corps, 's1'), 's1')).toEqual({ valide: true });
    expect(verifierLaSignature(corps, signer(corps, 's2'), 's1')).toMatchObject({ valide: false });
    expect(verifierLaSignature(`${corps} `, signer(corps, 's1'), 's1')).toMatchObject({ valide: false });
    expect(verifierLaSignature(corps, signer(corps, 's1', 1_000), 's1')).toMatchObject({ motif: 'horodatage-hors-fenetre' });
    expect(verifierLaSignature(corps, `${signer(corps, 'ancien')},v1=${signer(corps, 's1').split('v1=')[1]}`, 's1')).toEqual({ valide: true });
  });
});

/** Une base et un Stripe joués : ce que la vente appelle, et ce qu'elle en reçoit. */
function unMonde(o: { secret?: boolean } = {}) {
  const appels: { fonction: string; args: Record<string, unknown> }[] = [];
  const sessions: string[] = [];
  const commandes = new Map<string, Record<string, unknown>>();
  const confirmees = new Set<string>();
  const d: DependancesDeLaVente = {
    async rpc(fonction, args) {
      appels.push({ fonction, args });
      if (fonction === 'app_articles_a_vendre') return { data: [the({ id: 'a', prix: 30 })], error: null };
      if (fonction === 'app_ouvrir_une_commande') { commandes.set('c1', { ...args, etat: 'a_payer' }); return { data: 'c1', error: null }; }
      if (fonction === 'app_confirmer_une_vente') {
        const deja = confirmees.has(String(args.p_session));
        confirmees.add(String(args.p_session));
        if (!deja) commandes.get(String(args.p_id))!.etat = 'payee';
        return { data: { deja, etat: 'payee' }, error: null };
      }
      if (fonction === 'app_completer_une_commande') return { data: { vente_lignes: commandes.get('c1')!.p_lignes }, error: null };
      return { data: null, error: null };
    },
    leProjet: async () => ({ lu: true, valeur: { proprietaire: 'proprio', appJson: JSON.stringify(unManifeste(MANIFESTE)) } }),
    leSecret: async (_id, nom) => (o.secret === false ? null : nom === 'STRIPE_SECRET_KEY' ? 'sk_test_x' : 'whsec_x'),
    stripe: async (_url, init) => { sessions.push(init.body); return { ok: true, json: async () => ({ id: 'cs_1', url: 'https://checkout.stripe.test/cs_1' }) }; },
    journal: () => {},
  };
  return { d, appels, sessions, commandes };
}
const ACHETEUR = { nom: 'Ada Lovelace', courriel: 'ada@exemple.fr', adresse: { line1: '1 rue', postal_code: '75001', city: 'Paris', country: 'FR' } };
const evenement = (montant: number, devise = 'eur') => JSON.stringify({ type: 'checkout.session.completed', data: { object: {
  id: 'cs_1', payment_status: 'paid', amount_total: montant, currency: devise, metadata: { vavi_projet: P, vavi_commande: 'c1', vavi_montant: '3500', vavi_devise: 'EUR' } } } });

describe('la vente de bout en bout, contre une base et un Stripe joués', () => {
  it('le panier, puis la commande au prix de la base et la page de paiement de Stripe à ce montant', async () => {
    const m = unMonde();
    const p = await chiffrerLePanier(m.d, P, { lignes: [{ table: 'the', id: 'a', quantite: 1, prix: 0 }], destination: { pays: 'FR' } });
    expect(p.corps).toMatchObject({ aPayerCentimes: 3500, devise: 'EUR' });
    const o = await ouvrirLaVente(m.d, P, { lignes: [{ table: 'the', id: 'a', quantite: 1 }], acheteur: ACHETEUR, successUrl: `https://vavi.test/s/${P}/panier` }, null, 'https://vavi.test');
    expect(o).toEqual({ statut: 200, corps: { url: 'https://checkout.stripe.test/cs_1' } });
    expect(m.appels.find((a) => a.fonction === 'app_ouvrir_une_commande')?.args).toMatchObject({ p_compte: 'proprio', p_montant: 3500, p_livraison: 500, p_mode: 'expedition' });
    const corps = new URLSearchParams(m.sessions[0]);
    expect(corps.get('line_items[0][price_data][unit_amount]')).toBe('3000');
    expect(corps.get('line_items[1][price_data][unit_amount]')).toBe('500');
    expect(corps.get('metadata[vavi_montant]')).toBe('3500');
    expect(corps.get('success_url')).toBe(`https://vavi.test/s/${P}/panier?payment=success`);
  });
  it('sans clé Stripe posée, rien ne s’ouvre et c’est dit ; aucune commande n’est créée', async () => {
    const m = unMonde({ secret: false });
    const o = await ouvrirLaVente(m.d, P, { lignes: [{ table: 'the', id: 'a', quantite: 1 }], acheteur: ACHETEUR }, null, 'https://vavi.test');
    expect(o).toMatchObject({ statut: 503, corps: { code: 'paiement-non-configure' } });
    expect(m.appels.some((a) => a.fonction === 'app_ouvrir_une_commande')).toBe(false);
  });
  it('le webhook signé fait la commande payée une fois ; rejoué, rien ne se refait ; non signé ou sous le montant, rien', async () => {
    const m = unMonde();
    await ouvrirLaVente(m.d, P, { lignes: [{ table: 'the', id: 'a', quantite: 1 }], acheteur: ACHETEUR }, null, 'https://vavi.test');
    expect((await confirmerLaVente(m.d, P, evenement(3500), 't=1,v1=00')).statut).toBe(400);
    expect((await confirmerLaVente(m.d, P, evenement(100), signer(evenement(100), 'whsec_x'))).corps).toMatchObject({ refusee: 'montant' });
    expect(m.commandes.get('c1')!.etat).toBe('a_payer');
    expect((await confirmerLaVente(m.d, P, evenement(3500), signer(evenement(3500), 'whsec_x'))).corps).toEqual({ recu: true, deja: false });
    expect(m.commandes.get('c1')!.etat).toBe('payee');
    expect((await confirmerLaVente(m.d, P, evenement(3500), signer(evenement(3500), 'whsec_x'))).corps).toEqual({ recu: true, deja: true });
    expect(m.appels.filter((a) => a.fonction === 'app_facturer_une_commande')).toHaveLength(1);
  });
  it('la facture ne s’ouvre qu’avec le jeton de la commande', async () => {
    const m = unMonde();
    const jeton = 'j'.repeat(64);
    (m.d as { rpc: DependancesDeLaVente["rpc"] }).rpc = async () => ({ data: { id: 'c1', vente_jeton: jeton, vente_facture: { numero: '2026-000001', emise_le: '2026-11-24T12:00:00Z' }, vente_lignes: [{ libelle: 'Sencha', centimes: 3000, quantite: 1, taux: 20 }],
      vente_montant_centimes: 3500, vente_livraison_centimes: 500, vente_devise: 'EUR', vente_nom: 'Ada <b>', vente_tva: { parTaux: [{ taux: 20, htCentimes: 2917, tvaCentimes: 583, ttcCentimes: 3500 }], nonApplicable: null } }, error: null });
    const html = await lireLaFacture(m.d, P, 'c1', jeton);
    expect(html).toContain('Facture 2026-000001');
    expect(html).toContain('Ada &#60;b&#62;');
    expect(await lireLaFacture(m.d, P, 'c1', 'j'.repeat(63) + 'k')).toBeNull();
  });
});

