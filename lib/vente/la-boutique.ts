// Repris de constructor-v13@5bb786e : lib/bascule/la-vente.ts (`LaBoutique`) et lib/bascule/la-voie-d.ts (`laBoutiqueDeLaVoieD`)
/**
 * LA BOUTIQUE D'UNE APP — ce que la vente lit d'app.json, et rien d'autre : les tables dont les lignes se vendent (le
 * champ du prix, du libellé, du stock, du taux, du poids, des variantes), le pays et la devise du vendeur, son régime de
 * TVA, la livraison, les codes de remise, la langue des mots que la plateforme écrit (récapitulatif, facture). PUR.
 *
 * Ce qu'elle remplace : la boutique de constructor-v13, relue de quatre fichiers de l'arbre (schéma, livraison, TVA,
 * identité) selon la voie qui avait généré l'app. Ici, une seule source : app.json, déjà validé à son entrée.
 */
import type { Manifeste } from '@/lib/backend/app/manifeste';
import { lesTauxDuPays, type TauxDUnPays } from './les-taux-de-tva';

export interface Article {
  readonly table: string; readonly prix: string; readonly libelle: string;
  readonly stock?: string; readonly tva?: string; readonly poids?: string; readonly options?: string;
}
export interface Livraison {
  /** Les pays où les articles s'envoient ; vide : rien ne s'envoie. */
  readonly pays: readonly string[];
  readonly fraisCentimes: number;
  readonly offerteDesCentimes: number | null;
  /** L'adresse du retrait sur place ; `null` : pas de retrait. */
  readonly retrait: string | null;
}
export interface Remise {
  readonly table: string; readonly code: string; readonly pourcentage?: string; readonly montant?: string; readonly actif?: string; readonly fin?: string;
}
export interface RegimeDeTva { readonly assujettie: boolean; readonly taux: TauxDUnPays | null }
export interface Boutique {
  readonly articles: ReadonlyMap<string, Article>;
  readonly pays: string; readonly devise: string; readonly tva: RegimeDeTva; readonly livraison: Livraison;
  readonly remise: Remise | null; readonly langue: string;
  /** Le vendeur, tel que la facture le dit : le nom légal de l'éditeur, sinon celui de l'app. */
  readonly vendeur: readonly string[];
}

const centimes = (n: number): number => Math.round(n * 100);

/** La boutique d'une app à panier ; `null` : l'app ne vend pas. */
export function laBoutique(m: Manifeste): Boutique | null {
  if (!m.fonctions.panier || !m.vente) return null;
  const v = m.vente;
  const articles = new Map<string, Article>();
  for (const t of m.tables) if (t.vente) articles.set(t.nom, { table: t.nom, ...t.vente });
  const e = m.editeur;
  return {
    articles, pays: v.pays, devise: v.devise, langue: m.langues.principale,
    tva: { assujettie: v.tva === 'assujettie', taux: lesTauxDuPays(v.pays) },
    livraison: { pays: v.livraison.pays, fraisCentimes: centimes(v.livraison.prix),
      offerteDesCentimes: v.livraison.offerteDes === null ? null : centimes(v.livraison.offerteDes), retrait: v.livraison.retrait },
    remise: v.remise ?? null,
    vendeur: [e?.nom ?? m.nom, e?.adresse, e?.immatriculation, e?.courriel, e?.telephone].filter((x): x is string => Boolean(x)),
  };
}

