// Repris de constructor-v13@5bb786e : lib/capabilities/les-pieces-jointes.ts
/**
 * LES PIÈCES JOINTES — joindre, ouvrir, retirer le fichier d'UNE ligne.
 *
 * Le chemin d'une pièce, toujours le même, et la BASE décide à chaque pas (`sqlDesPieces`, la base de la plateforme) :
 *   joindre : les octets vont au seau privé, sous le chemin de SA ligne → la base les ENREGISTRE dans la colonne, au nom
 *             du compte et sous la RLS (refusé : le fichier repart) → l'ancienne pièce de la colonne est effacée ;
 *   ouvrir  : la base rend la pièce d'une ligne que le compte VOIT → la plateforme ne sert que le chemin de CETTE ligne ;
 *   retirer : la base vide la colonne (même règle que joindre) → le fichier est effacé.
 * Le chemin se lit avec la ligne, mais n'ouvre rien : le seau est privé, seule la plateforme le lit, et seulement le
 * chemin de la ligne demandée.
 *
 * Changé à la reprise : la mesure d'un maillage (`les-faits-d-une-piece`, qui ouvre un STL ou un STEP sur le serveur)
 * n'est pas reprise ; elle attend le bac à sable de la vague 0, avec l'aperçu 3D.
 *
 * PUR à ses dépendances près (injectées) : la route (`app/api/pieces/[projet]`) ne fait que la porte.
 */
import { randomBytes } from 'node:crypto';
import { estUnIdentifiantSql } from '@/lib/relais/identifiant-sql';

type Issue<T> = { readonly lu: true; readonly valeur: T } | { readonly lu: false; readonly pourquoi: string };
const lu = <T>(valeur: T): Issue<T> => ({ lu: true, valeur });
const pasLu = <T>(pourquoi: string): Issue<T> => ({ lu: false, pourquoi });

export const SEAU_DES_PIECES = 'pieces';
export const OCTETS_D_UNE_PIECE = 15 * 1024 * 1024;

export interface PieceJointe { readonly chemin: string; readonly nom: string; readonly type: string | null; readonly taille: number }
export interface CibleDUnePiece { readonly table: string; readonly id: string; readonly colonne: string }

export interface DependancesDesPieces {
  schema(projectId: string): Promise<Issue<string>>;
  /** `public.plateforme_pour` — la base, au nom du compte. */
  base(compte: string, schema: string, fonction: string, args: Record<string, unknown>): Promise<Issue<unknown>>;
  deposer(chemin: string, octets: Uint8Array, type: string | null): Promise<string | null>;
  lire(chemin: string): Promise<Issue<Uint8Array | null>>;
  supprimer(chemins: readonly string[]): Promise<string | null>;
}

/** Le préfixe des fichiers d'une ligne — la seule place d'où la plateforme sert une pièce. PUR. */
export function cheminDeLaLigne(projectId: string, table: string, id: string): string | null {
  if (!/^[0-9a-f-]{8,64}$/i.test(projectId) || !estUnIdentifiantSql(table) || !/^[A-Za-z0-9_-]{1,64}$/.test(id)) return null;
  return `${projectId}/${table}/${id}/`;
}

/** La cible relue — une table, une ligne, une colonne nommées comme la base les nomme. PUR. */
export function lireLaCible(brut: unknown): Issue<CibleDUnePiece> {
  const o = (brut && typeof brut === 'object' ? brut : {}) as Record<string, unknown>;
  const table = typeof o.table === 'string' ? o.table : '';
  const id = typeof o.id === 'string' ? o.id : '';
  const colonne = typeof o.colonne === 'string' ? o.colonne : '';
  if (!estUnIdentifiantSql(table) || !estUnIdentifiantSql(colonne) || !/^[A-Za-z0-9_-]{1,64}$/.test(id)) {
    return pasLu('Une pièce jointe se nomme par sa table, l’identifiant de sa ligne et sa colonne « fichier ».');
  }
  return lu({ table, id, colonne });
}

