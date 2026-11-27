/**
 * LE CAHIER DE RECETTE D'UN PROJET — `src/recette.json`, écrit par Claude, rejoué par vavi sans modèle (Antoine, 27/11 :
 * « des tests sur un parcours utilisateur complet […] avec un cahier de recette comme le proposait constructor » ; choix
 * « automatique + bouton »). CE QU'IL REMPLACE : les parcours de `try_journey`, joués une fois puis perdus ; la personne ne
 * les voyait jamais. Ici, ils sont gardés dans le projet, rejoués à chaque aperçu vert et sur un bouton de la console, et
 * leur résultat se lit avant « Publier ».
 *
 * La forme est celle des étapes de `try_journey`. Une forme voisine sans perte est réparée et dite (un tableau seul, des
 * clés françaises) ; le reste est refusé en nommant le parcours et l'étape. PUR.
 */
import { z } from 'zod';
import type { Etape } from './le-parcours';

export const CHEMIN_DU_CAHIER = 'src/recette.json';
export const PARCOURS_MAX = 12;

const Cible = z.string().trim().min(1).max(120);
const EtapeLue = z.union([
  z.object({ action: z.literal('open'), path: z.string().trim().min(1).max(300).regex(/^\//) }),
  z.object({ action: z.literal('click'), target: Cible }),
  z.object({ action: z.literal('fill'), target: Cible, value: z.string().max(500) }),
  z.object({ action: z.literal('select'), target: Cible, value: z.string().trim().min(1).max(200) }),
  z.object({ action: z.literal('check'), target: Cible }),
  z.object({ action: z.literal('expect'), text: z.string().trim().min(1).max(200) }),
]);
const ParcoursLu = z.object({
  name: z.string().trim().min(1).max(120),
  /** Un rôle d'app.json : joué connecté, sur une copie de la base. */
  as_role: z.string().regex(/^[a-z][a-z0-9_]{0,40}$/).optional(),
  /** Sans compte, sur une copie : pour s'inscrire ou acheter. */
  on_copy: z.boolean().optional(),
  steps: z.array(EtapeLue).min(1).max(25),
});

export interface ParcoursDuCahier { readonly nom: string; readonly role: string | null; readonly copie: boolean; readonly etapes: readonly Etape[] }
export type CahierLu =
  | { readonly lu: true; readonly parcours: readonly ParcoursDuCahier[]; readonly repare: readonly string[] }
  | { readonly lu: false; readonly absent: true }
  | { readonly lu: false; readonly absent: false; readonly erreurs: readonly string[] };

const CLES: Record<string, string> = { nom: 'name', role: 'as_role', etapes: 'steps', copie: 'on_copy', parcours: 'journeys' };
const lesClesAnglaises = (o: unknown, repare: string[]): unknown => {
  if (!o || typeof o !== 'object' || Array.isArray(o)) return o;
  const sortie: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) {
    const cle = CLES[k] && !(CLES[k]! in (o as Record<string, unknown>)) ? CLES[k]! : k;
    if (cle !== k) repare.push(`« ${k} » lu comme « ${cle} »`);
    sortie[cle] = v;
  }
  return sortie;
};

/** Le cahier lu depuis son texte ; `undefined` : le projet n'en a pas. */
export function lireLeCahier(texte: string | undefined, roles: readonly string[]): CahierLu {
  if (texte === undefined || texte.trim() === '') return { lu: false, absent: true };
  let brut: unknown;
  try { brut = JSON.parse(texte); } catch (e) { return { lu: false, absent: false, erreurs: [`${CHEMIN_DU_CAHIER} is not JSON: ${(e as Error).message}`] }; }
  const repare: string[] = [];
  // Un tableau seul : les parcours eux-mêmes.
  if (Array.isArray(brut)) { brut = { journeys: brut }; repare.push('le tableau lu comme `journeys`'); }
  const racine = lesClesAnglaises(brut, repare) as { journeys?: unknown };
  if (!racine || typeof racine !== 'object' || !Array.isArray(racine.journeys)) return { lu: false, absent: false, erreurs: [`${CHEMIN_DU_CAHIER} must be { "journeys": [ … ] }`] };
  if (racine.journeys.length === 0 || racine.journeys.length > PARCOURS_MAX) return { lu: false, absent: false, erreurs: [`${CHEMIN_DU_CAHIER} holds 1 to ${PARCOURS_MAX} journeys (here ${racine.journeys.length})`] };
  const erreurs: string[] = [];
  const parcours: ParcoursDuCahier[] = [];
  racine.journeys.forEach((j, i) => {
    const r = ParcoursLu.safeParse(lesClesAnglaises(j, repare));
    const nom = (j as { name?: unknown; nom?: unknown } | null)?.name ?? (j as { nom?: unknown } | null)?.nom;
    const qui = `journey ${i + 1}${typeof nom === 'string' ? ` « ${nom.slice(0, 60)} »` : ''}`;
    if (!r.success) { erreurs.push(...r.error.issues.slice(0, 3).map((x) => `${qui}: ${x.path.join('.') || 'it'} — ${x.message}`)); return; }
    if (r.data.as_role && !roles.includes(r.data.as_role)) { erreurs.push(`${qui}: app.json declares no role « ${r.data.as_role} »${roles.length ? ` (its roles: ${roles.join(', ')})` : ''}`); return; }
    parcours.push({ nom: r.data.name, role: r.data.as_role ?? null, copie: Boolean(r.data.as_role) || r.data.on_copy === true, etapes: r.data.steps });
  });
  const noms = parcours.map((p) => p.nom);
  const doublon = noms.find((n, i) => noms.indexOf(n) !== i);
  if (doublon) erreurs.push(`two journeys are named « ${doublon} »: each name is unique`);
  return erreurs.length ? { lu: false, absent: false, erreurs } : { lu: true, parcours, repare };
}

/* ── Le résultat d'un passage de la recette ─────────────────────────── */

export interface ParcoursJoue {
  readonly nom: string; readonly role: string | null; readonly ok: boolean;
  readonly reussies: number; readonly total: number;
  /** L'étape qui a cassé : son numéro, ce qu'elle faisait, pourquoi, où. */
  readonly arret: { readonly n: number; readonly etape: string; readonly pourquoi: string; readonly adresse: string } | null;
  /** La capture de l'arrêt, gardée par vavi ; `null` : aucune. */
  readonly capture: string | null;
  /** Le parcours n'a pas pu être joué (le navigateur du serveur) : ce n'est pas l'app. */
  readonly injoue?: string;
}
export interface PassageDeLaRecette {
  readonly etat: 'en_cours' | 'joue' | 'injoue';
  /** L'empreinte de la version jouée (son build vert). */
  readonly empreinte: string;
  readonly le: string;
  readonly parcours: readonly ParcoursJoue[];
  /** Pourquoi rien n'a été joué (cahier illisible, build rouge, pas de navigateur). */
  readonly raison?: string;
  readonly declenche: 'apercu' | 'bouton';
}

/** Ce qu'un passage dit en une ligne : « 5 parcours sur 6 passent » et les noms de ceux qui cassent. PUR. */
export function leBilan(p: PassageDeLaRecette): { readonly passent: number; readonly total: number; readonly casses: readonly string[] } {
  const joues = p.parcours.filter((x) => !x.injoue);
  return { passent: joues.filter((x) => x.ok).length, total: joues.length, casses: joues.filter((x) => !x.ok).map((x) => x.nom) };
}
