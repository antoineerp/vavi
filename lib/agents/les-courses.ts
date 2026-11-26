/**
 * LES COURSES DES AGENTS — ce que le serveur fait quand la base l'appelle (`/api/agents/tic`, par `vavi_le_tic`) : il
 * prend une course en file (une heure due, une ligne arrivée), la fait tourner, inscrit son issue, et recommence tant
 * qu'il y en a et que son temps n'est pas écoulé. Une course qui ne peut pas tourner (pas de build, la plateforme en
 * panne) est finie avec sa raison, jamais laissée prise. Ce qu'il remplace : rien ne faisait tourner un agent sans
 * personne (`le-sql-des-agents.ts`).
 */
import type { Course } from './le-moteur';

export interface Prise {
  readonly id: number; readonly projet: string; readonly agent: string;
  readonly declencheur: Record<string, unknown>; readonly iaParJour: number;
}

export type Issue<T> = { readonly lu: true; readonly valeur: T } | { readonly lu: false; readonly pourquoi: string };

export interface LesCourses {
  prendre(): Promise<Issue<Prise | null>>;
  courir(p: Prise): Promise<Course | { readonly raison: string }>;
  finir(id: number, issue: Readonly<Record<string, unknown>>): Promise<Issue<boolean>>;
}

/** Une prise lue de la base ; `null` : rien à faire, ou une forme fausse. PURE. */
export function lirePrise(x: unknown): Prise | null {
  if (!x || typeof x !== 'object') return null;
  const o = x as Record<string, unknown>;
  const id = Number(o.id);
  if (!Number.isSafeInteger(id) || typeof o.projet !== 'string' || typeof o.agent !== 'string') return null;
  const d = o.declencheur && typeof o.declencheur === 'object' && !Array.isArray(o.declencheur) ? o.declencheur as Record<string, unknown> : {};
  return { id, projet: o.projet, agent: o.agent, declencheur: d, iaParJour: Number.isFinite(Number(o.ia_par_jour)) ? Number(o.ia_par_jour) : 30 };
}

/** L'issue d'une course, telle que la base la garde. PURE. */
export function lIssue(c: Course | { readonly raison: string }): Record<string, unknown> {
  if ('raison' in c) return { ok: false, erreur: `the agent could not run: ${c.raison}`, journal: [], ia: 0, operations: 0, duree_ms: 0 };
  const commun = { journal: c.journal, ia: c.ia, operations: c.operations, duree_ms: c.duree };
  return c.ok ? { ok: true, resultat: c.resultat, ...commun }
    : { ok: false, erreur: c.pile ? `${c.erreur}\n${c.pile}` : c.erreur, ...commun };
}

export async function faireLesCourses(o: LesCourses & { readonly budgetMs: number; readonly maintenant?: () => number }): Promise<{ readonly faites: number; readonly panne: string | null }> {
  const t = o.maintenant ?? Date.now;
  const fin = t() + o.budgetMs;
  let faites = 0;
  while (t() < fin) {
    const p = await o.prendre();
    if (!p.lu) return { faites, panne: p.pourquoi };
    if (!p.valeur) break;
    const c = await o.courir(p.valeur).catch((e: unknown) => ({ raison: `the platform failed: ${String((e as Error)?.message ?? e).slice(0, 200)}` }));
    const f = await o.finir(p.valeur.id, lIssue(c));
    if (!f.lu) return { faites, panne: f.pourquoi };
    console.log(`[agent] ${p.valeur.projet.slice(0, 8)} ${p.valeur.agent} ${String(p.valeur.declencheur.type)} ${'raison' in c ? `non lancé : ${c.raison}` : c.ok ? 'fini' : c.etape}`);
    faites++;
  }
  return { faites, panne: null };
}
