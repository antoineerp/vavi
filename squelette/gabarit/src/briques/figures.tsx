/**
 * Les figures d'un chiffre réparti, dessinées avec les jetons de la direction : des colonnes dans le temps, empilées quand le
 * chiffre se partage entre les modalités d'une série ; une courbe, une par modalité ; des barres par un champ, empilées, ou
 * des jauges contre un objectif ; un anneau des parts d'un tout. Chaque part s'ouvre au clic sur les lignes qu'elle compte.
 *
 * Ce qu'il remplace (interdit 9) : un seul dessin pour tout chiffre réparti, des barres ; les courbes, l'anneau et les
 * colonnes empilées des figures de l'ancien générateur n'avaient pas été reprises.
 */
import type { ReactNode } from 'react';
import { Aire, Cascade, Chaleur, Cumul, Entonnoir, Tuile } from './figures-de-plus';

export interface Part {
  readonly cle: string; readonly libelle: string | null; readonly valeur: number | null; readonly objectif?: number | null;
  readonly series?: readonly { readonly cle: string; readonly valeur: number | null }[];
}
export type Forme = 'colonnes' | 'courbe' | 'aire' | 'cumul' | 'cascade' | 'chaleur' | 'tuile' | 'barres' | 'anneau' | 'entonnoir';

export interface FigureProps {
  readonly parts: readonly Part[];
  readonly forme: Forme;
  /** Un chiffre écrit comme l'app l'écrit (sa devise, ses décimales). */
  readonly ecrire: (n: number) => string;
  /** Le nom d'une part : sa période, sa ligne, sa valeur. */
  readonly nommer: (p: Part) => string;
  /** Le nom d'une modalité de la série. */
  readonly nommerLaSerie: (cle: string) => string;
  readonly choisir: (cle: string) => void;
}

/**
 * La couleur de la `k`-ième modalité, tirée de la direction : l'accent, la seconde teinte, l'ancre, puis leurs tons
 * éclaircis. Ce qu'elle remplace : des teintes qui tournaient autour de l'accent et tombaient sur le violet, banni.
 */
export const couleur = (k: number): string => {
  const base = ['var(--accent)', 'var(--seconde)', 'var(--ancre)'][k % 3]!;
  const tour = Math.floor(k / 3);
  return tour === 0 ? base : `color-mix(in oklch, ${base} ${Math.max(30, 100 - tour * 30)}%, var(--fond))`;
};

const modalitesDe = (parts: readonly Part[]): readonly string[] => parts.find((p) => p.series?.length)?.series?.map((x) => x.cle) ?? [];

function Legende({ modalites, nommer }: { readonly modalites: readonly string[]; readonly nommer: (cle: string) => string }) {
  if (modalites.length === 0) return null;
  return (
    <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {modalites.map((m, k) => (
        <li key={m} className="flex items-center gap-1.5"><span aria-hidden className="size-2.5 rounded-sm" style={{ background: couleur(k) }} />{nommer(m)}</li>
      ))}
    </ul>
  );
}

/** Les morceaux d'une part : ses modalités, ou elle seule. */
const morceaux = (p: Part): readonly { readonly k: number; readonly valeur: number }[] => (p.series?.length
  ? p.series.map((x, k) => ({ k, valeur: x.valeur ?? 0 })) : [{ k: 0, valeur: p.valeur ?? 0 }]);

function Colonnes({ parts, ecrire, nommer, choisir }: FigureProps) {
  const haut = Math.max(1, ...parts.map((p) => p.valeur ?? 0));
  return (
    <div className="mt-3 flex h-40 items-end gap-2" role="list">
      {parts.map((p) => (
        <button type="button" key={p.cle} role="listitem" onClick={() => choisir(p.cle)} title={`${nommer(p)} : ${p.valeur === null ? '—' : ecrire(p.valeur)}`}
          className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
          <span className="w-full truncate text-center text-xs tabular-nums">{p.valeur ? ecrire(p.valeur) : ''}</span>
          <div className="flex min-h-0 w-full flex-1 flex-col justify-end">
            <div className="flex w-full flex-col-reverse overflow-hidden rounded-t" style={{ height: `${((p.valeur ?? 0) / haut) * 100}%`, minHeight: p.valeur ? 2 : 0 }}>
              {morceaux(p).map((x) => <div key={x.k} style={{ flexGrow: x.valeur, background: couleur(x.k) }} />)}
            </div>
          </div>
          <span className="w-full truncate text-center text-xs text-muted-foreground">{nommer(p)}</span>
        </button>
      ))}
    </div>
  );
}

const LARGEUR = 600, HAUTEUR = 180, MARGE = 8;