/** Les mots que la plateforme écrit pour la vente : le récapitulatif du panier et la facture, dans la langue de l'app. */
export interface MotsDeLaVente {
  readonly sousTotal: string; readonly livraison: string; readonly offerte: string; readonly retrait: string; readonly total: string;
  readonly dontTva: string; readonly tvaNonCalculable: string; readonly tvaNonApplicable: string;
  readonly remise: string; readonly remiseRefusee: string;
  readonly facture: string; readonly emiseLe: string; readonly vendeur: string; readonly factureA: string;
  readonly article: string; readonly quantite: string; readonly prixUnitaire: string; readonly taux: string; readonly montant: string;
  readonly horsTaxe: string; readonly tva: string; readonly ttc: string;
}
const MOTS: Readonly<Record<string, MotsDeLaVente>> = {
  fr: { sousTotal: 'Sous-total', livraison: 'Livraison', offerte: 'Offerte', retrait: 'Retrait sur place', total: 'Total', dontTva: 'dont TVA {taux} %',
    tvaNonCalculable: 'TVA non calculable', tvaNonApplicable: 'TVA non applicable', remise: 'Remise « {code} »', remiseRefusee: 'Le code « {code} » ne vaut pas',
    facture: 'Facture', emiseLe: 'Émise le', vendeur: 'Vendeur', factureA: 'Facturé à', article: 'Article', quantite: 'Quantité', prixUnitaire: 'Prix unitaire TTC',
    taux: 'TVA', montant: 'Montant TTC', horsTaxe: 'Hors taxes', tva: 'TVA', ttc: 'TTC' },
  en: { sousTotal: 'Subtotal', livraison: 'Shipping', offerte: 'Free', retrait: 'Pickup', total: 'Total', dontTva: 'incl. VAT {taux} %',
    tvaNonCalculable: 'VAT not computable', tvaNonApplicable: 'VAT not applicable', remise: 'Discount “{code}”', remiseRefusee: 'The code “{code}” is not valid',
    facture: 'Invoice', emiseLe: 'Issued on', vendeur: 'Seller', factureA: 'Billed to', article: 'Item', quantite: 'Quantity', prixUnitaire: 'Unit price incl. VAT',
    taux: 'VAT', montant: 'Amount incl. VAT', horsTaxe: 'Excl. VAT', tva: 'VAT', ttc: 'Incl. VAT' },
  de: { sousTotal: 'Zwischensumme', livraison: 'Versand', offerte: 'Kostenlos', retrait: 'Abholung', total: 'Gesamt', dontTva: 'inkl. MwSt. {taux} %',
    tvaNonCalculable: 'MwSt. nicht berechenbar', tvaNonApplicable: 'Keine MwSt.', remise: 'Rabatt „{code}“', remiseRefusee: 'Der Code „{code}“ ist nicht gültig',
    facture: 'Rechnung', emiseLe: 'Ausgestellt am', vendeur: 'Verkäufer', factureA: 'Rechnung an', article: 'Artikel', quantite: 'Menge', prixUnitaire: 'Einzelpreis inkl. MwSt.',
    taux: 'MwSt.', montant: 'Betrag inkl. MwSt.', horsTaxe: 'Netto', tva: 'MwSt.', ttc: 'Brutto' },
  es: { sousTotal: 'Subtotal', livraison: 'Envío', offerte: 'Gratis', retrait: 'Recogida en tienda', total: 'Total', dontTva: 'IVA {taux} % incluido',
    tvaNonCalculable: 'IVA no calculable', tvaNonApplicable: 'IVA no aplicable', remise: 'Descuento «{code}»', remiseRefusee: 'El código «{code}» no es válido',
    facture: 'Factura', emiseLe: 'Emitida el', vendeur: 'Vendedor', factureA: 'Facturado a', article: 'Artículo', quantite: 'Cantidad', prixUnitaire: 'Precio unitario con IVA',
    taux: 'IVA', montant: 'Importe con IVA', horsTaxe: 'Base imponible', tva: 'IVA', ttc: 'Total con IVA' },
  it: { sousTotal: 'Subtotale', livraison: 'Spedizione', offerte: 'Gratuita', retrait: 'Ritiro in sede', total: 'Totale', dontTva: 'di cui IVA {taux} %',
    tvaNonCalculable: 'IVA non calcolabile', tvaNonApplicable: 'IVA non applicabile', remise: 'Sconto «{code}»', remiseRefusee: 'Il codice «{code}» non è valido',
    facture: 'Fattura', emiseLe: 'Emessa il', vendeur: 'Venditore', factureA: 'Intestata a', article: 'Articolo', quantite: 'Quantità', prixUnitaire: 'Prezzo unitario IVA inclusa',
    taux: 'IVA', montant: 'Importo IVA inclusa', horsTaxe: 'Imponibile', tva: 'IVA', ttc: 'IVA inclusa' },
  nl: { sousTotal: 'Subtotaal', livraison: 'Verzending', offerte: 'Gratis', retrait: 'Afhalen', total: 'Totaal', dontTva: 'incl. btw {taux} %',
    tvaNonCalculable: 'Btw niet berekenbaar', tvaNonApplicable: 'Btw niet van toepassing', remise: 'Korting „{code}”', remiseRefusee: 'De code „{code}” is niet geldig',
    facture: 'Factuur', emiseLe: 'Uitgegeven op', vendeur: 'Verkoper', factureA: 'Gefactureerd aan', article: 'Artikel', quantite: 'Aantal', prixUnitaire: 'Stukprijs incl. btw',
    taux: 'Btw', montant: 'Bedrag incl. btw', horsTaxe: 'Excl. btw', tva: 'Btw', ttc: 'Incl. btw' },
  pt: { sousTotal: 'Subtotal', livraison: 'Envio', offerte: 'Grátis', retrait: 'Levantamento no local', total: 'Total', dontTva: 'IVA {taux} % incluído',
    tvaNonCalculable: 'IVA não calculável', tvaNonApplicable: 'IVA não aplicável', remise: 'Desconto «{code}»', remiseRefusee: 'O código «{code}» não é válido',
    facture: 'Fatura', emiseLe: 'Emitida em', vendeur: 'Vendedor', factureA: 'Faturado a', article: 'Artigo', quantite: 'Quantidade', prixUnitaire: 'Preço unitário com IVA',
    taux: 'IVA', montant: 'Montante com IVA', horsTaxe: 'Sem IVA', tva: 'IVA', ttc: 'Com IVA' },
};

/** Les mots d'une langue ; une langue que la plateforme n'écrit pas encore : l'anglais. */
export const lesMots = (langue: string): MotsDeLaVente => MOTS[langue] ?? MOTS.en!;