/** Un refus de la base, dit sans le jargon. */
export function enMotsDeLaPiece(pourquoi: string): string {
  const m = /pièce : (.+?)(?: \(SQLSTATE|$)/.exec(pourquoi);
  return m ? `La pièce jointe : ${m[1]}` : `La pièce jointe n’a pas pu être enregistrée : ${pourquoi}`;
}

const cheminDe = (v: unknown): string | null => {
  const c = v && typeof v === 'object' ? (v as Record<string, unknown>).chemin : null;
  return typeof c === 'string' ? c : null;
};

export async function joindreUnePiece(
  projectId: string, compte: string, cible: CibleDUnePiece,
  fichier: { readonly nom: string; readonly octets: Uint8Array; readonly type: string | null }, d: DependancesDesPieces,
): Promise<Issue<Omit<PieceJointe, 'chemin'>>> {
  if (fichier.octets.byteLength === 0) return pasLu('Le fichier est vide.');
  if (fichier.octets.byteLength > OCTETS_D_UNE_PIECE) return pasLu(`Le fichier pèse plus de ${OCTETS_D_UNE_PIECE / 1024 / 1024} Mo.`);
  const prefixe = cheminDeLaLigne(projectId, cible.table, cible.id);
  if (!prefixe) return pasLu('Cette ligne ne se nomme pas comme la base la nomme.');
  const schema = await d.schema(projectId);
  if (!schema.lu) return schema;
  const piece: PieceJointe = { chemin: `${prefixe}${randomBytes(12).toString('hex')}`, nom: fichier.nom.slice(0, 255) || 'pièce',
    type: fichier.type ? fichier.type.slice(0, 120) : null, taille: fichier.octets.byteLength };
  const faute = await d.deposer(piece.chemin, fichier.octets, piece.type);
  if (faute) return pasLu(`La pièce jointe n’a pas pu être rangée : ${faute}`);
  const r = await d.base(compte, schema.valeur, 'piece_joindre', { p_table: cible.table, p_id: cible.id, p_colonne: cible.colonne, p_piece: piece });
  if (!r.lu) {
    // REFUSÉE PAR LA BASE : le fichier ne reste pas dans le seau sans ligne qui le porte.
    const f = await d.supprimer([piece.chemin]);
    if (f) console.error(`[Pièces] ${projectId.slice(0, 8)} — ${piece.chemin} refusé par la base et resté dans le seau : ${f}`);
    return pasLu(enMotsDeLaPiece(r.pourquoi));
  }
  // L'ANCIENNE PIÈCE DE LA COLONNE part — seulement si elle était bien celle de CETTE ligne.
  const ancien = cheminDe((r.valeur as { ancien?: unknown } | null)?.ancien);
  if (ancien && ancien.startsWith(prefixe) && ancien !== piece.chemin) {
    const f = await d.supprimer([ancien]);
    if (f) console.warn(`[Pièces] ${projectId.slice(0, 8)} — ancienne pièce ${ancien} non effacée : ${f}`);
  }
  return lu({ nom: piece.nom, type: piece.type, taille: piece.taille });
}

export async function ouvrirUnePiece(projectId: string, compte: string, cible: CibleDUnePiece, d: DependancesDesPieces):
  Promise<Issue<{ readonly nom: string; readonly type: string | null; readonly octets: Uint8Array }>> {
  const prefixe = cheminDeLaLigne(projectId, cible.table, cible.id);
  if (!prefixe) return pasLu('Cette ligne ne se nomme pas comme la base la nomme.');
  const schema = await d.schema(projectId);
  if (!schema.lu) return schema;
  const r = await d.base(compte, schema.valeur, 'piece_de_la_ligne', { p_table: cible.table, p_id: cible.id, p_colonne: cible.colonne });
  if (!r.lu) return pasLu(enMotsDeLaPiece(r.pourquoi));
  const v = r.valeur as Partial<PieceJointe> | null;
  const chemin = cheminDe(v);
  if (!v || !chemin) return pasLu('Aucune pièce jointe ici, ou cette ligne ne vous est pas ouverte.');
  // LA PLATEFORME NE SERT QUE LE CHEMIN DE CETTE LIGNE : une colonne réécrite vers le fichier d'une autre ne l'ouvre pas.
  if (!chemin.startsWith(prefixe)) return pasLu('Cette pièce jointe n’appartient pas à cette ligne.');
  const o = await d.lire(chemin);
  if (!o.lu) return pasLu(`La pièce jointe n’a pas pu être lue : ${o.pourquoi}`);
  if (!o.valeur) return pasLu('La pièce jointe n’est plus là.');
  return lu({ nom: typeof v.nom === 'string' ? v.nom : 'pièce', type: typeof v.type === 'string' ? v.type : null, octets: o.valeur });
}

export async function retirerUnePiece(projectId: string, compte: string, cible: CibleDUnePiece, d: DependancesDesPieces): Promise<Issue<true>> {
  const prefixe = cheminDeLaLigne(projectId, cible.table, cible.id);
  if (!prefixe) return pasLu('Cette ligne ne se nomme pas comme la base la nomme.');
  const schema = await d.schema(projectId);
  if (!schema.lu) return schema;
  const r = await d.base(compte, schema.valeur, 'piece_joindre', { p_table: cible.table, p_id: cible.id, p_colonne: cible.colonne, p_piece: null });
  if (!r.lu) return pasLu(enMotsDeLaPiece(r.pourquoi));
  const ancien = cheminDe((r.valeur as { ancien?: unknown } | null)?.ancien);
  if (ancien && ancien.startsWith(prefixe)) {
    const f = await d.supprimer([ancien]);
    if (f) return pasLu(`La pièce est retirée de la ligne, mais son fichier n’a pas été effacé : ${f}`);
  }
  return lu(true as const);
}
