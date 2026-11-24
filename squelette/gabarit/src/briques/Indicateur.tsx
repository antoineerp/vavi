/**
 * Un indicateur d'app.json, calculé par la base (`analyser()`), sous les droits du compte : chacun ne compte que les
 * lignes qu'il voit. La page ne calcule rien. Une valeur qui ne se calcule pas se lit « — » ; un seuil passé se dit.
 * Réparti (`par`), il se dessine dans sa `forme` (`figures.tsx`) : des colonnes ou une courbe dans le temps, la période la
 * plus récente à droite ; des barres, des jauges contre un objectif, ou un anneau, par un champ. Un clic sur le chiffre, ou sur une part, montre les lignes qu'il compte, lues
 * par la base sous les mêmes droits ; `vers` mène chaque ligne à son écran (ses documents, ses gestes).
 */
import { useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { APP } from '../lib/app';
import { langueCourante } from '../lib/langue';
import { libellesPour } from '../lib/libelles';
import { appelerAuRelais } from '../lib/relais';
import { Figure, type Part } from './figures';
import type { NomDIndicateur } from '../donnees/types';

type Valeurs = Readonly<Record<string, number | null | readonly Part[]>> & { readonly _periodes?: Readonly<Record<string, string>> };

/** Les indicateurs, relus après chaque écriture (`['base']`). */
function useIndicateurs() {
  return useQuery({
    queryKey: ['base', 'indicateurs'],
    queryFn: async (): Promise<Valeurs> => {
      const r = await appelerAuRelais<Valeurs>('analyser');
      if (r.erreur) throw new Error(r.erreur.message);
      return r.donnee ?? {};
    },
  });
}

function ecrire(valeur: number, nom: NomDIndicateur, langue: string): string {
  const i = APP.indicateurs.find((x) => x.nom === nom);
  const champ = APP.tables.find((t) => t.nom === i?.table)?.champs.find((c) => c.nom === i?.champ);
  // Un montant se lit dans la devise de la vente, sinon en euros (comme le prix d'une offre).
  const devise = champ?.type === 'montant' && i?.calcul !== 'nombre' ? APP.vente?.devise ?? 'EUR' : undefined;
  try {
    return new Intl.NumberFormat(langue, devise ? { style: 'currency', currency: devise } : { maximumFractionDigits: champ?.type === 'montant' ? 2 : 1 }).format(valeur);
  } catch { return String(valeur); }
}

/** La période qu'un indicateur à période retient, à partir de son début (`AAAA-MM-JJ`) : celle d'aujourd'hui, ou la dernière qui a des lignes. */
function periodeRetenue(debut: string | undefined, unite: string | undefined, langue: string): string | null {
  const d = debut ? new Date(`${debut}T00:00:00`) : null;
  if (!d || Number.isNaN(d.getTime())) return null;
  const f = (o: Intl.DateTimeFormatOptions, x: Date = d) => new Intl.DateTimeFormat(langue, o).format(x);
  if (unite === 'annee') return f({ year: 'numeric' });
  if (unite === 'mois') return f({ month: 'long', year: 'numeric' });
  if (unite === 'semaine') return `${f({ day: 'numeric', month: 'short' })} – ${f({ day: 'numeric', month: 'short', year: 'numeric' }, new Date(d.getTime() + 6 * 864e5))}`;
  return f({ day: 'numeric', month: 'long', year: 'numeric' });
}

/** Le libellé d'une période (`AAAA-MM-JJ`), dans la langue de l'app. */
function periode(cle: string, unite: string | undefined, langue: string): string {
  const d = new Date(`${cle}T00:00:00`);
  return Number.isNaN(d.getTime()) ? cle : new Intl.DateTimeFormat(langue, unite === 'mois' ? { month: 'short' } : { day: 'numeric', month: 'short' }).format(d);
}

type LigneDuDetail = Readonly<Record<string, unknown>> & { readonly id: string };
/** Où mène une ligne du détail : l'adresse de son écran. */
type Vers = (ligne: LigneDuDetail) => string;

/** Une valeur lue en base, écrite comme l'app l'écrit : une date se date, un montant a sa devise, un état son libellé. */
function valeurLue(table: (typeof APP.tables)[number], champ: string, v: unknown, langue: string, L: ReturnType<typeof libellesPour>): string {
  if (v === null || v === undefined || v === '') return '—';
  if (champ === 'etat') return table.cycle?.libelles[String(v)] ?? String(v);
  const c = table.champs.find((x) => x.nom === champ);
  try {
    if (c?.type === 'date' || c?.type === 'date_heure') return new Intl.DateTimeFormat(langue, { dateStyle: 'medium' }).format(new Date(String(v).length === 10 ? `${String(v)}T00:00:00` : String(v)));
    if (c?.type === 'montant' && typeof v === 'number') return new Intl.NumberFormat(langue, { style: 'currency', currency: APP.vente?.devise ?? 'EUR' }).format(v);
    if (typeof v === 'number') return new Intl.NumberFormat(langue).format(v);
  } catch { return String(v); }
  if (typeof v === 'boolean') return v ? L.oui : L.non;
  return String(v);
}

/** Les lignes qu'un chiffre compte : ce qui les nomme, ce qu'il mesure, la date qu'il lit, leur état. */
function Detail({ nom, cle, vers }: { readonly nom: NomDIndicateur; readonly cle: string | null; readonly vers?: Vers }) {
  const langue = langueCourante();
  const L = libellesPour(langue);
  const i = APP.indicateurs.find((x) => x.nom === nom)!;
  const t = APP.tables.find((x) => x.nom === i.table);
  const lu = useQuery({
    queryKey: ['base', 'detail', nom, cle],
    queryFn: async () => {
      const r = await appelerAuRelais<{ total: number; lignes: LigneDuDetail[] }>('analyser', { p: { detail: nom, ...(cle === null ? {} : { cle }) } });
      if (r.erreur || !r.donnee) throw new Error(r.erreur?.message ?? 'detail');
      return r.donnee;
    },
  });
  if (!t) return null;
  const premier = t.champs.find((c) => c.type === 'texte')?.nom;
  const colonnes = [...new Set([premier, i.champ, i.anciennete?.champ, i.periode?.champ, i.par?.date, t.cycle ? 'etat' : undefined])]
    .filter((c): c is string => Boolean(c) && (c === 'etat' || t.champs.some((x) => x.nom === c && x.type !== 'reference'))).slice(0, 5);
  const libelle = (c: string) => (c === 'etat' ? L.etat : t.champs.find((x) => x.nom === c)?.libelle ?? c);
  if (lu.isPending) return <p aria-busy className="mt-3 text-sm">…</p>;
  if (lu.isError) return <p role="alert" className="mt-3 text-sm">{L.indicateurIllisible}</p>;
  const { total, lignes } = lu.data;
  return (
    <div data-detail={nom} className="mt-3 overflow-x-auto">
      <p className="text-xs text-muted-foreground">{L.lignesDuChiffre.replace('{n}', String(total))}{total > lignes.length ? ` ${L.premieresLignes.replace('{n}', String(lignes.length))}` : ''}</p>
      {lignes.length ? (
        <table className="mt-2 w-full text-sm">
          <thead><tr>{colonnes.map((c) => <th key={c} scope="col" className="py-1 pr-3 text-left font-medium">{libelle(c)}</th>)}</tr></thead>
          <tbody>
            {lignes.map((l) => (
              <tr key={l.id} className="border-t border-bordure">
                {colonnes.map((c, k) => (
                  <td key={c} className={`py-1 pr-3 ${typeof l[c] === 'number' ? 'tabular-nums' : ''}`}>
                    {k === 0 && vers ? <Link to={vers(l)} className="underline underline-offset-4">{valeurLue(t, c, l[c], langue, L)}</Link> : valeurLue(t, c, l[c], langue, L)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </div>
  );
}

function Repartition({ nom, parts, choisir }: { readonly nom: NomDIndicateur; readonly parts: readonly Part[]; readonly choisir: (cle: string) => void }) {
  const langue = langueCourante();
  const L = libellesPour(langue);
  const i = APP.indicateurs.find((x) => x.nom === nom)!;
  const t = APP.tables.find((x) => x.nom === i.table);
  const serie = i.par?.serie;
  const nommerLaSerie = (cle: string): string => (serie === 'etat' ? t?.cycle?.libelles[cle] ?? cle
    : t?.champs.find((c) => c.nom === serie)?.type === 'booleen' ? (cle === 'true' ? L.oui : L.non) : cle);
  const forme = i.forme ?? (i.par?.date ? 'colonnes' : 'barres');
  return <Figure parts={parts} forme={forme} ecrire={(n) => ecrire(n, nom, langue)} choisir={choisir} nommerLaSerie={nommerLaSerie}
    nommer={(p) => (i.par?.date ? periode(p.cle, i.par.unite, langue) : p.libelle ?? '—')} />;
}

export function Indicateur({ nom, className, vers }: { readonly nom: NomDIndicateur; readonly className?: string; readonly vers?: Vers }) {
  const L = libellesPour(langueCourante());
  const i = APP.indicateurs.find((x) => x.nom === nom);
  const lu = useIndicateurs();
  // Le détail ouvert : `null` pour le chiffre entier, la clé d'une part ; fermé : `undefined`.
  const [ouvert, ouvrir] = useState<string | null | undefined>(undefined);
  const basculer = (cle: string | null) => ouvrir((o) => (o === cle ? undefined : cle));
  if (!i) return null;
  const brute = lu.data?.[nom] ?? null;
  const valeur = typeof brute === 'number' ? brute : null;
  const franchi = valeur !== null && i.seuil ? (i.seuil.sens === 'au_dessus' ? valeur > i.seuil.valeur : valeur < i.seuil.valeur) : false;
  return (
    <div data-indicateur={nom} data-seuil={franchi ? 'franchi' : undefined}
      className={`rounded-lg border p-4 ${franchi ? 'border-destructive' : 'border-bordure'} bg-surface ${className ?? ''}`}>
      <p className="text-sm">{i.libelle}</p>
      {i.periode && lu.data ? <p className="text-xs text-muted-foreground">{periodeRetenue(lu.data._periodes?.[nom], i.periode.unite, langueCourante())}</p> : null}
      {i.par ? (
        lu.isPending ? <p aria-busy>…</p> : Array.isArray(brute) ? (brute.length ? <Repartition nom={nom} parts={brute} choisir={basculer} /> : <p className="text-sm text-muted-foreground">—</p>) : null
      ) : (
        <button type="button" onClick={() => basculer(null)} aria-expanded={ouvert === null} title={L.voirLeDetail}
          className="text-2xl font-semibold tabular-nums underline-offset-4 hover:underline" aria-busy={lu.isPending}>
          {lu.isPending ? '…' : valeur === null ? '—' : ecrire(valeur, nom, langueCourante())}
        </button>
      )}
      {ouvert !== undefined ? <Detail nom={nom} cle={ouvert} vers={vers} /> : null}
      {lu.isError ? <p role="alert" className="text-sm">{L.indicateurIllisible}</p> : null}
      {franchi ? <p role="status" className="text-sm text-destructive">{i.seuil!.alerte}</p> : null}
    </div>
  );
}
