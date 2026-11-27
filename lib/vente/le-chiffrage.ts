// Repris de constructor-v13@5bb786e : lib/bascule/la-vente.ts (lecture du panier, livraison, remise) et lib/bascule/la-facture.ts (TVA)
/**
 * LE CHIFFRAGE D'UN PANIER — PUR. Le navigateur n'envoie que des lignes (table, identifiant, quantité, variante) ; le prix,
 * le libellé, le stock, le taux et le poids de chaque ligne sont ceux que la BASE porte (`lesLignesLues`, lues par la
 * plateforme). Ici : relire ce que le navigateur envoie, chiffrer contre la base, la livraison selon la destination, la
 * remise d'un code, la ventilation de la TVA, et le récapitulatif que le panier de l'app montre tel quel.
 *
 * Ce qu'il remplace (l'incident « L'Atelier du Cuir Cousu » de constructor-v13) : l'app envoyait le prix de chaque article
 * à la page de paiement ; un visiteur payait ce qu'il voulait.
 */
import type { Boutique, Livraison, MotsDeLaVente, RegimeDeTva } from './la-boutique';
import { lesMots } from './la-boutique';
import type { TauxDUnPays } from './les-taux-de-tva';

export const LIGNES_AU_PLUS = 50;
export const QUANTITE_AU_PLUS = 99;
const IDENTIFIANT = /^[a-z_][a-z0-9_]{0,62}$/;

export interface LigneAchetee { readonly table: string; readonly id: string; readonly quantite: number; readonly option?: string }
export interface Refus { readonly forme: 'refus'; readonly statut: number; readonly raison: string }
const refus = (statut: number, raison: string): Refus => ({ forme: 'refus', statut, raison });

/** Ce que le navigateur envoie, RELU : des lignes nommées, des quantités entières bornées. `string` : le refus. */
export function lireLesLignes(brut: unknown): LigneAchetee[] | string {
  if (!Array.isArray(brut) || brut.length === 0) return 'lignes : at least one item (table, id, quantite)';
  if (brut.length > LIGNES_AU_PLUS) return `lignes : at most ${LIGNES_AU_PLUS} items`;
  const lignes: LigneAchetee[] = [];
  for (const [i, x] of brut.entries()) {
    const l = (x ?? {}) as Record<string, unknown>;
    const quantite = Number(l.quantite ?? 1);
    if (typeof l.table !== 'string' || !IDENTIFIANT.test(l.table) || typeof l.id !== 'string' || l.id.length === 0 || l.id.length > 64) return `lignes[${i}] : { table, id, quantite }`;
    if (!Number.isInteger(quantite) || quantite < 1 || quantite > QUANTITE_AU_PLUS) return `lignes[${i}].quantite : an integer from 1 to ${QUANTITE_AU_PLUS}`;
    const option = typeof l.option === 'string' ? l.option.trim().slice(0, 80) : '';
    lignes.push({ table: l.table, id: l.id, quantite, ...(option ? { option } : {}) });
  }
  return lignes;
}

/** Le code de remise saisi : un texte court ; le reste est tu. */
export const lireLeCode = (brut: unknown): string | null => {
  const c = typeof brut === 'string' ? brut.trim() : '';
  return c.length > 0 && c.length <= 60 ? c : null;
};

/** Les variantes d'un article, lues dans son champ texte : séparées par des virgules (ou une liste JSON). */
export function lesOptions(brut: string | null | undefined): string[] {
  const t = (brut ?? '').trim();
  let liste: unknown = null;
  try { liste = t.startsWith('[') ? JSON.parse(t) : null; } catch { liste = null; }
  return [...new Set((Array.isArray(liste) ? liste.map(String) : t.split(/[,;\n]/)).map((v) => v.trim()).filter(Boolean))];
}

