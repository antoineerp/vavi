/**
 * /projets/<id>/donnees — le « backend » de l'app : ses tables (d'app.json), leurs lignes, cherchées et paginées ; ajouter,
 * modifier, supprimer une ligne, exporter une table en CSV. Remplace dans vavi l'explorateur de données du tableau de bord
 * de constructor-v13 (`components/dashboard/DataExplorer.tsx`).
 */
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { enTexte, leNomDUneLigne, seModifie, type Colonne, type TableDeLaConsole } from '@/lib/donnees/les-donnees';
import type { Ligne } from '@/lib/donnees/sur-supabase';
import { leProjet } from './le-projet';
import { enregistrer, importer, supprimer } from './gestes';
import { MOTS } from './textes';

export const dynamic = 'force-dynamic';
const PAR_PAGE = 50;
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params;
  const q = await searchParams;
  if (!ID.test(id)) notFound();
  const p = await leProjet(id);
  const m = MOTS[p.langue];
  const haut = null;
  if (!p.ok) {
    if (p.pourquoi === 'inconnu') notFound();
    return <main className="console">{haut}<h1>{m.titre}</h1><p role="alert">{m.erreurs[p.pourquoi]}{p.detail ? ` (${p.detail})` : ''}</p></main>;
  }
  if (p.tables.length === 0) return <main className="console">{haut}<h1>{m.titre}</h1><p>{m.sansTable}</p></main>;
  const t = p.tables.find((x) => x.nom === q.table) ?? p.tables[0]!;
  const page = Math.max(0, Number.parseInt(q.page ?? '0', 10) || 0);
  const cherche = (q.q ?? '').slice(0, 200);
  const [lues, references, totaux] = await Promise.all([
    p.donnees.lire(p.schema, t.nom, { cherche, decalage: page * PAR_PAGE, limite: PAR_PAGE }),
    lesReferences(p, t),
    // Le nombre de lignes de chaque table, au menu des tables (comme l'explorateur de constructor).
    Promise.all(p.tables.map(async (x) => { const l = await p.donnees.lire(p.schema, x.nom, { limite: 1 }); return [x.nom, l.lu ? l.valeur.total : null] as const; })).then((e) => new Map(e)),
  ]);
  const enCours = q.ligne && ID.test(q.ligne) && lues.lu ? lues.valeur.lignes.find((l) => l.id === q.ligne) ?? null : null;
  const formulaire = q.nouvelle === '1' ? 'nouvelle' : enCours ? 'modifier' : null;
  const importees = Number.parseInt(q.importees ?? '0', 10) || 0;
  const message = q.fait === 'importees' ? `${m.importees(importees)}${q.ignorees ? ` ${m.ignorees} ${q.ignorees}.` : ''}`
    : q.fait ? m.fait[q.fait]
    : q.erreur === 'import_coupe' ? `${m.importCoupe(importees, q.ligne ?? '?')} ${q.pourquoi ?? ''}`
    : q.erreur ? `${m.erreurs[q.erreur] ?? q.erreur}${q.champ ? ` ${q.champ} (${q.pourquoi})` : q.pourquoi ? ` ${q.pourquoi}` : ''}` : null;
  const lien = (o: Record<string, string>) => `/projets/${id}/donnees?${new URLSearchParams({ table: t.nom, ...(cherche ? { q: cherche } : {}), ...o })}`;

  return (
    <main className="console">
      {haut}
      <div className="entete"><h1>{m.titre}</h1><span className="attenue">{p.nom}</span></div>
      {message && <div className="carte" role={q.erreur ? 'alert' : 'status'}>{message}</div>}
      <nav className="ligne" aria-label={m.titre}>
        {p.tables.map((x) => {
          const n = totaux.get(x.nom);
          const nom = <>{x.libelle}{n !== null && n !== undefined ? <span className="attenue"> ({n})</span> : null}</>;
          return x.nom === t.nom ? <strong key={x.nom}>{nom}</strong> : <Link key={x.nom} href={`/projets/${id}/donnees?table=${x.nom}`}>{nom}</Link>;
        })}
      </nav>

      <div className="carte">
        <div className="ligne" style={{ justifyContent: 'space-between' }}>
          <form className="ligne" method="get">
            <input type="hidden" name="table" value={t.nom} />
            <input name="q" defaultValue={cherche} aria-label={m.chercher} placeholder={m.chercher} />
            <button type="submit" className="discret">{m.chercher}</button>
          </form>
          <div className="ligne">
            <Link className="bouton" href={lien({ nouvelle: '1' })}>{m.ajouter}</Link>
            <Link className="bouton discret" href={lien({ import: '1' })}>{m.importer}</Link>
            <a className="bouton discret" href={`/projets/${id}/donnees/csv?table=${t.nom}`}>{m.exporter}</a>
          </div>
        </div>
        {q.import === '1' && (
          <div className="carte">
            <h2>{m.importerTitre(t.libelle)}</h2>
            <p className="attenue">{m.importerAide(t.colonnes.filter((c) => c.ecrivable).map((c) => c.libelle).join(', '))}</p>
            <form action={importer.bind(null, id, t.nom)}>
              <label htmlFor="fichier">{m.importerFichier}</label>
              <input id="fichier" name="fichier" type="file" accept=".csv,.tsv,.txt,text/csv,text/plain" />
              <label htmlFor="texte" style={{ marginTop: '0.75rem' }}>{m.importerTexte}</label>
              <textarea id="texte" name="texte" rows={6} placeholder={t.colonnes.filter((c) => c.ecrivable).map((c) => c.libelle).join(';')} />
              <div className="ligne" style={{ marginTop: '0.75rem' }}><button type="submit">{m.importerBouton}</button><Link className="bouton discret" href={lien({})}>{m.annuler}</Link></div>
            </form>
          </div>
        )}
        {formulaire && <LeFormulaire id={id} t={t} ligne={enCours} references={references} m={m} langue={p.langue} annuler={lien({})} />}
        {!lues.lu ? <p role="alert">{m.erreurs.panne} ({lues.pourquoi})</p> : lues.valeur.lignes.length === 0 ? <p className="attenue">{m.aucune}</p> : (
          <>
            <p className="attenue">{m.lignes(lues.valeur.total)}</p>
            <div style={{ overflowX: 'auto' }}>
              <table className="tableau">
                <thead><tr>{t.cycle && <th>{m.etat}</th>}{t.colonnes.map((c) => <th key={c.nom}>{c.libelle}</th>)}<th>{m.creeeLe}</th><th /></tr></thead>
                <tbody>
                  {lues.valeur.lignes.map((l) => (
                    <tr key={String(l.id)}>
                      {t.cycle && <td><span className="etat">{t.cycle.libelles[String(l.etat)] ?? String(l.etat ?? '—')}</span></td>}
                      {t.colonnes.map((c) => <td key={c.nom}>{laCellule(c, l[c.nom], references, p.langue)}</td>)}
                      <td className="attenue">{enTexte({ type: 'date_heure' }, l.created_at, p.langue)}</td>
                      <td>{seModifie(t, l) ? <Link href={lien({ ligne: String(l.id), page: String(page) })}>{m.modifier}</Link> : <span className="attenue" title={m.figee}>{m.verrou}</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="ligne">
              {page > 0 && <Link href={lien({ page: String(page - 1) })}>{m.precedentes}</Link>}
              {(page + 1) * PAR_PAGE < lues.valeur.total && <Link href={lien({ page: String(page + 1) })}>{m.suivantes}</Link>}
            </div>
          </>
        )}
      </div>
    </main>
  );
}

type Mots = (typeof MOTS)['fr'] | (typeof MOTS)['en'];
type References = ReadonlyMap<string, readonly { readonly id: string; readonly nom: string }[]>;

/** Les lignes que chaque référence de la table peut désigner (au plus 200 par table), nommées par leur premier texte. */
async function lesReferences(p: Extract<Awaited<ReturnType<typeof leProjet>>, { ok: true }>, t: TableDeLaConsole): Promise<References> {
  const cibles = [...new Set(t.colonnes.filter((c) => c.type === 'reference' && c.table).map((c) => c.table!))];
  const r = new Map<string, { id: string; nom: string }[]>();
  await Promise.all(cibles.map(async (nom) => {
    const cible = p.tables.find((x) => x.nom === nom);
    const l = cible ? await p.donnees.lire(p.schema, nom, { limite: 200 }) : null;
    if (cible && l?.lu) r.set(nom, l.valeur.lignes.map((x) => ({ id: String(x.id), nom: leNomDUneLigne(cible, x) })));
  }));
  return r;
}

function laCellule(c: Colonne, v: unknown, references: References, langue: 'fr' | 'en'): string {
  if (c.type === 'reference' && c.table && typeof v === 'string') return references.get(c.table)?.find((x) => x.id === v)?.nom ?? v.slice(0, 8);
  const texte = enTexte(c, v, langue);
  return texte.length > 80 ? `${texte.slice(0, 80)}…` : texte;
}

function LeFormulaire({ id, t, ligne, references, m, langue, annuler }: { id: string; t: TableDeLaConsole; ligne: Ligne | null; references: References; m: Mots; langue: 'fr' | 'en'; annuler: string }) {
  const valeur = (c: Colonne): string => {
    const v = ligne?.[c.nom];
    if (v === null || v === undefined) return '';
    if (c.type === 'date_heure' && typeof v === 'string') return new Date(v).toISOString().slice(0, 16);
    return String(v);
  };
  const ligneId = ligne ? String(ligne.id) : null;
  return (
    <div className="carte">
      <h2>{ligne ? leNomDUneLigne(t, ligne) : m.nouvelle}</h2>
      <form action={enregistrer.bind(null, id, t.nom, ligneId)}>
        {t.colonnes.map((c) => (
          <div key={c.nom} style={{ margin: '0.6rem 0' }}>
            <label htmlFor={`c-${c.nom}`}>{c.libelle}{c.obligatoire && c.ecrivable ? ' *' : ''}</label>
            {!c.ecrivable ? <p className="attenue">{ligne ? enTexte(c, ligne[c.nom], langue) : '—'} · {m.nonEcrit}</p>
              : c.type === 'booleen' ? <input id={`c-${c.nom}`} type="checkbox" name={c.nom} defaultChecked={ligne?.[c.nom] === true} />
              : c.type === 'texte_long' ? <textarea id={`c-${c.nom}`} name={c.nom} defaultValue={valeur(c)} rows={4} required={c.obligatoire} />
              : c.type === 'choix' ? <select id={`c-${c.nom}`} name={c.nom} defaultValue={valeur(c)} required={c.obligatoire}><option value="">{m.choisir}</option>{(c.valeurs ?? []).map((v) => <option key={v} value={v}>{v}</option>)}</select>
              : c.type === 'reference' ? <select id={`c-${c.nom}`} name={c.nom} defaultValue={valeur(c)} required={c.obligatoire}><option value="">{m.choisir}</option>{(references.get(c.table ?? '') ?? []).map((x) => <option key={x.id} value={x.id}>{x.nom}</option>)}</select>
              : <input id={`c-${c.nom}`} name={c.nom} defaultValue={valeur(c)} required={c.obligatoire}
                  type={c.type === 'date' ? 'date' : c.type === 'date_heure' ? 'datetime-local' : 'text'}
                  inputMode={c.type === 'nombre' || c.type === 'montant' ? 'decimal' : c.type === 'entier' ? 'numeric' : undefined} />}
          </div>
        ))}
        <div className="ligne"><button type="submit">{m.enregistrer}</button><Link className="bouton discret" href={annuler}>{m.annuler}</Link></div>
      </form>
      {ligneId && <form action={supprimer.bind(null, id, t.nom, ligneId)} style={{ marginTop: '0.75rem' }}>
        <details><summary>{m.supprimer}</summary><button type="submit" className="discret" style={{ marginTop: '0.5rem' }}>{m.supprimerQ}</button></details>
      </form>}
    </div>
  );
}