function Courbe({ parts, ecrire, nommer, choisir }: FigureProps) {
  const modalites = modalitesDe(parts);
  const lignes = modalites.length ? modalites.map((m) => parts.map((p) => p.series?.find((x) => x.cle === m)?.valeur ?? null)) : [parts.map((p) => p.valeur)];
  const haut = Math.max(1, ...lignes.flat().map((v) => v ?? 0));
  const x = (i: number) => MARGE + (parts.length < 2 ? (LARGEUR - 2 * MARGE) / 2 : (i * (LARGEUR - 2 * MARGE)) / (parts.length - 1));
  const y = (v: number) => HAUTEUR - MARGE - (v / haut) * (HAUTEUR - 2 * MARGE);
  return (
    <div className="mt-3">
      <div className="flex justify-between text-xs tabular-nums text-muted-foreground"><span>{ecrire(haut)}</span></div>
      <svg viewBox={`0 0 ${LARGEUR} ${HAUTEUR}`} className="h-44 w-full" preserveAspectRatio="none" role="img" aria-label={parts.map((p) => `${nommer(p)} : ${p.valeur === null ? '—' : ecrire(p.valeur)}`).join(', ')}>
        {[0, 0.5, 1].map((f) => <line key={f} x1={0} x2={LARGEUR} y1={y(haut * f)} y2={y(haut * f)} stroke="var(--bordure)" strokeWidth={1} vectorEffect="non-scaling-stroke" />)}
        {lignes.map((l, k) => (
          <polyline key={k} fill="none" stroke={couleur(k)} strokeWidth={2.5} vectorEffect="non-scaling-stroke" strokeLinejoin="round"
            points={l.map((v, i) => (v === null ? null : `${x(i)},${y(v)}`)).filter(Boolean).join(' ')} />
        ))}
      </svg>
      <div className="flex justify-between gap-1">
        {parts.map((p) => (
          <button type="button" key={p.cle} onClick={() => choisir(p.cle)} className="min-w-0 flex-1 truncate text-center text-xs text-muted-foreground hover:text-foreground"
            title={`${nommer(p)} : ${p.valeur === null ? '—' : ecrire(p.valeur)}`}>{nommer(p)}</button>
        ))}
      </div>
    </div>
  );
}

function Barres({ parts, ecrire, nommer, choisir }: FigureProps) {
  const haut = Math.max(1, ...parts.map((p) => Math.max(p.valeur ?? 0, p.objectif ?? 0)));
  return (
    <ul className="mt-3 space-y-3">
      {parts.map((p) => {
        const depasse = p.objectif != null && p.valeur != null && p.valeur > p.objectif;
        const largeur = Math.min(100, ((p.valeur ?? 0) / (p.objectif || haut)) * 100);
        return (
          <li key={p.cle}>
            <button type="button" onClick={() => choisir(p.cle)} className="flex w-full justify-between gap-2 text-left text-sm">
              <span className="min-w-0 truncate">{nommer(p)}</span>
              <span className={`shrink-0 tabular-nums ${depasse ? 'text-destructive' : ''}`}>
                {p.valeur === null ? '—' : ecrire(p.valeur)}{p.objectif != null ? ` / ${ecrire(p.objectif)}` : ''}
              </span>
            </button>
            <div className="mt-1 h-2 rounded bg-muted" aria-hidden>
              <div className="flex h-2 overflow-hidden rounded" style={{ width: `${largeur}%` }}>
                {depasse ? <div className="grow bg-destructive" /> : morceaux(p).map((x) => <div key={x.k} style={{ flexGrow: x.valeur, background: couleur(x.k) }} />)}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function Anneau({ parts, ecrire, nommer, choisir }: FigureProps) {
  const total = parts.reduce((n, p) => n + Math.max(0, p.valeur ?? 0), 0);
  const R = 15.915;
  let avant = 0;
  return (
    <div className="mt-3 flex flex-col items-center gap-4 sm:flex-row">
      <div className="relative size-36 shrink-0">
        <svg viewBox="0 0 42 42" className="size-full -rotate-90" role="img" aria-label={parts.map((p) => `${nommer(p)} : ${p.valeur === null ? '—' : ecrire(p.valeur)}`).join(', ')}>
          <circle cx={21} cy={21} r={R} fill="none" stroke="var(--color-muted)" strokeWidth={6} />
          {total > 0 ? parts.map((p, k) => {
            const part = (Math.max(0, p.valeur ?? 0) / total) * 100;
            const arc = <circle key={p.cle} cx={21} cy={21} r={R} fill="none" stroke={couleur(k)} strokeWidth={6} strokeDasharray={`${part} ${100 - part}`} strokeDashoffset={-avant} />;
            avant += part;
            return arc;
          }) : null}
        </svg>
        <p className="absolute inset-0 grid place-items-center text-sm font-semibold tabular-nums">{ecrire(total)}</p>
      </div>
      <ul className="w-full space-y-1 text-sm">
        {parts.map((p, k) => (
          <li key={p.cle}>
            <button type="button" onClick={() => choisir(p.cle)} className="flex w-full items-center gap-2 text-left">
              <span aria-hidden className="size-2.5 shrink-0 rounded-sm" style={{ background: couleur(k) }} />
              <span className="min-w-0 flex-1 truncate">{nommer(p)}</span>
              <span className="tabular-nums">{p.valeur === null ? '—' : ecrire(p.valeur)}</span>
              <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">{total > 0 && p.valeur ? `${Math.round((p.valeur / total) * 100)} %` : ''}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

const FIGURES: Readonly<Record<Forme, (p: FigureProps) => ReactNode>> = { colonnes: Colonnes, courbe: Courbe, aire: Aire, cumul: Cumul, cascade: Cascade, chaleur: Chaleur, tuile: Tuile, barres: Barres, anneau: Anneau, entonnoir: Entonnoir };

/** La figure d'un chiffre réparti, et la légende de sa série. */
export function Figure(props: FigureProps) {
  const Dessin = FIGURES[props.forme];
  return (
    <div data-forme={props.forme}>
      <Dessin {...props} />
      {!['anneau', 'tuile', 'entonnoir', 'chaleur', 'cumul', 'cascade'].includes(props.forme) ? <Legende modalites={modalitesDe(props.parts)} nommer={props.nommerLaSerie} /> : null}
    </div>
  );
}