export interface Destination { readonly pays: string | null; readonly retrait: boolean }
export const SANS_DESTINATION: Destination = { pays: null, retrait: false };
/** La destination que le panier envoie : un pays desservi, ou le retrait s'il est offert ; le reste est tu. */
export function laDestination(brut: unknown, l: Livraison): Destination {
  const o = (brut && typeof brut === 'object' ? brut : {}) as Record<string, unknown>;
  const pays = typeof o.pays === 'string' ? o.pays.trim().toUpperCase() : '';
  return { pays: l.pays.includes(pays) ? pays : null, retrait: o.retrait === true && l.retrait !== null };
}

/** Le colis : la somme des poids des articles, en kg ; `sansPoids` : le premier article dont la base ne dit pas le poids. */
export interface Colis { readonly poidsKg: number; readonly sansPoids: string | null }
export const COLIS_VIDE: Colis = { poidsKg: 0, sansPoids: null };
/** L'envoi : son prix et sa zone, ou pourquoi aucune zone ne le prend (le panier le dit, le paiement le refuse). */
export type Envoi = { readonly centimes: number; readonly zone: string | null } | { readonly impossible: string; readonly zone: string };

const kg = (n: number): string => String(Math.round(n * 1000) / 1000);
/**
 * Les frais d'envoi : rien sans envoi, au retrait, ou à partir du montant où il est offert (celui de la zone) ; sinon le
 * prix de la zone du pays, par la première tranche qui contient le poids du colis ; un pays hors zone : le prix de la
 * livraison. Un article sans poids, un colis plus lourd que la dernière tranche : l'envoi est impossible, et dit.
 */
export function lEnvoi(l: Livraison, articlesCentimes: number, d: Destination, colis: Colis, mots: MotsDeLaVente): Envoi {
  const z = d.pays && !d.retrait ? l.zones.find((x) => x.pays.includes(d.pays!)) : undefined;
  const zone = z?.nom ?? null;
  const offerte = z ? z.offerteDesCentimes : l.offerteDesCentimes;
  if (l.pays.length === 0 || d.retrait || (offerte !== null && articlesCentimes >= offerte)) return { centimes: 0, zone };
  if (!z || z.tranches.length === 0) return { centimes: Math.max(0, z ? z.fraisCentimes : l.fraisCentimes), zone };
  if (colis.sansPoids !== null) return { impossible: mots.sansPoids.replace('{article}', colis.sansPoids), zone: z.nom };
  const t = z.tranches.find((x) => colis.poidsKg <= x.jusquaKg + 1e-9);
  if (!t) return { impossible: mots.tropLourd.replace('{poids}', kg(colis.poidsKg)).replace('{zone}', z.nom).replace('{max}', kg(z.tranches[z.tranches.length - 1]!.jusquaKg)), zone: z.nom };
  return { centimes: Math.max(0, t.fraisCentimes), zone: z.nom };
}

export interface Coordonnees {
  readonly nom: string; readonly courriel: string; readonly retrait: boolean;
  readonly adresse: Readonly<Record<string, string>> | null;
}
const UN_COURRIEL = /^[^\s@<>()[\]\\,;:"]{1,64}@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:".]{2,}$/;
const UN_TELEPHONE = /^\+?[0-9 ().-]{6,30}$/;
/** Les coordonnées de qui achète, saisies dans l'app : l'adresse n'est exigée que pour un envoi, vers un pays desservi. `string` : le champ refusé. */
export function lireLesCoordonnees(brut: unknown, l: Livraison): Coordonnees | string {
  const objet = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {});
  const o = objet(brut), a = objet(o.adresse);
  const lu = (v: unknown): string => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : '');
  const nom = lu(o.nom), courriel = lu(o.courriel).toLowerCase(), telephone = lu(o.telephone);
  if (nom.length < 2 || nom.length > 120) return 'acheteur.nom';
  if (courriel.length > 254 || !UN_COURRIEL.test(courriel)) return 'acheteur.courriel';
  if (telephone && !UN_TELEPHONE.test(telephone)) return 'acheteur.telephone';
  const tel: Record<string, string> = telephone ? { telephone } : {};
  const retrait = o.retrait === true;
  if (retrait && l.retrait === null) return 'acheteur.retrait';
  if (l.pays.length === 0 || retrait) return { nom, courriel, retrait, adresse: telephone ? tel : null };
  const champs = { line1: lu(a.line1), line2: lu(a.line2), postal_code: lu(a.postal_code), city: lu(a.city), country: lu(a.country).toUpperCase() };
  for (const k of ['line1', 'postal_code', 'city'] as const) if (!champs[k] || champs[k].length > 200) return `acheteur.adresse.${k}`;
  if (!l.pays.includes(champs.country)) return 'acheteur.adresse.country';
  return { nom, courriel, retrait: false, adresse: { ...Object.fromEntries(Object.entries(champs).filter(([, v]) => v)), ...tel } };
}

