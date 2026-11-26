'use server';
/**
 * Les gestes de la console sur les données d'une app : enregistrer une ligne (nouvelle ou modifiée), la supprimer. La saisie
 * est relue à la déclaration (`relireLaSaisie`) ; la base refuse encore ce qui ne s'écrit pas, et une ligne figée par son
 * cycle. Le résultat revient à la page par son adresse.
 */
import { redirect } from 'next/navigation';
import { lesLignesDuTexte, relireLaSaisie, type LigneDuTexte } from '@/lib/donnees/les-donnees';
import { lesLignesAImporter } from '@/lib/donnees/l-import';
import { leProjet } from './le-projet';

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const retour = (id: string, q: Record<string, string>): never => redirect(`/projets/${id}/donnees?${new URLSearchParams(q)}`);

export async function enregistrer(id: string, table: string, ligne: string | null, formulaire: FormData) {
  if (!ID.test(id) || (ligne !== null && !ID.test(ligne))) redirect('/projets');
  const p = await leProjet(id);
  if (!p.ok) retour(id, { erreur: p.pourquoi });
  if (!p.ok) return;
  const t = p.tables.find((x) => x.nom === table);
  if (!t) retour(id, { erreur: 'table' });
  const saisie: Record<string, string> = {};
  for (const [k, v] of formulaire.entries()) if (typeof v === 'string') saisie[k] = v;
  const r = relireLaSaisie(t!, saisie, ligne === null);
  if (!r.ok) retour(id, { table, ...(ligne ? { ligne } : { nouvelle: '1' }), erreur: 'saisie', champ: r.champ, pourquoi: r.pourquoi });
  if (!r.ok) return;
  const e = await p.donnees.ecrire(p.schema, table, ligne, r.valeurs, p.compte, t!.cycle ? t!.cycle.ouverts : null);
  if (!e.lu) retour(id, { table, ...(ligne ? { ligne } : { nouvelle: '1' }), erreur: 'base', pourquoi: e.pourquoi });
  if (e.lu && !e.valeur) retour(id, { table, erreur: 'figee' });
  console.log(`[donnees] ${id.slice(0, 8)} ${table} ${ligne ? 'modifiée' : 'ajoutée'}`);
  retour(id, { table, fait: ligne ? 'modifiee' : 'ajoutee' });
}

export async function supprimer(id: string, table: string, ligne: string) {
  if (!ID.test(id) || !ID.test(ligne)) redirect('/projets');
  const p = await leProjet(id);
  if (!p.ok) retour(id, { erreur: p.pourquoi });
  if (!p.ok) return;
  const t = p.tables.find((x) => x.nom === table);
  if (!t) retour(id, { erreur: 'table' });
  const s = await p.donnees.supprimer(p.schema, table, ligne, t!.cycle ? t!.cycle.ouverts : null);
  if (!s.lu) retour(id, { table, erreur: 'base', pourquoi: s.pourquoi });
  console.log(`[donnees] ${id.slice(0, 8)} ${table} ${s.lu && s.valeur ? 'supprimée' : 'non supprimée'}`);
  retour(id, { table, ...(s.lu && s.valeur ? { fait: 'supprimee' } : { erreur: 'figee' }) });
}


/** Un CSV importé dans une table : toutes les lignes relues d'abord (une seule fausse refuse tout), puis écrites une à une. */
export async function importer(id: string, table: string, formulaire: FormData) {
  if (!ID.test(id)) redirect('/projets');
  const p = await leProjet(id);
  if (!p.ok) retour(id, { erreur: p.pourquoi });
  if (!p.ok) return;
  const t = p.tables.find((x) => x.nom === table);
  if (!t) retour(id, { erreur: 'table' });
  const f = formulaire.get('fichier');
  const texte = f instanceof File && f.size > 0 ? (f.size > 900_000 ? null : await f.text()) : String(formulaire.get('texte') ?? '');
  if (texte === null) retour(id, { table, import: '1', erreur: 'import', pourquoi: p.langue === 'fr' ? 'le fichier dépasse 900 Ko' : 'the file is over 900 KB' });
  const l = lesLignesAImporter(t!, texte ?? '', p.langue);
  if (!l.ok) retour(id, { table, import: '1', erreur: 'import', pourquoi: l.pourquoi });
  if (!l.ok) return;
  let n = 0;
  for (const valeurs of l.lignes) {
    const e = await p.donnees.ecrire(p.schema, table, null, valeurs, p.compte, t!.cycle ? t!.cycle.ouverts : null);
    if (!e.lu) retour(id, { table, import: '1', erreur: 'import_coupe', importees: String(n), ligne: String(n + 2), pourquoi: e.pourquoi });
    n += 1;
  }
  console.log(`[donnees] ${id.slice(0, 8)} ${table} ${n} lignes importées`);
  retour(id, { table, fait: 'importees', importees: String(n), ...(l.ignorees.length ? { ignorees: l.ignorees.join(', ').slice(0, 300) } : {}) });
}

/**
 * Un texte cliqué dans l'aperçu qui n'est pas un texte de la page : est-ce une donnée de l'app ? Les lignes dont un champ
 * le porte tel quel (cinq au plus), pour ouvrir leur modification. Remplace « montrez-le à Claude » pour une donnée.
 */
export async function lesLignesDuTexteClique(id: string, texte: string): Promise<LigneDuTexte[]> {
  if (!ID.test(id)) return [];
  const t = texte.replace(/\s+/g, ' ').trim().slice(0, 500);
  if (t.length < 2) return [];
  const p = await leProjet(id);
  if (!p.ok) return [];
  const lues = await Promise.all(p.tables.map(async (table) => {
    const r = await p.donnees.lire(p.schema, table.nom, { cherche: t, limite: 20 });
    return { table, lignes: r.lu ? r.valeur.lignes : [] };
  }));
  return lesLignesDuTexte(t, lues);
}
