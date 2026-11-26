/**
 * LES FICHES DES COMPTES — une table qui déclare `personnes` (app.json) tient une ligne par compte de ce rôle : sa fiche
 * (un technicien, un salarié, un client suivi). Le propriétaire la relie à un compte depuis l'écran Utilisateurs ; la base
 * garde le lien dans `compte_id` (unique : un compte, une fiche), que le navigateur n'écrit jamais. L'app la lit par
 * `useMaFiche`.
 *
 * Ce qu'il remplace (Antoine, 26/11, Planning Maintenance) : le rôle donné, l'app cherchait encore la fiche dont le champ
 * « e-mail » valait l'adresse du compte, recopiée à la main, et disait « pas relié » sans que rien ne le montre.
 */
import { COLONNE_DE_LA_FICHE, type Manifeste } from '@/lib/backend/app/manifeste';
import { lesTablesDeLaConsole, leNomDUneLigne } from './les-donnees';
import type { Issue, LesDonnees, Ligne } from './sur-supabase';

export interface TableDeFiches { readonly table: string; readonly libelle: string; readonly role: string }

/** PURE — les tables de fiches d'app.json, et le rôle de chacune. */
export const lesTablesDeFiches = (m: Manifeste): readonly TableDeFiches[] =>
  m.tables.filter((t) => t.personnes).map((t) => ({ table: t.nom, libelle: t.libelle, role: t.personnes! }));

export interface FicheDUnCompte {
  readonly table: string; readonly libelle: string; readonly role: string;
  /** La fiche reliée au compte ; `null` : aucune. */
  readonly fiche: { readonly id: string; readonly nom: string } | null;
  /** Les fiches qu'aucun compte ne porte encore, à relier. */
  readonly libres: readonly { readonly id: string; readonly nom: string }[];
}

/** PURE — pour un compte et ses rôles : chaque fiche qu'un de ses rôles demande, reliée ou non, et celles qui restent libres. */
export function lesFichesDuCompte(m: Manifeste, compte: string, roles: readonly string[], lignes: ReadonlyMap<string, readonly Ligne[]>): readonly FicheDUnCompte[] {
  const tables = lesTablesDeLaConsole(m);
  return lesTablesDeFiches(m).filter((f) => roles.includes(f.role)).map((f) => {
    const t = tables.find((x) => x.nom === f.table);
    const nom = (l: Ligne) => (t ? leNomDUneLigne(t, l) : String(l.id ?? '').slice(0, 8));
    const toutes = lignes.get(f.table) ?? [];
    const siennes = toutes.find((l) => l[COLONNE_DE_LA_FICHE] === compte);
    return { ...f, fiche: siennes ? { id: String(siennes.id), nom: nom(siennes) } : null,
      libres: toutes.filter((l) => !l[COLONNE_DE_LA_FICHE]).map((l) => ({ id: String(l.id), nom: nom(l) })) };
  });
}

/**
 * Relie `ligne` au compte (la fiche qu'il portait se libère d'abord), ou le délie (`ligne` nul). `table` doit être une
 * table de fiches d'app.json, et la ligne libre ou déjà la sienne ; sinon refusé, rien d'écrit.
 */
export async function relierUneFiche(d: LesDonnees, m: Manifeste, schema: string, proprietaire: string, table: string, compte: string, ligne: string | null):
  Promise<{ readonly fait: true } | { readonly refus: 'table_sans_fiches' | 'fiche_prise' | 'panne'; readonly pourquoi?: string }> {
  if (!lesTablesDeFiches(m).some((f) => f.table === table)) return { refus: 'table_sans_fiches' };
  const lu = await d.lire(schema, table, { limite: 5000 });
  if (!lu.lu) return { refus: 'panne', pourquoi: lu.pourquoi };
  const cible = ligne ? lu.valeur.lignes.find((l) => l.id === ligne) : null;
  if (ligne && (!cible || (cible[COLONNE_DE_LA_FICHE] && cible[COLONNE_DE_LA_FICHE] !== compte))) return { refus: 'fiche_prise' };
  for (const l of lu.valeur.lignes.filter((x) => x[COLONNE_DE_LA_FICHE] === compte && x.id !== ligne)) {
    const r: Issue<unknown> = await d.ecrire(schema, table, String(l.id), { [COLONNE_DE_LA_FICHE]: null }, proprietaire, null);
    if (!r.lu) return { refus: 'panne', pourquoi: r.pourquoi };
  }
  if (ligne) {
    const r = await d.ecrire(schema, table, ligne, { [COLONNE_DE_LA_FICHE]: compte }, proprietaire, null);
    if (!r.lu) return { refus: 'panne', pourquoi: r.pourquoi };
  }
  return { fait: true };
}