/** Le taux d'un article : le sien s'il est un taux que la loi de son pays connaît (0 : exonéré), sinon le normal ; `null` : inconnu. */
export function tauxDeLaLigne(valeur: unknown, taux: TauxDUnPays | null): number | null {
  const v = typeof valeur === 'string' && valeur.trim() !== '' ? Number(valeur.replace(',', '.')) : valeur;
  if (typeof v !== 'number' || !Number.isFinite(v)) return taux?.normal ?? null;
  if (!taux) return v >= 0 && v < 100 ? v : null;
  return [0, taux.normal, ...taux.reduits].includes(v) ? v : null;
}

export interface Ventilation {
  readonly parTaux: ReadonlyArray<{ readonly taux: number; readonly htCentimes: number; readonly tvaCentimes: number; readonly ttcCentimes: number }>;
  /** Vendeur en franchise : sa mention ; assujetti : `null`. */
  readonly nonApplicable: string | null;
}
/** HT, TVA et TTC par taux, depuis des prix TTC ; la livraison suit les articles au prorata. `null` : un taux inconnu, non calculable. */
export function laVentilation(lignes: ReadonlyArray<{ readonly centimes: number; readonly quantite: number; readonly taux: number | null }>,
  livraisonCentimes: number, regime: RegimeDeTva, mots: MotsDeLaVente): Ventilation | null {
  if (!regime.assujettie) return { parTaux: [], nonApplicable: regime.taux?.franchise ?? mots.tvaNonApplicable };
  if (lignes.length === 0 || lignes.some((l) => l.taux === null)) return null;
  const parTaux = new Map<number, number>();
  for (const l of lignes) parTaux.set(l.taux!, (parTaux.get(l.taux!) ?? 0) + l.centimes * l.quantite);
  const articles = [...parTaux.values()].reduce((a, b) => a + b, 0);
  const ordre = [...parTaux.keys()].sort((a, b) => b - a);
  let reste = livraisonCentimes;
  return { nonApplicable: null, parTaux: ordre.map((taux, i) => {
    const part = i === ordre.length - 1 ? reste : articles > 0 ? Math.round((livraisonCentimes * parTaux.get(taux)!) / articles) : 0;
    reste -= part;
    const ttc = parTaux.get(taux)! + part;
    const ht = Math.round((ttc * 100) / (100 + taux));
    return { taux, htCentimes: ht, tvaCentimes: ttc - ht, ttcCentimes: ttc };
  }) };
}

/** Ce qu'un code retire : un pourcentage des articles, ou un montant ; `null` quand il viderait le panier. */
export function ceQueRetireLeCode(articlesCentimes: number, r: { readonly pourcentage: number | null; readonly montant: number | null }): number | null {
  const c = r.pourcentage !== null ? Math.round(articlesCentimes * r.pourcentage / 100) : r.montant !== null ? Math.round(r.montant * 100) : NaN;
  return Number.isFinite(c) && c > 0 && c < articlesCentimes ? c : null;
}

