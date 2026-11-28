/**
 * LES RÈGLES D'UNE APP, DITES AU PROPRIÉTAIRE — l'écran « Règles » de la console (Antoine, 27/11 : « oui »). PUR.
 *
 * Ce que la base tient sur les lignes de chaque table, lu d'app.json et dit en mots, jamais en code : les règles de
 * gestion (`regles`), l'unicité (`uniques`), les plafonds (`plafonds`), les gestes réservés (`reservee`), les bornes d'un
 * chiffre et les périodes qui ne se chevauchent pas. Chaque règle porte la phrase que lit la personne refusée (`dit`),
 * puis comment elle se lit.
 *
 * Ce qu'il remplace : rien (le propriétaire ne voyait pas les règles que la base tenait pour lui).
 */
import type { Manifeste } from '@/lib/backend/app/manifeste';
import { AUTEUR, familleDe, type Condition } from '@/lib/backend/app/les-regles';

type Langue = 'fr' | 'en';
type Table = Manifeste['tables'][number];

export interface UneRegleDite { readonly titre: string; readonly comment: string }
export interface LesReglesDUneTable { readonly table: string; readonly regles: readonly UneRegleDite[] }

const M = {
  fr: {
    etat: 'l’état', oui: 'oui', non: 'non', auj: 'aujourd’hui', dans: (n: number) => `dans ${n} jour${n > 1 ? 's' : ''}`, ilYa: (n: number) => `il y a ${n} jour${n > 1 ? 's' : ''}`,
    est: { egal: 'est', different: 'n’est pas', superieur: 'dépasse', inferieur: 'est sous', au_moins: 'est au moins', au_plus: 'est au plus', parmi: 'est parmi', rempli: 'est rempli', vide: 'est vide' },
    et: ' et ', ou: ' ou ', si: (si: string, alors: string) => `Si ${si}, alors ${alors}.`, toujours: (alors: string) => `Toujours : ${alors}.`,
    unique: (champs: string) => `Jamais deux lignes avec ${champs} pareils, dans une même organisation (sans tenir compte des majuscules).`,
    somme: (c: string) => `la somme de ${c}`, nombre: 'le nombre de lignes', auPlus: (q: string, n: string) => `${q} ne dépasse pas ${n}`,
    parQui: 'par personne qui écrit', par: (c: string) => `par ${c}`, periode: { jour: 'par jour', semaine: 'par semaine', mois: 'par mois', annee: 'par année' } as Record<string, string>, de: (c: string) => `de ${c}`,
    parmiLes: (si: string) => `parmi les lignes où ${si}`,
    reserve: (geste: string, si: string, roles: readonly string[]) => `Le geste « ${geste} » : quand ${si}, ${roles.length > 1 ? `seuls les rôles ${roles.map((r) => `« ${r} »`).join(', ')} le font` : `seul le rôle « ${roles[0]} » le fait`}.`,
    bornes: (c: string, x: string) => `${c} ${x}.`, min: (n: string) => `n’est jamais sous ${n}`, max: (n: string) => `ne dépasse jamais ${n}`, auPlusChamp: (c: string) => `ne dépasse jamais ${c}`,
    bornesTitre: (c: string) => `Les limites de ${c}`,
    periodeTitre: 'Pas de chevauchement', periodeComment: (r: string | null, cap: string) => `Deux lignes ne se chevauchent pas${r ? ` sur un même ${r}` : ''}${cap}.`, capacite: (n: string) => ` (au plus ${n} à la fois)`,
    nuits: ' Elles se comptent en nuits : le jour du départ se libère pour l’arrivée suivante.',
  },
  en: {
    etat: 'the state', oui: 'yes', non: 'no', auj: 'today', dans: (n: number) => `in ${n} day${n > 1 ? 's' : ''}`, ilYa: (n: number) => `${n} day${n > 1 ? 's' : ''} ago`,
    est: { egal: 'is', different: 'is not', superieur: 'is over', inferieur: 'is under', au_moins: 'is at least', au_plus: 'is at most', parmi: 'is one of', rempli: 'is filled in', vide: 'is empty' },
    et: ' and ', ou: ' or ', si: (si: string, alors: string) => `If ${si}, then ${alors}.`, toujours: (alors: string) => `Always: ${alors}.`,
    unique: (champs: string) => `Never two rows with the same ${champs} within one organisation (ignoring case).`,
    somme: (c: string) => `the sum of ${c}`, nombre: 'the number of rows', auPlus: (q: string, n: string) => `${q} never goes over ${n}`,
    parQui: 'per person writing', par: (c: string) => `per ${c}`, periode: { jour: 'per day', semaine: 'per week', mois: 'per month', annee: 'per year' } as Record<string, string>, de: (c: string) => `of ${c}`,
    parmiLes: (si: string) => `among rows where ${si}`,
    reserve: (geste: string, si: string, roles: readonly string[]) => `The action “${geste}”: when ${si}, only the role${roles.length > 1 ? 's' : ''} ${roles.map((r) => `“${r}”`).join(', ')} can do it.`,
    bornes: (c: string, x: string) => `${c} ${x}.`, min: (n: string) => `is never under ${n}`, max: (n: string) => `never goes over ${n}`, auPlusChamp: (c: string) => `never goes over ${c}`,
    bornesTitre: (c: string) => `The limits of ${c}`,
    periodeTitre: 'No overlap', periodeComment: (r: string | null, cap: string) => `Two rows never overlap${r ? ` on the same ${r}` : ''}${cap}.`, capacite: (n: string) => ` (at most ${n} at a time)`,
    nuits: ' They count in nights: the departure day is free for the next arrival.',
  },
} as const;

