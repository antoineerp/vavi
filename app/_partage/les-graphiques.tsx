/**
 * Les graphiques de la console, en SVG sans bibliothèque : l'aire des visites jour par jour (chaque jour dit son nombre au
 * survol), l'anneau d'une répartition (chaque part a son mot et son nombre dans la légende, jamais la couleur seule), la
 * jauge ronde d'un quota. Une seule série par graphique : aucune légende de série, le titre du panneau la nomme.
 */
export interface Jour { readonly jour: string; readonly visites: number }

export function Aire({ serie, langue }: { readonly serie: readonly Jour[]; readonly langue: 'fr' | 'en' }) {
  const L = 600, H = 160;
  const max = Math.max(4, ...serie.map((x) => x.visites));
  const haut = Math.ceil(max / 4) * 4;
  const pas = serie.length > 1 ? L / (serie.length - 1) : 0;
  const pts = serie.map((x, i) => [i * pas, H - (x.visites / haut) * H] as const);
  const ligne = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const locale = langue === 'fr' ? 'fr-FR' : 'en-GB';
  const nom = (j: string) => new Date(`${j}T12:00:00Z`).toLocaleDateString(locale, { day: 'numeric', month: 'short' });
  const reperes = serie.map((x, i) => ({ ...x, i })).filter((x) => (serie.length - 1 - x.i) % 7 === 0);
  return (
    <div className="aire">
      <div className="aire-axe" aria-hidden="true">{[haut, haut / 2, 0].map((v) => <span key={v}>{v}</span>)}</div>
      <div className="aire-trace">
        <div className="aire-grille" aria-hidden="true"><span /><span /><span /></div>
        <svg viewBox={`0 0 ${L} ${H}`} preserveAspectRatio="none" role="img" aria-label={serie.map((x) => `${x.jour} : ${x.visites}`).join(', ')}>
          <defs><linearGradient id="aire-fond" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="currentColor" stopOpacity="0.32" /><stop offset="1" stopColor="currentColor" stopOpacity="0" /></linearGradient></defs>
          {pts.length > 0 && <polygon points={`0,${H} ${ligne} ${L},${H}`} fill="url(#aire-fond)" />}
          <polyline points={ligne} fill="none" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        </svg>
        <div className="aire-survol">
          {serie.map((x, i) => (
            <span key={x.jour} style={{ ['--y' as string]: `${(pts[i]![1] / H) * 100}%` }} tabIndex={-1}>
              <i className="aire-point" /><b className="aire-bulle">{nom(x.jour)} · <strong>{x.visites}</strong></b>
            </span>
          ))}
        </div>
      </div>
      <div className="aire-jours" aria-hidden="true">{reperes.map((x) => <span key={x.jour} style={{ left: `${(x.i / Math.max(1, serie.length - 1)) * 100}%` }}>{nom(x.jour)}</span>)}</div>
    </div>
  );
}

export interface Part { readonly nom: string; readonly valeur: number; readonly classe: string }

export function Anneau({ parts, centre, sousCentre }: { readonly parts: readonly Part[]; readonly centre: string; readonly sousCentre: string }) {
  const total = parts.reduce((n, p) => n + p.valeur, 0);
  const r = 52, tour = 2 * Math.PI * r, ecart = total > 1 ? 3 : 0;
  let deja = 0;
  return (
    <div className="anneau">
      <svg viewBox="0 0 140 140" role="img" aria-label={parts.map((p) => `${p.nom} : ${p.valeur}`).join(', ')}>
        <circle cx="70" cy="70" r={r} className="anneau-fond" />
        {total > 0 && parts.filter((p) => p.valeur > 0).map((p) => {
          const long = (p.valeur / total) * tour;
          const el = <circle key={p.nom} cx="70" cy="70" r={r} className={`anneau-part ${p.classe}`} strokeDasharray={`${Math.max(0, long - ecart)} ${tour}`} strokeDashoffset={-deja} transform="rotate(-90 70 70)"><title>{`${p.nom} : ${p.valeur}`}</title></circle>;
          deja += long;
          return el;
        })}
      </svg>
      <div className="anneau-centre"><strong>{centre}</strong><span>{sousCentre}</span></div>
    </div>
  );
}

export function Legende({ parts }: { readonly parts: readonly Part[] }) {
  return <ul className="legende">{parts.map((p) => <li key={p.nom}><span className={`diode ${p.classe}`} aria-hidden="true" />{p.nom}<strong>{p.valeur}</strong></li>)}</ul>;
}

/** Une jauge ronde : `valeur` sur `max` (max 0 : rien de compris, l'anneau reste vide). */
export function JaugeRonde({ valeur, max, centre, sousCentre }: { readonly valeur: number; readonly max: number; readonly centre: string; readonly sousCentre: string }) {
  const r = 52, tour = 2 * Math.PI * r;
  const part = max > 0 ? Math.min(1, valeur / max) : 0;
  return (
    <div className="anneau">
      <svg viewBox="0 0 140 140" role="meter" aria-valuemin={0} aria-valuemax={max} aria-valuenow={valeur} aria-label={`${valeur} / ${max}`}>
        <circle cx="70" cy="70" r={r} className="anneau-fond" />
        {part > 0 && <circle cx="70" cy="70" r={r} className={`anneau-part ${valeur > max ? 'ambre' : 'accent'}`} strokeDasharray={`${part * tour} ${tour}`} transform="rotate(-90 70 70)" />}
      </svg>
      <div className="anneau-centre"><strong>{centre}</strong><span>{sousCentre}</span></div>
    </div>
  );
}
/** Une courbe d’une ligne pour une cellule : chaque point dit son jour et son nombre au survol. */
export function Courbe({ serie, largeur = 120, hauteur = 32 }: { readonly serie: readonly { readonly jour: string; readonly visites: number }[]; readonly largeur?: number; readonly hauteur?: number }) {
  if (serie.length === 0) return null;
  const max = Math.max(1, ...serie.map((x) => x.visites));
  const pas = serie.length > 1 ? (largeur - 6) / (serie.length - 1) : 0;
  const pts = serie.map((x, i) => [3 + i * pas, hauteur - 3 - (x.visites / max) * (hauteur - 8)] as const);
  const ligne = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const aire = `${pts[0]![0].toFixed(1)},${hauteur} ${ligne} ${pts[pts.length - 1]![0].toFixed(1)},${hauteur}`;
  const [dx, dy] = pts[pts.length - 1]!;
  return (
    <svg className="courbe" width={largeur} height={hauteur} viewBox={`0 0 ${largeur} ${hauteur}`} role="img" aria-label={serie.map((x) => `${x.jour} : ${x.visites}`).join(', ')}>
      <polygon points={aire} className="courbe-aire" />
      <polyline points={ligne} className="courbe-ligne" />
      <circle cx={dx} cy={dy} r={3} className="courbe-point" />
      {pts.map(([x], i) => (
        <rect key={serie[i]!.jour} x={x - pas / 2} y={0} width={Math.max(pas, 6)} height={hauteur} fill="transparent"><title>{`${serie[i]!.jour} : ${serie[i]!.visites}`}</title></rect>
      ))}
    </svg>
  );
}