/** Une ligne d'article telle que la base la rend (`app_articles_a_vendre`). */
export interface ArticleLu { readonly id: string; readonly prix: unknown; readonly libelle: unknown; readonly stock: unknown; readonly tva: unknown; readonly poids: unknown; readonly options: unknown }
export interface LigneChiffree { readonly table: string; readonly id: string; readonly libelle: string; readonly centimes: number; readonly quantite: number; readonly taux: number | null; readonly option?: string }
export interface Panier {
  readonly lignes: readonly LigneChiffree[]; readonly articlesCentimes: number; readonly devise: string;
  readonly remise: { readonly code: string; readonly centimes: number } | { readonly code: string; readonly refusee: true } | null;
  /** Les lignes dont l'article n'existe plus en base : le panier les retire et le dit ; le paiement les refuse. */
  readonly retirees: readonly LigneAchetee[];
  /** Le poids du colis, lu en base comme le prix. */
  readonly colis: Colis;
}

const nombre = (v: unknown): number | null => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

/**
 * Chiffrer les lignes contre la base. `lues` : les articles lus, par table ; `remise` : la ligne du code lue en base
 * (`undefined` : aucun code saisi ; `null` : aucun code ne vaut).
 */
export function chiffrer(b: Boutique, lignes: readonly LigneAchetee[], lues: ReadonlyMap<string, readonly ArticleLu[]>,
  code: string | null, remise: { readonly pourcentage: unknown; readonly montant: unknown } | null | undefined): { readonly forme: 'chiffre'; readonly panier: Panier } | Refus {
  const fr = b.langue === 'fr';
  const chiffrees: LigneChiffree[] = [], retirees: LigneAchetee[] = [];
  let poidsKg = 0, sansPoids: string | null = null;
  for (const l of lignes) {
    if (!b.articles.has(l.table)) return refus(400, fr ? `« ${l.table} » ne se vend pas.` : `“${l.table}” is not for sale.`);
    const r = lues.get(l.table)?.find((x) => String(x.id) === l.id);
    if (!r) { retirees.push(l); continue; }
    const libelle = typeof r.libelle === 'string' && r.libelle ? r.libelle : l.table;
    const prix = nombre(r.prix);
    const centimes = prix === null ? NaN : Math.round(prix * 100);
    if (!Number.isFinite(centimes) || centimes <= 0) return refus(409, fr ? `« ${libelle} » n'a pas encore de prix.` : `“${libelle}” has no price yet.`);
    const stock = nombre(r.stock);
    if (stock !== null && l.quantite > stock) {
      return refus(409, stock <= 0 ? (fr ? `« ${libelle} » n'est plus disponible.` : `“${libelle}” is no longer available.`)
        : (fr ? `« ${libelle} » : il n'en reste que ${stock}.` : `“${libelle}”: only ${stock} left.`));
    }
    const proposees = lesOptions(typeof r.options === 'string' ? r.options : null);
    if (proposees.length > 0 && (!l.option || !proposees.includes(l.option))) {
      return refus(409, fr ? `« ${libelle} » : choisissez une option (${proposees.join(', ')}).` : `“${libelle}”: choose an option (${proposees.join(', ')}).`);
    }
    if (b.articles.get(l.table)!.poids) {
      const p = nombre(r.poids);
      if (p === null || p < 0) sansPoids ??= libelle; else poidsKg += p * l.quantite;
    }
    chiffrees.push({ table: l.table, id: l.id, libelle: `${libelle}${l.option && proposees.length > 0 ? ` — ${l.option}` : ''}`.slice(0, 250), centimes,
      quantite: l.quantite, taux: b.tva.assujettie ? tauxDeLaLigne(r.tva, b.tva.taux) : null, ...(l.option && proposees.length > 0 ? { option: l.option } : {}) });
  }
  const articlesCentimes = chiffrees.reduce((t, l) => t + l.centimes * l.quantite, 0);
  let laRemise: Panier['remise'] = null;
  if (code && b.remise && remise !== undefined) {
    const c = remise === null ? null : ceQueRetireLeCode(articlesCentimes, { pourcentage: nombre(remise.pourcentage), montant: nombre(remise.montant) });
    laRemise = c === null ? { code, refusee: true } : { code, centimes: c };
  }
  return { forme: 'chiffre', panier: { lignes: chiffrees, articlesCentimes, devise: b.devise, remise: laRemise, retirees, colis: { poidsKg, sansPoids } } };
}

