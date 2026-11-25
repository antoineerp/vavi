/** /projets/<id>/secrets — les clés secrètes de l'app : posées ici, chiffrées, leurs noms seuls montrés. */
import { poserUnSecret } from '../gestes';
import { leProjet, ERREURS } from '../le-projet';

export const dynamic = 'force-dynamic';

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params;
  const q = await searchParams;
  const { c, t } = await leProjet(id, 'secrets');
  const secrets = await c.projets.nomsDesSecrets(c.compte, id);
  const message = q.fait === 'secret' && q.nom ? t.secretPose(q.nom) : q.erreur ? `${t.erreur} ${ERREURS[q.erreur]?.[c.langue] ?? q.erreur}` : null;
  return (
    <main className="console">
      <h1>{t.secrets}</h1>
      <p className="attenue">{t.secretsExplication}</p>
      {message && <div className="carte" role="status">{message}</div>}
      <div className="carte">
        {secrets.lu && secrets.valeur.length > 0 ? <ul className="liste">{secrets.valeur.map((n) => <li key={n}><code>{n}</code></li>)}</ul> : <p className="attenue">{t.aucunSecret}</p>}
        <form action={poserUnSecret.bind(null, id)} autoComplete="off">
          <label htmlFor="nom">{t.nom}</label>
          <input id="nom" name="nom" required pattern="[A-Z][A-Z0-9_]{1,63}" />
          <label htmlFor="valeur">{t.valeur}</label>
          <input id="valeur" name="valeur" type="password" required />
          <button type="submit">{t.poser}</button>
        </form>
      </div>
    </main>
  );
}
