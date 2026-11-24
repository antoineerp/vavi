// Repris de constructor-v13@5bb786e : generateur-v2/app/l-envoi-sans-compte.ts
/**
 * L'envoi sans compte : ce qu'un visiteur remplit et joint, sur une table qu'app.json lui ouvre (`visiteur` dans son
 * `ecriture`). La plateforme l'écrit au nom du propriétaire, par le relais et sous la sécurité des lignes ; ses pièces
 * vont dans leurs colonnes `fichier`, mesurées ; la ligne relue rend ce que la base a calculé (une valeur lue, un calcul), que
 * la page montre aussitôt. Une valeur envoyée pour ce que la base calcule est écartée, et c'est dit.
 *
 * Ce qu'il remplace (interdit 9) : `visiteur` dans l'écriture d'une table était ignoré par la base ; un envoi sans compte
 * ne se gardait pas, et chaque page qui le proposait menait à la connexion.
 */
import { estCalcule, estTenu, VISITEUR, type Manifeste } from './manifeste';

type Table = Manifeste['tables'][number];
const objet = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {});
const estUnePiece = (c: { readonly type: string }): boolean => c.type === 'fichier' || c.type === 'image';

/** Les tables où un visiteur envoie sans compte. */
export const lesTablesSansCompte = (m: Pick<Manifeste, 'tables'>): Table[] => m.tables.filter((t) => t.ecriture.includes(VISITEUR));

export type EnvoiPrepare =
  | { readonly ok: true; readonly table: string; readonly ligne: Record<string, unknown>; readonly pieces: readonly string[]; readonly ecartees: readonly string[] }
  | { readonly ok: false; readonly pourquoi: string };

/** `{ table, ligne }` relu contre sa table : un champ inconnu, ou un fichier envoyé en valeur, refuse ; un calculé est écarté. PUR. */
export function preparerUnEnvoi(m: Pick<Manifeste, 'tables'>, brut: unknown): EnvoiPrepare {
  const o = objet(brut);
  const t = lesTablesSansCompte(m).find((x) => x.nom === o.table);
  if (!t) return { ok: false, pourquoi: `« ${typeof o.table === 'string' ? o.table : ''} » ne reçoit rien sans compte` };
  const ligne: Record<string, unknown> = {}, ecartees: string[] = [], fautes: string[] = [];
  for (const [nom, valeur] of Object.entries(objet(o.ligne))) {
    const c = t.champs.find((x) => x.nom === nom);
    if (!c) fautes.push(`« ${nom} » n’est pas un champ de ${t.nom}`);
    else if (estUnePiece(c)) fautes.push(`« ${nom} » : un fichier s’envoie en pièce, jamais en valeur`);
    else if (estTenu(t, c)) ecartees.push(nom);
    else ligne[nom] = valeur;
  }
  if (fautes.length > 0) return { ok: false, pourquoi: fautes.join(' ; ') };
  if (Object.keys(ligne).length === 0) return { ok: false, pourquoi: 'l’envoi ne remplit aucun champ' };
  return { ok: true, table: t.nom, ligne, pieces: t.champs.filter(estUnePiece).map((c) => c.nom), ecartees };
}

/**
 * Ce que la réponse rend de la ligne gardée : ses champs, son état et son identité ; jamais le compte qui la tient ni
 * l'organisation ; une pièce, par son nom et ses mesures, jamais son chemin. PUR.
 */
export function ceQueLEnvoiRend(m: Pick<Manifeste, 'tables'>, table: string, ligne: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const t = m.tables.find((x) => x.nom === table);
  if (!t) return {};
  const rendu: Record<string, unknown> = { id: ligne.id, created_at: ligne.created_at, ...(t.cycle ? { etat: ligne.etat } : {}) };
  for (const c of t.champs) {
    const v = ligne[c.nom];
    if (!estUnePiece(c)) rendu[c.nom] = v ?? null;
    else { const p = objet(v); rendu[c.nom] = v ? { nom: p.nom ?? null, type: p.type ?? null, taille: p.taille ?? null, ...(p.faits ? { faits: p.faits } : {}) } : null; }
  }
  return rendu;
}

/** Une table ouverte au visiteur reçoit ses envois au nom du propriétaire : l'app en a un, et la ligne existe seule. */
export function lireLesEnvois(m: Pick<Manifeste, 'tables' | 'roles'>, ctx: { addIssue(i: { code: 'custom'; message: string }): void }): void {
  for (const t of lesTablesSansCompte(m)) {
    const dire = (message: string): void => { ctx.addIssue({ code: 'custom', message: `${t.nom} : ${message}` }); };
    if (!m.roles.some((r) => r.obtenu === 'proprietaire')) dire('un visiteur y envoie sans compte, au nom du propriétaire : l’app déclare le rôle du propriétaire (`obtenu: proprietaire`)');
    if (t.appartenance === 'rattachee') dire('un visiteur n’envoie pas une ligne rattachée : il ne voit pas sa mère');
    if (t.propositions || t.contenu) dire('un visiteur n’écrit ni une proposition de l’IA, ni un contenu fixé d’avance');
    const prix = t.vente ? t.champs.find((c) => c.nom === t.vente?.prix) : null;
    if (t.vente && !(prix && estCalcule(prix))) dire(`un visiteur n’envoie un article que si la base en pose le prix : « ${t.vente.prix} » est un champ calculé (\`calcul\` ou \`depuis\`)`);
  }
}
