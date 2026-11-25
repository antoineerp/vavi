/**
 * LES DOMAINES DES SITES, dans la base de la plateforme (`vavi_domaines`) : le domaine d'un projet, le demander, le dire
 * actif (certificat émis), le retirer ; et, pour l'aiguillage des requêtes, la carte des domaines actifs, relue au plus
 * toutes les 60 secondes (une panne garde la dernière carte lue : un site branché ne tombe pas avec la base).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { PlanDns } from './le-domaine';

export type Issue<T> = { readonly lu: true; readonly valeur: T } | { readonly lu: false; readonly pourquoi: string };
export interface DomaineDUnProjet { readonly hote: string; readonly racine: string | null; readonly creeLe: string; readonly actifLe: string | null }

const JOURS_AVANT_REPRISE = 7;

export async function leDomaineDuProjet(base: SupabaseClient, projet: string): Promise<Issue<DomaineDUnProjet | null>> {
  const r = await base.from('vavi_domaines').select('hote, racine, cree_le, actif_le').eq('projet', projet).maybeSingle<{ hote: string; racine: string | null; cree_le: string; actif_le: string | null }>();
  if (r.error) return { lu: false, pourquoi: r.error.message };
  return { lu: true, valeur: r.data ? { hote: r.data.hote, racine: r.data.racine, creeLe: r.data.cree_le, actifLe: r.data.actif_le } : null };
}

/** Le domaine demandé pour ce projet (il remplace le précédent). Pris par un autre projet : refusé, sauf demande jamais branchée depuis 7 jours. */
export async function demanderLeDomaine(base: SupabaseClient, projet: string, plan: PlanDns, maintenant: number): Promise<Issue<'demande' | 'pris'>> {
  const autre = await base.from('vavi_domaines').select('projet, cree_le, actif_le').eq('hote', plan.hote).maybeSingle<{ projet: string; cree_le: string; actif_le: string | null }>();
  if (autre.error) return { lu: false, pourquoi: autre.error.message };
  if (autre.data && autre.data.projet !== projet) {
    const abandonne = !autre.data.actif_le && Date.parse(autre.data.cree_le) < maintenant - JOURS_AVANT_REPRISE * 86_400_000;
    if (!abandonne) return { lu: true, valeur: 'pris' };
    const d = await base.from('vavi_domaines').delete().eq('hote', plan.hote).is('actif_le', null);
    if (d.error) return { lu: false, pourquoi: d.error.message };
  }
  const e = await base.from('vavi_domaines').delete().eq('projet', projet).neq('hote', plan.hote);
  if (e.error) return { lu: false, pourquoi: e.error.message };
  const r = await base.from('vavi_domaines').upsert({ hote: plan.hote, projet, racine: plan.racine }, { onConflict: 'hote', ignoreDuplicates: true });
  if (r.error) return { lu: false, pourquoi: r.error.message };
  oublierLaCarte();
  return { lu: true, valeur: 'demande' };
}

export async function direActif(base: SupabaseClient, projet: string, hote: string, maintenant: number): Promise<Issue<true>> {
  const r = await base.from('vavi_domaines').update({ actif_le: new Date(maintenant).toISOString() }).eq('projet', projet).eq('hote', hote).is('actif_le', null);
  oublierLaCarte();
  return r.error ? { lu: false, pourquoi: r.error.message } : { lu: true, valeur: true };
}

export async function retirerLeDomaine(base: SupabaseClient, projet: string): Promise<Issue<true>> {
  const r = await base.from('vavi_domaines').delete().eq('projet', projet);
  oublierLaCarte();
  return r.error ? { lu: false, pourquoi: r.error.message } : { lu: true, valeur: true };
}

/** La carte des domaines actifs : hôte → projet, et projet → hôte. */
export interface Carte { readonly parHote: ReadonlyMap<string, string>; readonly parProjet: ReadonlyMap<string, string> }
const VIDE: Carte = { parHote: new Map(), parProjet: new Map() };
let carte: { valeur: Carte; lueLe: number } | null = null;
let enCours: Promise<Carte> | null = null;
const oublierLaCarte = () => { carte = null; };

/** PURE — la carte depuis les lignes lues. */
export function laCarte(lignes: readonly { readonly hote: string; readonly projet: string }[]): Carte {
  return { parHote: new Map(lignes.map((l) => [l.hote, l.projet])), parProjet: new Map(lignes.map((l) => [l.projet, l.hote])) };
}

export async function laCarteDesDomaines(lire: () => Promise<Issue<readonly { hote: string; projet: string }[]>>, maintenant = Date.now()): Promise<Carte> {
  if (carte && maintenant - carte.lueLe < 60_000) return carte.valeur;
  enCours ??= lire().then((r) => {
    if (r.lu) carte = { valeur: laCarte(r.valeur), lueLe: maintenant };
    else carte = { valeur: carte?.valeur ?? VIDE, lueLe: maintenant };
    return carte?.valeur ?? VIDE;
  }).catch(() => carte?.valeur ?? VIDE).finally(() => { enCours = null; });
  return enCours;
}

export const lesDomainesActifsSur = (base: SupabaseClient) => async (): Promise<Issue<readonly { hote: string; projet: string }[]>> => {
  const r = await base.from('vavi_domaines').select('hote, projet').not('actif_le', 'is', null).limit(10_000);
  // Avant la migration, la table manque : aucune carte, rien ne change.
  return r.error ? { lu: false, pourquoi: r.error.message } : { lu: true, valeur: r.data as { hote: string; projet: string }[] };
};
