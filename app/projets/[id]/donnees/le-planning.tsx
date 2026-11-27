/** Le planning d'une table à période, dans « Données » : la semaine, une rangée par ressource (`lib/donnees/le-planning`). */
import Link from 'next/link';
import { leNomDUneLigne, type TableDeLaConsole } from '@/lib/donnees/les-donnees';
import type { Planning } from '@/lib/donnees/le-planning';
import { laCellule, type Mots, type References } from './la-cellule';

export function LePlanning({ planning, t, m, langue, references, lien, semaine, aujourdhui }: { planning: Planning; t: TableDeLaConsole; m: Mots; langue: 'fr' | 'en'; references: References;
  lien: (o: Record<string, string>) => string; semaine: (n: number) => string; aujourdhui: string }) {
  const locale = langue === 'fr' ? 'fr-FR' : 'en-GB';
  const jour = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  const ressource = t.periode?.ressource ? t.colonnes.find((c) => c.nom === t.periode!.ressource) : undefined;
  const nom = (cle: string | null): string => (cle === null ? t.libelle : cle === '' ? m.sansRessource : ressource ? laCellule(ressource, cle, references, langue) : cle);
  const vide = planning.rangees.every((r) => r.jours.every((j) => j.length === 0));
  return (
    <>
      <div className="ligne" style={{ justifyContent: 'space-between' }}>
        <div className="ligne">
          <Link className="bouton discret" href={semaine(-1)}>{m.semainePrecedente}</Link>
          <Link className="bouton discret" href={aujourdhui}>{m.cetteSemaine}</Link>
          <Link className="bouton discret" href={semaine(1)}>{m.semaineSuivante}</Link>
        </div>
        <span className="attenue">{m.semaineDu(jour(planning.jours[0]!), jour(planning.jours[6]!))}</span>
      </div>
      {vide && <p className="attenue">{m.semaineVide}</p>}
      <div style={{ overflowX: 'auto' }}>
        <table className="tableau">
          <thead><tr>{ressource && <th>{ressource.libelle}</th>}{planning.jours.map((d) => <th key={d}>{jour(d)}</th>)}</tr></thead>
          <tbody>
            {planning.rangees.map((r) => (
              <tr key={r.cle ?? '_'}>
                {ressource && <th scope="row">{nom(r.cle)}</th>}
                {r.jours.map((occ, i) => (
                  <td key={planning.jours[i]} style={{ verticalAlign: 'top', minWidth: '9rem', whiteSpace: 'normal' }}>
                    {occ.map((o) => (
                      <div key={o.id} style={{ marginBottom: '0.35rem', ...(o.rendue ? { textDecoration: 'line-through', opacity: 0.6 } : {}) }}>
                        <Link href={lien({ ligne: o.id })}>{o.heures ? <span className="attenue">{o.heures} </span> : null}{leNomDUneLigne(t, o.ligne)}</Link>
                        {t.cycle && <span className="attenue"> · {t.cycle.libelles[String(o.ligne.etat)] ?? String(o.ligne.etat ?? '')}</span>}
                      </div>
                    ))}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
