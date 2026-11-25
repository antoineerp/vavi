/** /projets/<id>/versions — chaque version du projet et « Revenir à cet état » (une nouvelle version, rien de perdu). */
import { revenir } from '../gestes';
import { leProjet, ERREURS } from '../le-projet';

export const dynamic = 'force-dynamic';

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params;
  const q = await searchParams;
  const { c, t, p, date } = await leProjet(id, 'versions');
  const versions = await c.projets.versions(c.compte, id, 50);
  const message = q.fait === 'revenu' ? `${t.revenu(Number(q.version))}${q.construire ? ` ${t.aConstruire}` : ''}` : q.erreur ? `${t.erreur} ${ERREURS[q.erreur]?.[c.langue] ?? q.erreur}` : null;
  return (
    <main className="console">
      <h1>{t.versions}</h1>
      <p className="attenue">{t.revenirExplication}</p>
      {message && <div className="carte" role="status">{message}</div>}
      {!versions.lu ? <p role="alert">{t.erreur} {versions.pourquoi}</p> : (
        <ul className="liste carte">
          {versions.valeur.map((v) => (
            <li key={v.numero}>
              <div><strong>{v.numero}</strong> · {v.pourquoi} <span className="attenue">— {date(v.creeLe)}</span></div>
              {p.lu && v.numero !== p.valeur!.version && <form action={revenir.bind(null, id, v.numero)}><button type="submit" className="discret">{t.revenir}</button></form>}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
