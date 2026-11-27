/**
 * LES FIGURES QUI MANQUAIENT AUX TABLEAUX DE BORD (Antoine, 27/11 : « pour les apps métier on avait tous les graphiques
 * financiers modernes, des Gantt… ») : l'aire empilée, le cumul, la cascade (ce que chaque période ajoute ou retire), la
 * carte de chaleur, la tuile (le dernier chiffre, sa variation et sa petite courbe), l'entonnoir. Ce qu'elles remplacent :
 * quatre dessins seulement (colonnes, courbe, barres, anneau), si bien que tout tableau de bord se ressemblait. Elles
 * dessinent ce que la base a calculé ; la page ne calcule rien (le cumul et la cascade ne font que poser bout à bout les
 * valeurs reçues).
 */
import type { FigureProps, Part } from './figures';

import { couleur } from './figures';
const L = 600, H = 180, M = 8;
const titre = (p: FigureProps, x: Part) => `${p.nommer(x)} : ${x.valeur === null ? '—' : p.ecrire(x.valeur)}`;
const modalitesDe = (parts: readonly Part[]): readonly string[] => parts.find((p) => p.series?.length)?.series?.map((x) => x.cle) ?? [];

function Axe({ parts, nommer, choisir }: Pick<FigureProps, 'parts' | 'nommer' | 'choisir'>) {
  return (
    <div className="flex justify-between gap-1">
      {parts.map((p) => <button type="button" key={p.cle} onClick={() => choisir(p.cle)} className="min-w-0 flex-1 truncate text-center text-xs text-muted-foreground hover:text-foreground">{nommer(p)}</button>)}
    </div>
  );
}

/** L'aire : une surface par modalité, empilées ; sans série, la surface du chiffre sous sa courbe. */
export function Aire(props: FigureProps) {
  const { parts, ecrire } = props;
  const modalites = modalitesDe(parts);
  const couches = modalites.length ? modalites.map((m) => parts.map((p) => p.series?.find((x) => x.cle === m)?.valeur ?? 0)) : [parts.map((p) => p.valeur ?? 0)];
  const sommes = parts.map((_, i) => couches.reduce((n, c) => n + Math.max(0, c[i] ?? 0), 0));
  const haut = Math.max(1, ...sommes);
  const x = (i: number) => M + (parts.length < 2 ? (L - 2 * M) / 2 : (i * (L - 2 * M)) / (parts.length - 1));
  const y = (v: number) => H - M - (v / haut) * (H - 2 * M);
  const bas = parts.map(() => 0);
  const formes = couches.map((c) => {
    const dessous = [...bas];
    c.forEach((v, i) => { bas[i] = (bas[i] ?? 0) + Math.max(0, v); });
    return { dessus: [...bas], dessous };
  });
  return (
    <div className="mt-3">
      <p className="text-xs tabular-nums text-muted-foreground">{ecrire(haut)}</p>
      <svg viewBox={`0 0 ${L} ${H}`} className="h-44 w-full" preserveAspectRatio="none" role="img" aria-label={parts.map((p) => titre(props, p)).join(', ')}>
        {formes.map((f, k) => (
          <g key={k}>
            <polygon fill={couleur(k)} fillOpacity={0.22}
              points={[...f.dessus.map((v, i) => `${x(i)},${y(v)}`), ...f.dessous.map((v, i) => `${x(i)},${y(v)}`).reverse()].join(' ')} />
            <polyline fill="none" stroke={couleur(k)} strokeWidth={2} vectorEffect="non-scaling-stroke" points={f.dessus.map((v, i) => `${x(i)},${y(v)}`).join(' ')} />
          </g>
        ))}
      </svg>
      <Axe {...props} />
    </div>
  );
}

