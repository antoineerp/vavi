// Repris de constructor-v13@5bb786e : generateur-v2/app/la-commande.ts
/**
 * La commande d'une app qui vend : une table que la plateforme pose elle-même, jamais déclarée dans app.json. Le panier
 * l'ouvre au prix lu en base, le paiement confirmé la fait passer à « payée » (`commande_par_paiement`, appelée par la
 * plateforme seule), puis qui gère la boutique l'expédie, la livre ou l'annule. Ses colonnes `vente_*` sont celles que
 * la vente de la plateforme écrit (`lib/bascule/la-vente.ts`) : lignes, montants, devise, coordonnées, TVA, facture.
 *
 * Elle REMPLACE la transition `par: paiement` qu'une table d'app.json pouvait déclarer : un achat n'a qu'une forme.
 */
import type { Manifeste } from './manifeste';

export const TABLE_DE_LA_COMMANDE = 'commande';
export const TRANSITION_DU_PAIEMENT = 'payer';

/** Les colonnes de la vente, telles que la plateforme les écrit et les relit. */
export const COLONNES_DE_LA_VENTE: ReadonlyArray<{ readonly nom: string; readonly sql: string; readonly ts: string }> = [
  { nom: 'vente_lignes', sql: 'jsonb', ts: 'ReadonlyArray<{ readonly table: string; readonly id: string; readonly libelle: string; readonly centimes: number; readonly quantite: number; readonly taux?: number | null }> | null' },
  { nom: 'vente_montant_centimes', sql: 'integer', ts: 'number | null' },
  { nom: 'vente_livraison_centimes', sql: 'integer', ts: 'number | null' },
  { nom: 'vente_devise', sql: 'text', ts: 'string | null' },
  { nom: 'vente_courriel', sql: 'text', ts: 'string | null' },
  { nom: 'vente_nom', sql: 'text', ts: 'string | null' },
  { nom: 'vente_adresse', sql: 'jsonb', ts: 'Readonly<Record<string, string>> | null' },
  { nom: 'vente_session', sql: 'text', ts: 'string | null' },
  { nom: 'vente_tva', sql: 'jsonb', ts: 'Readonly<{ parTaux: ReadonlyArray<{ taux: number; htCentimes: number; tvaCentimes: number; ttcCentimes: number }>; nonApplicable: string | null }> | null' },
  { nom: 'vente_mode', sql: 'text', ts: "'expedition' | 'retrait' | null" },
  { nom: 'vente_facture', sql: 'jsonb', ts: 'Readonly<{ numero: string; rang: number; emise_le: string }> | null' },
  { nom: 'vente_jeton', sql: 'text', ts: 'string | null' },
];

type Etat = 'a_payer' | 'payee' | 'expediee' | 'livree' | 'annulee';
type Geste = 'payer' | 'expedier' | 'livrer' | 'annuler';
const MOTS: Readonly<Record<string, { readonly libelle: string; readonly etats: Readonly<Record<Etat, string>>; readonly gestes: Readonly<Record<Geste, string>> }>> = {
  fr: { libelle: 'Commandes', etats: { a_payer: 'À payer', payee: 'Payée', expediee: 'Expédiée', livree: 'Livrée', annulee: 'Annulée' },
    gestes: { payer: 'Payer', expedier: 'Marquer expédiée', livrer: 'Marquer livrée', annuler: 'Annuler la commande' } },
  en: { libelle: 'Orders', etats: { a_payer: 'Awaiting payment', payee: 'Paid', expediee: 'Shipped', livree: 'Delivered', annulee: 'Cancelled' },
    gestes: { payer: 'Pay', expedier: 'Mark as shipped', livrer: 'Mark as delivered', annuler: 'Cancel the order' } },
  de: { libelle: 'Bestellungen', etats: { a_payer: 'Zahlung offen', payee: 'Bezahlt', expediee: 'Versandt', livree: 'Zugestellt', annulee: 'Storniert' },
    gestes: { payer: 'Bezahlen', expedier: 'Als versandt markieren', livrer: 'Als zugestellt markieren', annuler: 'Bestellung stornieren' } },
  es: { libelle: 'Pedidos', etats: { a_payer: 'Pendiente de pago', payee: 'Pagado', expediee: 'Enviado', livree: 'Entregado', annulee: 'Cancelado' },
    gestes: { payer: 'Pagar', expedier: 'Marcar como enviado', livrer: 'Marcar como entregado', annuler: 'Cancelar el pedido' } },
  it: { libelle: 'Ordini', etats: { a_payer: 'Da pagare', payee: 'Pagato', expediee: 'Spedito', livree: 'Consegnato', annulee: 'Annullato' },
    gestes: { payer: 'Paga', expedier: 'Segna come spedito', livrer: 'Segna come consegnato', annuler: 'Annulla l’ordine' } },
  nl: { libelle: 'Bestellingen', etats: { a_payer: 'Te betalen', payee: 'Betaald', expediee: 'Verzonden', livree: 'Bezorgd', annulee: 'Geannuleerd' },
    gestes: { payer: 'Betalen', expedier: 'Markeren als verzonden', livrer: 'Markeren als bezorgd', annuler: 'Bestelling annuleren' } },
  pt: { libelle: 'Encomendas', etats: { a_payer: 'Por pagar', payee: 'Paga', expediee: 'Enviada', livree: 'Entregue', annulee: 'Cancelada' },
    gestes: { payer: 'Pagar', expedier: 'Marcar como enviada', livrer: 'Marcar como entregue', annuler: 'Cancelar a encomenda' } },
};

export type TableDeLaBase = Manifeste['tables'][number];

/**
 * La table `commande` d'une app à panier, dans la forme des tables d'app.json : la base, les types et l'app la lisent
 * comme les autres. Ses lignes sont à qui a commandé ; qui gère la boutique les voit toutes ; aucun compte ne les écrit.
 * Le geste `payer` n'est fait par aucun rôle : seul le paiement confirmé le fait. `null` : l'app ne vend pas.
 */
export function laCommande(m: Manifeste): TableDeLaBase | null {
  if (!m.fonctions.panier) return null;
  const mots = MOTS[m.langues.principale] ?? MOTS.fr!;
  const gerants = m.roles.filter((r) => r.obtenu === 'proprietaire').map((r) => r.nom);
  const geste = (nom: Geste, de: Etat[], vers: Etat, par: string[]) => ({ nom, libelle: mots.gestes[nom], de, vers, par });
  return {
    nom: TABLE_DE_LA_COMMANDE, libelle: mots.libelle, appartenance: 'personnelle',
    lecture: m.roles.map((r) => r.nom), ecriture: [], champs: [], propositions: false, contenu: false, exemples: [],
    cycle: {
      etats: ['a_payer', 'payee', 'expediee', 'livree', 'annulee'], libelles: mots.etats, initial: 'a_payer',
      transitions: [
        geste(TRANSITION_DU_PAIEMENT, ['a_payer'], 'payee', []),
        geste('expedier', ['payee'], 'expediee', gerants),
        geste('livrer', ['expediee'], 'livree', gerants),
        geste('annuler', ['a_payer', 'payee'], 'annulee', gerants),
      ],
    },
  };
}

/** Les tables que la base pose : celles d'app.json, puis la commande d'une app qui vend. */
export function tablesDeLaBase(m: Manifeste): TableDeLaBase[] {
  const c = laCommande(m);
  return c ? [...m.tables, c] : [...m.tables];
}
