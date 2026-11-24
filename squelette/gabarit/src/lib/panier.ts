/**
 * Le panier d'une app qui vend : ses lignes (la table de l'article, son identifiant, la quantité), gardées dans ce
 * navigateur. Rien d'autre n'y vit : le libellé et le prix de chaque ligne sont lus en base par la plateforme
 * (`chiffrerLePanier`), qui ouvre seule le paiement. Un prix ne part jamais d'ici.
 */
import { useSyncExternalStore } from 'react';
import { appelerLaPlateforme } from './plateforme';
import { pageCourante } from './mesure';
import { cleDeLApp } from './env';
import type { Resultat } from './resultat';

/** `option` : la variante choisie, quand l'article se décline (`vente.options`) ; deux variantes font deux lignes. */
export interface LigneDuPanier { readonly table: string; readonly id: string; readonly quantite: number; readonly option?: string }

const CLE = cleDeLApp('panier');
const QUANTITE_MAX = 99;
let lignes: readonly LigneDuPanier[] = lire();
const abonnes = new Set<() => void>();

function lire(): readonly LigneDuPanier[] {
  try {
    const brut = JSON.parse(localStorage.getItem(CLE) ?? '[]') as unknown;
    return Array.isArray(brut) ? brut.filter((l): l is LigneDuPanier => typeof l?.table === 'string' && typeof l?.id === 'string'
      && Number.isInteger(l?.quantite) && l.quantite > 0 && (l.option === undefined || typeof l.option === 'string')) : [];
  } catch { return []; }
}

function poser(suivantes: readonly LigneDuPanier[]): void {
  lignes = suivantes.filter((l) => l.quantite > 0).map((l) => ({ ...l, quantite: Math.min(QUANTITE_MAX, l.quantite) }));
  try { localStorage.setItem(CLE, JSON.stringify(lignes)); } catch { /* navigation privée : le panier vit le temps de la page */ }
  for (const a of abonnes) a();
}

const meme = (l: LigneDuPanier, table: string, id: string, option?: string): boolean => l.table === table && l.id === id && l.option === option;

export const panier = {
  ajouter(table: string, id: string, quantite = 1, option?: string): void {
    poser(lignes.some((l) => meme(l, table, id, option)) ? lignes.map((l) => (meme(l, table, id, option) ? { ...l, quantite: l.quantite + quantite } : l))
      : [...lignes, { table, id, quantite, ...(option ? { option } : {}) }]);
  },
  changer(table: string, id: string, quantite: number, option?: string): void { poser(lignes.map((l) => (meme(l, table, id, option) ? { ...l, quantite } : l))); },
  retirer(table: string, id: string, option?: string): void { poser(lignes.filter((l) => !meme(l, table, id, option))); },
  vider(): void { poser([]); },
};

/** Les lignes du panier, à jour dans chaque composant qui les lit. */
export function usePanier(): readonly LigneDuPanier[] {
  return useSyncExternalStore((a) => { abonnes.add(a); return () => abonnes.delete(a); }, () => lignes, () => lignes);
}

/** Une ligne du récapitulatif : un montant, ou un texte (« Offerte »), comme la plateforme l'écrit. */
export interface LigneDuRecapitulatif { readonly libelle: string; readonly centimes?: number | null; readonly texte?: string; readonly total?: boolean }
/** Le panier chiffré par la plateforme : chaque ligne au prix de la base, la livraison, ce qui sera payé. */
export interface PanierChiffre {
  /** Les lignes dont l'article n'existe plus en base : la page les retire du panier, et le dit. */
  readonly retirees?: readonly LigneDuPanier[];
  readonly lignes: ReadonlyArray<{ readonly table: string; readonly id: string; readonly libelle: string; readonly centimes: number; readonly quantite: number; readonly option?: string }>;
  readonly devise: string;
  readonly livraison: { readonly adresse: boolean; readonly pays: readonly string[]; readonly centimes: number; readonly retrait: string | null };
  readonly aPayerCentimes: number;
  readonly recapitulatif: readonly LigneDuRecapitulatif[];
}
export interface Destination { readonly pays: string | null; readonly retrait: boolean }

export const chiffrer = (l: readonly LigneDuPanier[], destination: Destination, code: string): Promise<Resultat<PanierChiffre>> =>
  appelerLaPlateforme<PanierChiffre>('pay/<projet>/panier', { lignes: l, destination, ...(code ? { code } : {}) });

/** Les coordonnées de qui achète, telles que la plateforme les relit (`lireLesCoordonnees`). */
export interface Acheteur {
  readonly nom: string; readonly courriel: string; readonly telephone?: string; readonly retrait?: boolean;
  readonly adresse?: { readonly line1: string; readonly line2?: string; readonly postal_code: string; readonly city: string; readonly country: string };
}

/** Ouvre le paiement : la plateforme crée la commande au prix de la base et rend l'adresse de la page de paiement ; `page` relie le paiement à la visite. */
export const payer = (l: readonly LigneDuPanier[], acheteur: Acheteur, retour: string, code: string): Promise<Resultat<{ readonly url: string }>> =>
  appelerLaPlateforme<{ readonly url: string }>('pay/<projet>/checkout', { lignes: l, acheteur, successUrl: retour, cancelUrl: retour, page: pageCourante(), ...(code ? { code } : {}) });

/** Un montant en centimes, dans la devise et la langue de l'app. */
export function enDevise(centimes: number, devise: string, langue: string): string {
  try { return new Intl.NumberFormat(langue, { style: 'currency', currency: devise }).format(centimes / 100); } catch { return `${(centimes / 100).toFixed(2)} ${devise}`; }
}
