/**
 * Le seul chemin du navigateur vers la base de l'app.
 *
 * Le schéma de l'app n'est pas exposé : le relais appelle les fonctions `voie_neuve_*` de la plateforme, qui s'exécutent
 * avec les droits du compte connecté. La sécurité des lignes (RLS) de chaque table décide seule de ce qui est lu et écrit.
 * Un refus de la base est dit dans la langue de l'app ; son message brut part au journal, jamais à l'écran.
 * Les pages n'appellent pas ce module : elles passent par `@/lib/donnees`.
 */
import { supabase, schema } from './supabase';
import { libellesPour, type Libelles } from './libelles';
import { langueCourante } from './langue';

export interface ErreurDuRelais { readonly message: string; readonly geste: string; readonly code: string | null }
export type ReponseDuRelais<T> =
  | { readonly donnee: T | null; readonly erreur: null }
  | { readonly donnee: null; readonly erreur: ErreurDuRelais };

export const SANS_BASE = 'sans-base';
export const relaisBranche = (): boolean => supabase !== null && schema !== null;

const REFUS: Readonly<Record<string, readonly [keyof Libelles, keyof Libelles]>> = {
  '42501': ['refusDroit', 'gesteAcces'],
  P0001: ['refusEtat', 'gesteRecharger'],
  P0002: ['refusIntrouvable', 'gesteRecharger'],
  '22023': ['refusMotif', 'gesteCorriger'],
  '23505': ['refusDoublon', 'gesteCorriger'],
  'trop-de-lignes': ['refusTropDeLignes', 'gestePrevenir'],
};

/** Le refus d'un code SQLSTATE, dit par les libellés de l'app. */
export function refusDit(code: string | null): Omit<ErreurDuRelais, 'code'> {
  const L = libellesPour(langueCourante());
  const valeur = /^(23|22P02)/.test(code ?? '') ? (['refusValeur', 'gesteCorriger'] as const) : (['refusAutre', 'gesteReessayer'] as const);
  const [raison, geste] = REFUS[code ?? ''] ?? valeur;
  return { message: L[raison], geste: L[geste] };
}

async function appel<T>(fonction: string, args: Record<string, unknown>): Promise<ReponseDuRelais<T>> {
  if (!supabase || !schema) {
    const L = libellesPour(langueCourante());
    return { donnee: null, erreur: { message: L.sansBackend, geste: L.gesteReessayer, code: SANS_BASE } };
  }
  const { data, error } = await supabase.rpc(fonction, { p_schema: schema, ...args });
  if (error) {
    console.warn('[base]', fonction, error.code, error.message);
    return { donnee: null, erreur: { ...refusDit(error.code ?? null), code: error.code ?? null } };
  }
  return { donnee: (data ?? null) as T | null, erreur: null };
}

type Egal = Readonly<Record<string, unknown>>;

export const lireAuRelais = (table: string, egal: Egal, ordre: string | null, decroissant: boolean, limite: number) =>
  appel<{ readonly lignes: readonly unknown[]; readonly total: number }>('voie_neuve_lire', {
    p_table: table, p_egal: egal, p_ordre: ordre, p_decroissant: decroissant, p_limite: limite,
  });

export const creerAuRelais = (table: string, valeurs: Egal) => appel<unknown>('voie_neuve_creer', { p_table: table, p_valeurs: valeurs });

export const modifierAuRelais = (table: string, egal: Egal, valeurs: Egal) =>
  appel<readonly unknown[]>('voie_neuve_modifier', { p_table: table, p_egal: egal, p_valeurs: valeurs });

export const supprimerAuRelais = (table: string, egal: Egal) =>
  appel<readonly unknown[]>('voie_neuve_supprimer', { p_table: table, p_egal: egal });

/** Une fonction que la plateforme pose dans le schéma de l'app : rôles, transitions, équipe, analyse. */
export const appelerAuRelais = <T,>(fonction: string, args: Egal = {}) =>
  appel<T>('voie_neuve_appeler', { p_fonction: fonction, p_arguments: args });
