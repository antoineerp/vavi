/**
 * Une courbe d'une ligne, pour une cellule ou un indicateur : les visites jour par jour, chaque jour de la période même
 * sans visite (0). Chaque point dit son jour et son nombre au survol ; l'ensemble est lu par `aria-label`. Une seule série,
 * dans la couleur d'accent : aucune légende (le titre de la colonne la nomme).
 */
export function lesJours(parJour: readonly { readonly jour: string; readonly visites: number }[], jours: number, maintenant = Date.now()): { jour: string; visites: number }[] {
  const vus = new Map(parJour.map((x) => [x.jour, x.visites]));
  return Array.from({ length: jours }, (_, i) => {
    const jour = new Date(maintenant - (jours - 1 - i) * 86_400_000).toISOString().slice(0, 10);
    return { jour, visites: vus.get(jour) ?? 0 };
  });
}

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