/** Les articles au prix réellement payé : la remise répartie en proportion, pour que la TVA de chaque taux porte le vrai prix. */
export function lesLignesRemisees(p: Panier): readonly LigneChiffree[] {
  if (!p.remise || !('centimes' in p.remise) || p.articlesCentimes <= 0) return p.lignes;
  const reste = (p.articlesCentimes - p.remise.centimes) / p.articlesCentimes;
  return p.lignes.map((l) => ({ ...l, centimes: Math.max(1, Math.round(l.centimes * reste)) }));
}

/** Ce que la page de paiement porte : chaque article, l'envoi, le montant, la ventilation. */
export function lesArticlesAPayer(b: Boutique, p: Panier, d: Destination) {
  const lignes = lesLignesRemisees(p);
  const articles = lignes.reduce((t, l) => t + l.centimes * l.quantite, 0);
  const mots = lesMots(b.langue);
  const envoi = lEnvoi(b.livraison, articles, d, p.colis, mots);
  const frais = 'centimes' in envoi ? envoi.centimes : 0;
  const libelle = envoi.zone ? `${mots.livraison} (${envoi.zone})` : mots.livraison;
  const items = [...lignes.map((l) => ({ libelle: l.libelle, centimes: l.centimes, quantite: l.quantite })),
    ...(frais > 0 ? [{ libelle, centimes: frais, quantite: 1 }] : [])];
  return { lignes, items, frais, envoi, libelleDeLEnvoi: libelle, montant: articles + frais, remise: p.articlesCentimes - articles, tva: laVentilation(lignes, frais, b.tva, mots) };
}

export interface LigneDuRecapitulatif { readonly libelle: string; readonly centimes?: number | null; readonly texte?: string; readonly total?: boolean }

/** Ce que le panier de l'app montre (`squelette/gabarit/src/lib/panier.ts`, `PanierChiffre`) : les lignes, l'envoi, le montant à payer, le récapitulatif écrit. */
export function lePanierMontre(b: Boutique, p: Panier, d: Destination) {
  const { frais, montant, tva, remise, envoi, libelleDeLEnvoi } = lesArticlesAPayer(b, p, d);
  const M = lesMots(b.langue);
  const expedie = b.livraison.pays.length > 0;
  const recapitulatif: LigneDuRecapitulatif[] = [
    { libelle: M.sousTotal, centimes: p.articlesCentimes },
    ...(!p.remise ? [] : 'refusee' in p.remise ? [{ libelle: M.remiseRefusee.replace('{code}', p.remise.code), texte: '' }]
      : [{ libelle: M.remise.replace('{code}', p.remise.code), centimes: -remise }]),
    ...(d.retrait ? [{ libelle: M.retrait, texte: M.offerte }] : !expedie ? [] : 'impossible' in envoi ? [{ libelle: libelleDeLEnvoi, texte: envoi.impossible }]
      : [frais > 0 ? { libelle: libelleDeLEnvoi, centimes: frais } : { libelle: libelleDeLEnvoi, texte: M.offerte }]),
    { libelle: M.total, centimes: montant, total: true },
    ...(tva === null ? [{ libelle: M.tvaNonCalculable, centimes: null }] : tva.nonApplicable !== null ? [{ libelle: tva.nonApplicable }]
      : tva.parTaux.map((t) => ({ libelle: M.dontTva.replace('{taux}', String(t.taux)), centimes: t.tvaCentimes }))),
  ];
  return {
    lignes: p.lignes.map(({ taux: _taux, ...l }) => l), devise: p.devise, retirees: p.retirees,
    livraison: { adresse: expedie, pays: b.livraison.pays, centimes: frais, retrait: b.livraison.retrait, ...('impossible' in envoi ? { impossible: envoi.impossible } : {}) },
    aPayerCentimes: montant, recapitulatif,
  };
}