const minuscule = (s: string): string => (s ? s[0]!.toLowerCase() + s.slice(1) : s);

/** Le nom d'un champ, tel que la personne le lit. PUR. */
const nomDuChamp = (t: Table, n: string, l: Langue): string =>
  (n === 'etat' ? M[l].etat : minuscule(t.champs.find((c) => c.nom === n)?.libelle ?? (t.parent && n === `${t.parent}_id` ? t.parent : n)));

function valeurDite(t: Table, champ: string, v: unknown, l: Langue): string {
  const m = M[l];
  if (Array.isArray(v)) return v.map((x) => valeurDite(t, champ, x, l)).join(m.ou);
  if (champ === 'etat') return `« ${t.cycle?.libelles[String(v)] ?? String(v)} »`;
  const type = t.champs.find((c) => c.nom === champ)?.type ?? 'texte';
  if (typeof v === 'boolean') return v ? m.oui : m.non;
  if (typeof v === 'number' && familleDe(type) === 'date') return v === 0 ? m.auj : v > 0 ? m.dans(v) : m.ilYa(-v);
  if (typeof v === 'number') return v.toLocaleString(l === 'fr' ? 'fr-FR' : 'en-GB');
  return l === 'fr' ? `« ${String(v)} »` : `“${String(v)}”`;
}

/** Une condition, en mots. PUR. */
export function laConditionDite(t: Table, c: Condition, l: Langue): string {
  const sujet = nomDuChamp(t, c.champ, l);
  const op = M[l].est[c.est];
  if (c.est === 'rempli' || c.est === 'vide') return `${sujet} ${op}`;
  return `${sujet} ${op} ${c.autre ? nomDuChamp(t, c.autre, l) : valeurDite(t, c.champ, c.valeur, l)}`;
}

const conditions = (t: Table, cs: readonly Condition[], l: Langue): string => cs.map((c) => laConditionDite(t, c, l)).join(M[l].et);

/** Les règles que la base tient sur une table. PUR. */
export function lesReglesDeLaTable(m: Manifeste, t: Table, l: Langue): UneRegleDite[] {
  const x = M[l];
  const roles = (noms: readonly string[]): string[] => noms.map((n) => m.roles.find((r) => r.nom === n)?.libelle ?? n);
  const nombre = (n: number): string => n.toLocaleString(l === 'fr' ? 'fr-FR' : 'en-GB');
  const rendu: UneRegleDite[] = [];
  for (const r of t.regles ?? []) {
    const alors = conditions(t, r.alors, l);
    rendu.push({ titre: r.dit, comment: r.si.length > 0 ? x.si(conditions(t, r.si, l), alors) : x.toujours(alors) });
  }
  for (const u of t.uniques ?? []) rendu.push({ titre: u.dit, comment: x.unique(u.champs.map((n) => nomDuChamp(t, n, l)).join(x.et)) });
  for (const p of t.plafonds ?? []) {
    const quoi = p.champ ? x.somme(nomDuChamp(t, p.champ, l)) : x.nombre;
    const suite = [
      ...p.par.map((n) => (n === AUTEUR ? x.parQui : x.par(nomDuChamp(t, n, l)))),
      ...(p.periode ? [`${x.periode[p.periode.sur]} ${x.de(nomDuChamp(t, p.periode.champ, l))}`] : []),
      ...(p.si.length > 0 ? [x.parmiLes(conditions(t, p.si, l))] : []),
    ];
    const phrase = x.auPlus(quoi, nombre(p.au_plus));
    rendu.push({ titre: p.dit, comment: `${phrase[0]!.toUpperCase()}${phrase.slice(1)}${suite.length ? `, ${suite.join(', ')}` : ''}.` });
  }
  for (const tr of t.cycle?.transitions ?? []) for (const r of tr.reservee ?? []) rendu.push({ titre: r.dit, comment: x.reserve(tr.libelle, conditions(t, r.si, l), roles(r.par)) });
  for (const c of t.champs.filter((y) => y.bornes && (y.bornes.min !== undefined || y.bornes.max !== undefined || y.bornes.auPlus))) {
    const b = c.bornes!;
    const dits = [...(b.min !== undefined ? [x.min(nombre(b.min))] : []), ...(b.max !== undefined ? [x.max(nombre(b.max))] : []), ...(b.auPlus ? [x.auPlusChamp(nomDuChamp(t, b.auPlus, l))] : [])];
    rendu.push({ titre: x.bornesTitre(minuscule(c.libelle)), comment: x.bornes(c.libelle, dits.join(x.et)) });
  }
  if (t.periode?.exclusive) {
    const cap = t.periode.capacite;
    rendu.push({ titre: x.periodeTitre, comment: x.periodeComment(t.periode.ressource ? nomDuChamp(t, t.periode.ressource, l) : null,
      typeof cap === 'number' && cap > 1 ? x.capacite(nombre(cap)) : typeof cap === 'string' ? x.capacite(minuscule(cap)) : '') + (t.periode.nuits ? x.nuits : '') });
  }
  return rendu;
}

/** Les tables qui ont des règles, chacune avec les siennes. PUR. */
export function lesReglesDites(m: Manifeste, l: Langue): LesReglesDUneTable[] {
  return m.tables.flatMap((t) => {
    const regles = lesReglesDeLaTable(m, t, l);
    return regles.length > 0 ? [{ table: t.libelle, regles }] : [];
  });
}