/** Le cumul : la courbe de la somme depuis la première période, la dernière valeur dite. */
export function Cumul(props: FigureProps) {
  let n = 0;
  const cumulees = props.parts.map((p) => ({ ...p, valeur: (n += p.valeur ?? 0), series: undefined }));
  return (
    <div>
      <p className="mt-2 text-2xl font-semibold tabular-nums">{props.ecrire(n)}</p>
      <Aire {...props} parts={cumulees} />
    </div>
  );
}

/** La cascade : chaque période part du total d'avant et ajoute (accent) ou retire (rouge) sa valeur ; la dernière barre est le total. */
export function Cascade(props: FigureProps) {
  const { parts, ecrire, choisir } = props;
  let n = 0;
  const pas = parts.map((p) => { const de = n; n += p.valeur ?? 0; return { p, de, a: n }; });
  const bornes = [0, ...pas.flatMap((s) => [s.de, s.a])];
  const min = Math.min(...bornes), max = Math.max(...bornes), etendue = Math.max(1, max - min);
  const y = (v: number) => ((max - v) / etendue) * 100;
  return (
    <div className="mt-3">
      <div className="relative flex h-44 items-stretch gap-1.5">
        {[...pas, { p: null, de: 0, a: n }].map((s, i) => {
          const haut = y(Math.max(s.de, s.a)), taille = Math.max(0.8, Math.abs(y(s.a) - y(s.de)));
          const baisse = s.p !== null && s.a < s.de;
          return (
            <button type="button" key={s.p?.cle ?? 'total'} disabled={!s.p} onClick={() => s.p && choisir(s.p.cle)} title={s.p ? titre(props, s.p) : ecrire(s.a)}
              className="relative min-w-0 flex-1" aria-label={s.p ? titre(props, s.p) : ecrire(s.a)}>
              <span className="absolute inset-x-0 rounded-sm" style={{ top: `${haut}%`, height: `${taille}%`,
                background: s.p === null ? 'var(--ancre)' : baisse ? 'var(--color-destructive)' : 'var(--accent)', opacity: s.p === null ? 0.85 : 1 }} />
              {i < pas.length ? <span className="absolute inset-x-[-3px] border-t border-dashed border-bordure" style={{ top: `${y(s.a)}%` }} aria-hidden /> : null}
            </button>
          );
        })}
      </div>
      <div className="mt-1 flex gap-1.5">
        {parts.map((p) => <span key={p.cle} className="min-w-0 flex-1 truncate text-center text-xs text-muted-foreground">{props.nommer(p)}</span>)}
        <span className="min-w-0 flex-1 truncate text-center text-xs font-medium">{ecrire(n)}</span>
      </div>
    </div>
  );
}

