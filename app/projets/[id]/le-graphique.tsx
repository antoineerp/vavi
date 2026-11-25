/** Les visites jour par jour, en barres : chaque jour de la période, même sans visite (0). */
export function GraphiqueDesJours({ parJour, jours, langue }: { readonly parJour: readonly { readonly jour: string; readonly visites: number }[]; readonly jours: number; readonly langue: 'fr' | 'en' }) {
  const vus = new Map(parJour.map((x) => [x.jour, x.visites]));
  const serie = Array.from({ length: jours }, (_, i) => {
    const d = new Date(Date.now() - (jours - 1 - i) * 86_400_000);
    const jour = d.toISOString().slice(0, 10);
    return { jour, visites: vus.get(jour) ?? 0, nom: jours <= 7 ? d.toLocaleDateString(langue === 'fr' ? 'fr-FR' : 'en-GB', { weekday: 'short' }) : String(d.getDate()) };
  });
  const max = Math.max(1, ...serie.map((x) => x.visites));
  return (
    <div className="graphique" role="img" aria-label={serie.map((x) => `${x.jour} : ${x.visites}`).join(', ')}>
      {serie.map((x) => (
        <div key={x.jour} className="graphique-jour">
          <span className="graphique-nombre">{x.visites}</span>
          <span className="graphique-barre" style={{ height: `${Math.max(2, (x.visites / max) * 100)}%` }} />
          <span className="graphique-nom">{x.nom}</span>
        </div>
      ))}
    </div>
  );
}
