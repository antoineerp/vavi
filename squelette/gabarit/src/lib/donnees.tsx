/**
 * Lire et écrire les données de l'app, typées par ses tables.
 *
 * - Une table et ses colonnes sont celles d'app.json (`src/donnees/types.ts`, généré) : une colonne inventée ne compile pas.
 * - Une lecture a trois états, et `<Lignes>` exige de dire chacun : l'attente, la panne, le vide.
 * - Une écriture rend ce que la base a répondu : la ligne écrite, ou un refus qui dit pourquoi.
 * - L'état d'une ligne à cycle ne s'écrit pas : il avance par une transition déclarée, que la base vérifie.
 */
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { QueryClient, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from './supabase';
import {
  relaisBranche, lireAuRelais, creerAuRelais, modifierAuRelais, supprimerAuRelais, appelerAuRelais, refusDit,
  type ErreurDuRelais,
} from './relais';
import type { Resultat } from './resultat';
import { Patience, Panne } from '../briques/etats';
import { libellesPour } from './libelles';
import { langueCourante } from './langue';

export type Json = string | number | boolean | null | { readonly [cle: string]: Json } | readonly Json[];

/**
 * Les tables de l'app. Celles de la plateforme sont ici, lues seulement (`membres`, `membres_invitations`) ;
 * `src/donnees/types.ts`, généré depuis app.json, y ajoute les siennes.
 */
export interface TablesDeLApp {
  membres: {
    ligne: { readonly compte_id: string; readonly email: string | null; readonly role: string; readonly organisation_id: string; readonly responsable_id: string | null; readonly created_at: string };
    nouvelle: never;
    modification: never;
  };
  membres_invitations: {
    ligne: { readonly email: string; readonly role: string; readonly organisation_id: string; readonly responsable_id: string | null; readonly created_at: string };
    nouvelle: never;
    modification: never;
  };
}

export type NomDeTable = Extract<keyof TablesDeLApp, string>;
export type Ligne<T extends NomDeTable> = TablesDeLApp[T]['ligne'];
export type Nouvelle<T extends NomDeTable> = TablesDeLApp[T]['nouvelle'];
export type Modification<T extends NomDeTable> = TablesDeLApp[T]['modification'];

/** Ce que la base rend au plus en une lecture. Au-delà, une lecture entière est refusée, jamais coupée en silence. */
export const LIMITE_DE_LECTURE = 1000;

export interface DemandeDeLecture<T extends NomDeTable> {
  readonly egal?: { readonly [C in keyof Ligne<T>]?: Ligne<T>[C] };
  readonly ordre?: { readonly colonne: Extract<keyof Ligne<T>, string>; readonly sens?: 'croissant' | 'decroissant' };
  /** Les premières lignes seulement, selon `ordre`. Sans limite : toutes, ou un refus. */
  readonly limite?: number;
}

export interface LignesLues<L> { readonly lignes: readonly L[]; readonly total: number | null }
export type EtatDeLecture<L> = { readonly forme: 'attente' } | Resultat<LignesLues<L>>;

type Refus = Extract<Resultat<unknown>, { forme: 'refus' }>;
const refusDe = (e: ErreurDuRelais): Refus => ({ forme: 'refus', raison: e.message, geste: e.geste });
const refusDuCode = (code: string | null): Refus => refusDe({ ...refusDit(code), code });
const sansBase = (): Refus => {
  const L = libellesPour(langueCourante());
  return { forme: 'refus', raison: L.sansBackend, geste: L.gesteReessayer };
};

async function lire<T extends NomDeTable>(table: T, d: DemandeDeLecture<T>): Promise<Resultat<LignesLues<Ligne<T>>>> {
  if (!relaisBranche()) return sansBase();
  const limite = Math.max(1, Math.min(d.limite ?? LIMITE_DE_LECTURE, LIMITE_DE_LECTURE));
  const r = await lireAuRelais(table, (d.egal ?? {}) as Record<string, unknown>, d.ordre?.colonne ?? null,
    d.ordre?.sens === 'decroissant', limite);
  if (r.erreur) return refusDe(r.erreur);
  if (!r.donnee || !Array.isArray(r.donnee.lignes)) return refusDuCode(null);
  const total = typeof r.donnee.total === 'number' ? r.donnee.total : null;
  if (d.limite === undefined && (total ?? Infinity) > r.donnee.lignes.length) {
    if (total === null) return refusDuCode(null);
    const e = refusDit('trop-de-lignes');
    return { forme: 'refus', raison: e.message.replace('{n}', String(total)), geste: e.geste };
  }
  return { forme: 'donnee', donnee: { lignes: r.donnee.lignes as Ligne<T>[], total } };
}

/** Lire des lignes : `attente`, puis une donnée ou un refus. Relue d'elle-même après une écriture sur la même table. */
export function useLecture<T extends NomDeTable>(table: T, demande: DemandeDeLecture<T> = {}): EtatDeLecture<Ligne<T>> {
  const q = useQuery({ queryKey: ['base', table, demande], queryFn: () => lire(table, demande) });
  if (q.isPending) return { forme: 'attente' };
  return q.isError ? refusDuCode(null) : q.data;
}

/** Le geste qui lance, sous un état vide : une adresse, ou une action. */
export type GesteDuVide = { readonly libelle: string; readonly vers: string } | { readonly libelle: string; readonly action: () => void };

export interface LectureProps<L> {
  readonly lecture: EtatDeLecture<L>;
  /** Ce qu'on attend, dit à la personne. */
  readonly attente: string;
  /** Ce qui n'a pas pu se lire. La raison s'ajoute seule. */
  readonly panne: string;
  /** Ce qui manque, et le geste qui lance quand quelqu'un ici peut créer. */
  readonly vide: { readonly quoi: string; readonly geste?: GesteDuVide };
  readonly children: (lignes: readonly L[]) => ReactNode;
}

function Vide({ quoi, geste }: LectureProps<unknown>['vide']) {
  return (
    <div data-etat="vide" className="space-y-3 py-8 text-center">
      <p className="text-sur-fond-attenue">{quoi}</p>
      {geste && 'vers' in geste ? <Link to={geste.vers} className="font-medium underline underline-offset-4">{geste.libelle}</Link> : null}
      {geste && 'action' in geste ? <button type="button" onClick={geste.action} className="font-medium underline underline-offset-4">{geste.libelle}</button> : null}
    </div>
  );
}

export function Lecture<L>({ lecture, attente, panne, vide, children }: LectureProps<L>) {
  if (lecture.forme === 'attente') return <Patience quoi={attente} />;
  if (lecture.forme === 'refus') return <Panne quoi={panne} detail={`${lecture.raison} — ${lecture.geste}`} />;
  return lecture.donnee.lignes.length === 0 ? <Vide {...vide} /> : <>{children(lecture.donnee.lignes)}</>;
}

export type LignesProps<T extends NomDeTable> = Omit<LectureProps<Ligne<T>>, 'lecture'> & {
  readonly table: T; readonly demande?: DemandeDeLecture<T>;
};

/** Lire une table et rendre ses lignes : les lignes n'existent que dans les enfants. */
export function Lignes<T extends NomDeTable>({ table, demande, ...rendu }: LignesProps<T>) {
  return <Lecture lecture={useLecture(table, demande)} {...rendu} />;
}

export interface Ecriture<T extends NomDeTable> {
  readonly creer: (valeurs: Nouvelle<T>) => Promise<Resultat<Ligne<T>>>;
  readonly modifier: (id: string, valeurs: Modification<T>) => Promise<Resultat<Ligne<T>>>;
  readonly supprimer: (id: string) => Promise<Resultat<null>>;
  /** Vrai pendant une écriture, pour que le geste ne parte pas deux fois. */
  readonly enCours: boolean;
}

/** Ce que la base a écrit. Une écriture qui n'a touché aucune ligne est un refus, jamais un succès. */
function ecrit<L>(r: { readonly donnee: unknown; readonly erreur: ErreurDuRelais | null }): Resultat<L> {
  if (r.erreur) return refusDe(r.erreur);
  const ligne = Array.isArray(r.donnee) ? r.donnee[0] : r.donnee;
  if (ligne === undefined || ligne === null) return refusDuCode('P0002');
  return { forme: 'donnee', donnee: ligne as L };
}

/**
 * Après une écriture réussie, TOUT ce qui est affiché se relit : la base recalcule ailleurs ce qu'elle touche (un cumul, un
 * calcul, un indicateur, une transition entraînée). Ce qu'il remplace : la relecture de la seule table écrite ; un
 * règlement saisi laissait le reste dû, le total du client et le tableau de bord à leur valeur d'avant.
 */
export const relireLaBase = (client: Pick<ReturnType<typeof useQueryClient>, 'invalidateQueries'>): Promise<void> => client.invalidateQueries({ queryKey: ['base'] });

function useSuivi() {
  const client = useQueryClient();
  const [enCours, poser] = useState(0);
  const suivre = async <R,>(travail: () => Promise<Resultat<R>>): Promise<Resultat<R>> => {
    if (!relaisBranche()) return sansBase();
    poser((n) => n + 1);
    try {
      const r = await travail();
      if (r.forme === 'donnee') await relireLaBase(client);
      return r;
    } finally {
      poser((n) => n - 1);
    }
  };
  return { suivre, enCours: enCours > 0 };
}

export function useEcriture<T extends NomDeTable>(table: T): Ecriture<T> {
  const { suivre, enCours } = useSuivi();
  return {
    creer: (valeurs) => suivre(async () => ecrit<Ligne<T>>(await creerAuRelais(table, { id: crypto.randomUUID(), ...(valeurs as object) }))),
    modifier: (id, valeurs) => suivre(async () => ecrit<Ligne<T>>(await modifierAuRelais(table, { id }, valeurs as Record<string, unknown>))),
    supprimer: (id) => suivre(async () => {
      const r = ecrit<unknown>(await supprimerAuRelais(table, { id }));
      return r.forme === 'refus' ? r : { forme: 'donnee', donnee: null };
    }),
    enCours,
  };
}

export type TableAvecCycle = { [T in NomDeTable]: TablesDeLApp[T] extends { transitions: string } ? T : never }[NomDeTable];
export type TransitionDe<T extends TableAvecCycle> = TablesDeLApp[T] extends { transitions: infer X extends string } ? X : never;

/** Les tables dont une colonne porte une pièce jointe, et ces colonnes : elles s'écrivent par `<PieceJointe>`, jamais par `useEcriture`. */
export type TableAvecPiece = { [T in NomDeTable]: TablesDeLApp[T] extends { pieces: string } ? T : never }[NomDeTable];
export type PieceDe<T extends TableAvecPiece> = TablesDeLApp[T] extends { pieces: infer X extends string } ? X : never;
/** Les tables où l'IA propose des lignes (`propositions` dans app.json) : `<ProposerParLIA>` y écrit, par la plateforme. */
export type TableAvecPropositions = { [T in NomDeTable]: TablesDeLApp[T] extends { propositions: true } ? T : never }[NomDeTable];

/** Faire avancer une ligne : la base vérifie l'état de départ et le rôle, puis écrit l'état atteint et le journal. */
export function useTransiter<T extends TableAvecCycle>(table: T) {
  const { suivre, enCours } = useSuivi();
  const transiter = (id: string, transition: TransitionDe<T>, motif?: string): Promise<Resultat<string>> => suivre(async () => {
    const r = await appelerAuRelais<string>(`${table}_transiter`, { p_id: id, p_transition: transition, ...(motif ? { p_motif: motif } : {}) });
    return r.erreur ? refusDe(r.erreur) : { forme: 'donnee', donnee: String(r.donnee) };
  });
  return { transiter, enCours };
}

/** Les transitions que ce compte peut faire sur cette ligne, calculées par la base avec la même règle que la transition. */
export function useTransitionsPossibles<T extends TableAvecCycle>(table: T, id: string):
  { readonly forme: 'attente' } | Resultat<readonly TransitionDe<T>[]> {
  const q = useQuery({
    queryKey: ['base', table, 'possibles', id],
    queryFn: async (): Promise<Resultat<readonly TransitionDe<T>[]>> => {
      if (!relaisBranche()) return sansBase();
      const r = await appelerAuRelais<string[]>(`${table}_transitions_possibles`, { p_id: id });
      if (r.erreur) return refusDe(r.erreur);
      return Array.isArray(r.donnee) ? { forme: 'donnee', donnee: r.donnee as TransitionDe<T>[] } : refusDuCode(null);
    },
  });
  return q.data ?? { forme: 'attente' };
}

/** Le client des lectures, vidé quand la session change : les lignes d'une personne ne restent pas à l'écran de la suivante. */
export const clientDesLectures = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 30_000 } },
});
supabase?.auth.onAuthStateChange((evenement) => {
  if (evenement === 'SIGNED_IN' || evenement === 'SIGNED_OUT' || evenement === 'USER_UPDATED') clientDesLectures.clear();
});
