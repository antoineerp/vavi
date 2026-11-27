/** Les places prises, et le calcul qui dit si un créneau est libre : PUR, sans réseau (`occupations.ts` les lit). */
export interface Occupation { readonly debut: string; readonly fin: string; readonly ressource?: string | null }

/**
 * Le créneau [debut, fin) est-il libre ? Vrai quand, à chaque instant, moins de `capacite` (1 par défaut) occupations le
 * recouvrent : la même règle que la base, pour griser d'avance ce qu'elle refuserait.
 */
export function estLibre(o: readonly Occupation[], debut: Date, fin: Date, capacite: number | null = 1): boolean {
  const d = debut.getTime(); const f = fin.getTime();
  const recouvre = o.map((x) => [Date.parse(x.debut), Date.parse(x.fin)] as const).filter(([a, b]) => a < f && b > d);
  const instants = [d, ...recouvre.map(([a]) => a).filter((a) => a >= d)];
  const foule = Math.max(0, ...instants.map((t) => recouvre.filter(([a, b]) => a <= t && t < b).length));
  return foule < (capacite ?? 1);
}
