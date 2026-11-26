/**
 * LES ERREURS D'APP.JSON DITES À CLAUDE (essai d'Antoine du 26/11 : un agent refusé trois fois avec « Invalid input »,
 * Claude devinait la forme de `reveil`). Une union (plusieurs formes permises) rendait le seul message nu de zod : on dit
 * à la place ce qui manque à la forme la plus proche, ou, si aucune n'est reconnue, les valeurs qui choisissent la forme.
 * Un champ manquant dit ce qu'il attend. Règle générale : vaut pour toute union du manifeste. PURE.
 *
 * Ce qu'il remplace : `issues.map(i => i.message)` de `lireLeManifeste`.
 */
import type { ZodIssue } from 'zod';

const ou = (p: readonly (string | number)[]) => p.join('.');
const dire = (p: readonly (string | number)[], m: string) => (p.length ? `${ou(p)} : ${m}` : m);

function lue(i: ZodIssue): string[] {
  if (i.code === 'invalid_union') {
    const formes = i.unionErrors.map((e) => e.issues);
    const choisie = (x: readonly ZodIssue[]) => !x.some((y) => y.code === 'invalid_literal');
    const proches = formes.filter(choisie);
    if (proches.length > 0) return proches.flatMap((x) => x.flatMap(lue));
    const literaux = formes.flatMap((x) => x.filter((y) => y.code === 'invalid_literal'));
    if (literaux.length === 0) return [dire(i.path, i.message)];
    const attendus = [...new Set(literaux.map((y) => JSON.stringify((y as { expected: unknown }).expected)))];
    return [dire(literaux[0]!.path, `must be one of ${attendus.join(' | ')}, each with its own fields`)];
  }
  if (i.code === 'invalid_type' && i.received === 'undefined') return [dire(i.path, `required (${i.expected})`)];
  return [dire(i.path, i.message)];
}

/** Les erreurs, une par ligne, sans doublon. */
export const lesErreursLues = (issues: readonly ZodIssue[]): string[] => [...new Set(issues.flatMap(lue))];
