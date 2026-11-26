// Repris de constructor-v13@24afe854e : lib/bascule/l-envoi-sans-compte-de-la-voie-d.ts
/**
 * L'ENVOI SANS COMPTE D'UNE APP — la règle, derrière la porte de `/api/depot/<projet>` (qui juge le débit et le robot).
 * La ligne relue contre app.json (`preparerUnEnvoi`), créée au nom du propriétaire par le relais (`voie_neuve_creer`, sous
 * la sécurité des lignes de l'app : aucune table n'est ouverte à `anon`), ses pièces par le chemin des pièces jointes
 * (mesurées), puis relue (`voie_neuve_lire`) : la base y a posé ses valeurs lues et ses calculs, que la page montre au
 * visiteur. Une pièce refusée retire la ligne qu'elle venait de créer : aucune ne reste sans son fichier.
 *
 * Ce qu'il remplace : rien dans vavi (essai d'Antoine du 26/11) : `envoyerSansCompte` du gabarit appelait
 * `/api/depot/<projet>`, que vavi ne servait pas ; tout envoi d'un visiteur dans une table échouait.
 */
import { ceQueLEnvoiRend, preparerUnEnvoi } from '@/lib/backend/app/l-envoi-sans-compte';
import type { Manifeste } from '@/lib/backend/app/manifeste';

type Issue<T> = { readonly lu: true; readonly valeur: T } | { readonly lu: false; readonly pourquoi: string };
const objet = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {});

export interface PieceEnvoyee { readonly colonne: string; readonly nom: string; readonly octets: Uint8Array; readonly type: string | null }
export interface ReponseDeLEnvoi { readonly statut: number; readonly corps: Record<string, unknown> }

export interface DependancesDeLEnvoi {
  /** Le relais, au nom du propriétaire (`agirPourUnCompte`) : la sécurité des lignes de l'app décide. */
  relais(fonction: 'voie_neuve_creer' | 'voie_neuve_lire' | 'voie_neuve_supprimer', args: Record<string, unknown>): Promise<Issue<unknown>>;
  /** Le chemin des pièces jointes (`joindreUnePiece`) ; absent : un envoi avec un fichier est refusé. */
  joindre?(cible: { table: string; id: string; colonne: string }, piece: PieceEnvoyee): Promise<Issue<unknown>>;
}

/** `brut` : `{ table, ligne }`, la ligne déjà sans les champs du jugement. */
export async function envoyerSansCompte(m: Pick<Manifeste, 'tables'>, schema: string, brut: unknown, pieces: readonly PieceEnvoyee[], d: DependancesDeLEnvoi): Promise<ReponseDeLEnvoi> {
  const p = preparerUnEnvoi(m, brut);
  if (!p.ok) return { statut: 422, corps: { error: `L’envoi est refusé : ${p.pourquoi}.` } };
  const hors = pieces.find((x) => !p.pieces.includes(x.colonne));
  if (hors) return { statut: 422, corps: { error: `L’envoi est refusé : « ${hors.colonne} » ne reçoit pas de fichier.` } };
  if (pieces.length > 0 && !d.joindre) return { statut: 422, corps: { error: 'L’envoi est refusé : un fichier ne se reçoit pas ici.' } };
  const cible = { p_schema: schema, p_table: p.table };
  const cree = await d.relais('voie_neuve_creer', { ...cible, p_valeurs: p.ligne });
  const id = cree.lu ? objet(cree.valeur).id : null;
  if (!cree.lu || typeof id !== 'string') {
    return { statut: 422, corps: { error: 'L’envoi est refusé par l’app : un champ manque ou n’a pas la bonne forme.', ...(cree.lu ? {} : { detail: cree.pourquoi }) } };
  }
  for (const piece of pieces) {
    const j = await d.joindre!({ table: p.table, id, colonne: piece.colonne }, piece);
    if (!j.lu) {
      const retiree = await d.relais('voie_neuve_supprimer', { ...cible, p_egal: { id } });
      if (!retiree.lu) console.error(`[envoi] ${schema} ${p.table} ${id} : la ligne sans sa pièce n’a pas été retirée — ${retiree.pourquoi}`);
      return { statut: 422, corps: { error: `Le fichier « ${piece.nom} » n’a pas pu être reçu : ${j.pourquoi}` } };
    }
  }
  const relue = await d.relais('voie_neuve_lire', { ...cible, p_egal: { id } });
  const lignes = relue.lu ? objet(relue.valeur).lignes : null;
  const gardee = Array.isArray(lignes) && lignes[0] ? objet(lignes[0]) : objet(cree.valeur);
  return { statut: 201, corps: { id, ligne: ceQueLEnvoiRend(m, p.table, gardee),
    ...(p.ecartees.length ? { ecartees: `${p.ecartees.join(', ')} : calculé(s) par l’app, la valeur envoyée est écartée` } : {}) } };
}
