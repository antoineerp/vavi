/**
 * Où arrive une personne qui vient d'entrer, d'après ce qu'app.json déclare : l'écran du `parcours` quand elle est celle
 * pour qui l'app existe d'abord, sinon le premier des `ecrans` qui s'ouvre à l'un de ses rôles, dans l'ordre du cadrage.
 * Ce qu'il remplace (interdit 9) : la première page réservée à l'un de ses rôles dans l'ordre du menu, que rien ne liait
 * à ce que la demande voulait : qui travaillait pouvait arriver ailleurs que sur son écran. PUR.
 */
import type { FaitDePage } from './faits';

interface EcranDeLApp { readonly nom: string; readonly titre: string; readonly pour: readonly string[] }

export function lArrivee(pages: readonly FaitDePage[], app: {
  readonly ecrans?: readonly EcranDeLApp[]; readonly parcours?: { readonly pour: string; readonly ecran?: string };
  readonly langues: { readonly principale: string };
}, roles: readonly string[]): string | null {
  const titre = (p: FaitDePage): string => (typeof p.titre === 'string' ? p.titre : p.titre?.[app.langues.principale] ?? '').trim().toLowerCase();
  const ouvre = (p: FaitDePage): boolean => p.acces.nature === 'compte' || (p.acces.nature === 'role' && p.acces.roles.some((r) => roles.includes(r)));
  const pageDe = (e: EcranDeLApp): FaitDePage | undefined => pages.find((p) => !p.chemin.includes(':') && titre(p) === e.titre.trim().toLowerCase() && ouvre(p));
  const ecrans = app.ecrans ?? [];
  const duParcours = app.parcours && roles.includes(app.parcours.pour) ? ecrans.find((e) => e.nom === app.parcours!.ecran) : undefined;
  const choisis = [...(duParcours ? [duParcours] : []), ...ecrans.filter((e) => e.pour.some((r) => roles.includes(r)))];
  for (const e of choisis) { const p = pageDe(e); if (p) return p.chemin; }
  return null;
}