/** La carte de chaleur : une case par période (et par modalité de la série), plus foncée quand le chiffre est plus grand. */
export function Chaleur(props: FigureProps) {
  const { parts, ecrire, nommer, nommerLaSerie, choisir } = props;
  const modalites = modalitesDe(parts);
  const rangs = modalites.length ? modalites.map((m) => ({ nom: nommerLaSerie(m), valeurs: parts.map((p) => p.series?.find((x) => x.cle === m)?.valeur ?? null) }))
    : [{ nom: '', valeurs: parts.map((p) => p.valeur) }];
  const haut = Math.max(1, ...rangs.flatMap((r) => r.valeurs.map((v) => v ?? 0)));
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full table-fixed border-separate border-spacing-0.5 text-xs">
        <tbody>
          {rangs.map((r) => (
            <tr key={r.nom}>
              {modalites.length ? <th scope="row" className="w-20 truncate pr-2 text-left font-normal text-muted-foreground">{r.nom}</th> : null}
              {r.valeurs.map((v, i) => (
                <td key={parts[i]!.cle} className="p-0">
                  <button type="button" onClick={() => choisir(parts[i]!.cle)} title={`${nommer(parts[i]!)}${r.nom ? ` · ${r.nom}` : ''} : ${v === null ? '—' : ecrire(v)}`}
                    className="block h-7 w-full min-w-2.5 rounded-[3px]"
                    style={{ background: v ? `color-mix(in oklch, var(--accent) ${Math.round(12 + (v / haut) * 88)}%, var(--color-surface))` : 'var(--color-muted)' }} />
                </td>
              ))}
            </tr>
          ))}
          <tr>
            {modalites.length ? <td className="w-20" /> : null}
            {parts.map((p, i) => <td key={p.cle} className="whitespace-nowrap text-left text-muted-foreground">{i % Math.ceil(parts.length / 4) === 0 ? nommer(p) : ''}</td>)}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/** La tuile : le chiffre de la dernière période en grand, sa variation sur la précédente, et sa petite courbe. */
export function Tuile(props: FigureProps) {
  const { parts, ecrire, choisir } = props;
  const dernier = parts[parts.length - 1], avant = parts[parts.length - 2];
  const v = dernier?.valeur ?? null, w = avant?.valeur ?? null;
  const variation = v !== null && w !== null && w !== 0 ? ((v - w) / Math.abs(w)) * 100 : null;
  const valeurs = parts.map((p) => p.valeur ?? 0);
  const haut = Math.max(1, ...valeurs), bas = Math.min(0, ...valeurs);
  const pts = valeurs.map((x, i) => `${(i / Math.max(1, valeurs.length - 1)) * 100},${30 - ((x - bas) / Math.max(1, haut - bas)) * 28}`).join(' ');
  return (
    <button type="button" onClick={() => dernier && choisir(dernier.cle)} className="mt-1 flex w-full items-end justify-between gap-4 text-left">
      <span>
        <span className="block text-3xl font-semibold tabular-nums tracking-tight">{v === null ? '—' : ecrire(v)}</span>
        {variation !== null ? (
          <span className={`text-sm tabular-nums ${variation < 0 ? 'text-destructive' : 'text-accent-texte'}`}>{variation >= 0 ? '▲' : '▼'} {Math.abs(variation).toFixed(Math.abs(variation) < 10 ? 1 : 0)} %{avant ? ` · ${props.nommer(avant)}` : ''}</span>
        ) : null}
      </span>
      <svg viewBox="0 0 100 32" className="h-10 w-28 shrink-0" preserveAspectRatio="none" aria-hidden>
        <polygon points={`0,32 ${pts} 100,32`} fill="var(--accent)" fillOpacity={0.15} />
        <polyline points={pts} fill="none" stroke="var(--accent)" strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

/** L'entonnoir : chaque modalité, dans l'ordre d'app.json, en barre centrée qui rétrécit, son chiffre et sa part de la première. */
export function Entonnoir(props: FigureProps) {
  const { parts, ecrire, nommer, choisir } = props;
  const premier = parts[0]?.valeur ?? 0;
  const haut = Math.max(1, ...parts.map((p) => p.valeur ?? 0));
  return (
    <ul className="mt-3 space-y-1">
      {parts.map((p, k) => (
        <li key={p.cle}>
          <button type="button" onClick={() => choisir(p.cle)} title={titre(props, p)} className="grid w-full grid-cols-[minmax(0,7rem)_1fr_auto] items-center gap-3 text-left text-sm">
            <span className="truncate text-muted-foreground">{nommer(p)}</span>
            <span className="flex h-8 justify-center"><span className="h-full rounded" style={{ width: `${Math.max(3, ((p.valeur ?? 0) / haut) * 100)}%`, background: `color-mix(in oklch, var(--accent) ${100 - k * Math.floor(55 / Math.max(1, parts.length - 1))}%, var(--fond))` }} /></span>
            <span className="text-right tabular-nums"><span className="font-semibold">{p.valeur === null ? '—' : ecrire(p.valeur)}</span>{k > 0 && premier ? <span className="ml-2 text-xs text-muted-foreground">{Math.round(((p.valeur ?? 0) / premier) * 100)} %</span> : null}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
