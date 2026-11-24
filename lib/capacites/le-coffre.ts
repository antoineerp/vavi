// Repris de constructor-v13@5bb786e : lib/sources-de-documents/le-coffre.ts et lib/sources-de-documents/coffre-supabase.ts
/**
 * LE COFFRE — déposer, ouvrir, retirer un document de SON organisation, vider le coffre.
 *
 * Le chemin d'un fichier, toujours le même, et la BASE décide à chaque pas (`lib/backend/pipeline/le-coffre.ts`) :
 *   déposer : la base dit l'organisation du compte et son dossier → le dossier est créé au premier dépôt, rangé en
 *             base → les octets déposés → la base ENREGISTRE (et refuse si le coffre est plein : le fichier repart) ;
 *   ouvrir  : la base rend l'identifiant rangé d'un fichier de SON organisation, ou rien → les octets ;
 *   retirer : la base le retire (son déposant, ou un rôle qui gère l'équipe) → le stockage l'efface ;
 *   vider   : la base retire tout (un rôle qui gère l'équipe) → le stockage efface le dossier.
 * Le navigateur n'apprend jamais un identifiant rangé ; la plateforme n'agit jamais hors de la RLS du compte.
 *
 * Les octets vont dans un seau PRIVÉ de Supabase (`coffres`), `<projet>/<dossier>/<fichier>`. Les identifiants tiennent
 * dans la forme que la base du coffre exige (`^[A-Za-z0-9_-]{1,64}$`) : un dossier `sb_<32 hex>`, un fichier
 * `<dossier>-<24 hex>` ; son chemin s'en DÉDUIT.
 *
 * Changé à la reprise : Supabase seul (le kDrive d'un propriétaire n'est pas repris) ; ni l'indexation pour la
 * recherche ni la citation vérifiée, qui lisent le fichier sur le serveur et attendent le bac à sable de la vague 0.
 *
 * PUR à ses dépendances près (injectées) : la route (`app/api/coffre/[projet]`) ne fait que la porte.
 */
import { randomBytes } from 'node:crypto';

type Issue<T> = { readonly lu: true; readonly valeur: T } | { readonly lu: false; readonly pourquoi: string };
const lu = <T>(valeur: T): Issue<T> => ({ lu: true, valeur });
const pasLu = <T>(pourquoi: string): Issue<T> => ({ lu: false, pourquoi });

export const SEAU_DES_COFFRES = 'coffres';
export const OCTETS_D_UN_DOCUMENT = 25 * 1024 * 1024;

export interface FichierLu { readonly nom: string; readonly octets: Uint8Array; readonly type: string | null }

/** Ce que le coffre demande au seau — injecté (un essai n'atteint pas Supabase). */
export interface SeauDuCoffre {
  deposer(chemin: string, octets: Uint8Array): Promise<string | null>;
  lire(chemin: string): Promise<Issue<Uint8Array | null>>;
  lister(prefixe: string): Promise<Issue<string[]>>;
  supprimer(chemins: readonly string[]): Promise<string | null>;
}

export interface DependancesDuCoffre {
  schema(projet: string): Promise<Issue<string>>;
  /** `public.plateforme_pour` — la base, au nom du compte. */
  base(compte: string, schema: string, fonction: string, args: Record<string, unknown>): Promise<Issue<unknown>>;
  readonly seau: SeauDuCoffre;
}

const DOSSIER = /^sb_[0-9a-f]{32}$/;
const FICHIER = /^(sb_[0-9a-f]{32})-([0-9a-f]{24})$/;
const hex = (octets: number): string => randomBytes(octets).toString('hex');

/** PURE — le chemin d'un identifiant dans le seau (un dossier : son préfixe) ; `null` : pas un identifiant du coffre. */
export function cheminDansLeSeau(projet: string, id: string): string | null {
  if (!/^[0-9a-f-]{8,64}$/i.test(projet)) return null;
  if (DOSSIER.test(id)) return `${projet}/${id}`;
  const f = FICHIER.exec(id);
  return f ? `${projet}/${f[1]}/${f[2]}` : null;
}

/** Un refus de la base, dit sans le jargon : ce qui arrive à la personne. */
export function enMotsDuCoffre(pourquoi: string): string {
  const m = /coffre : (.+?)(?: \(SQLSTATE|$)/.exec(pourquoi);
  return m ? `Le coffre : ${m[1]}` : `Le coffre n’a pas pu répondre : ${pourquoi}`;
}

/** Efface un dossier (tout ce qu'il contient) ou un fichier ; un fichier déjà absent est effacé. */
async function effacer(projet: string, id: string, seau: SeauDuCoffre): Promise<Issue<true>> {
  const c = cheminDansLeSeau(projet, id);
  if (!c) return pasLu(`« ${id} » n’est pas un document du coffre de cette app.`);
  const cibles = DOSSIER.test(id) ? await seau.lister(c) : lu([c]);
  if (!cibles.lu) return pasLu(`Le coffre n’a pas pu lister le dossier : ${cibles.pourquoi}`);
  const faute = await seau.supprimer(cibles.valeur);
  return faute ? pasLu(`Le coffre n’a pas pu effacer : ${faute}`) : lu(true as const);
}

export interface Depot { readonly id: string; readonly nom: string; readonly taille: number }

export async function deposerAuCoffre(projet: string, compte: string, fichier: FichierLu, d: DependancesDuCoffre): Promise<Issue<Depot>> {
  if (fichier.octets.byteLength === 0) return pasLu('Le fichier est vide.');
  if (fichier.octets.byteLength > OCTETS_D_UN_DOCUMENT) return pasLu(`Le fichier pèse plus de ${OCTETS_D_UN_DOCUMENT / 1024 / 1024} Mo.`);
  const schema = await d.schema(projet);
  if (!schema.lu) return schema;
  const prep = await d.base(compte, schema.valeur, 'coffre_preparer', {});
  if (!prep.lu) return pasLu(enMotsDuCoffre(prep.pourquoi));
  const p = (prep.valeur ?? {}) as { organisation?: string; dossier?: string | null };
  if (!p.organisation) return pasLu('Le coffre : ce compte n’a pas de coffre.');
  let dossier = typeof p.dossier === 'string' ? p.dossier : null;
  if (!dossier) {
    // LE DOSSIER DE L'ORGANISATION, créé au premier dépôt et RANGÉ EN BASE ; son nom ne dit rien de personnel.
    const pose = await d.base(compte, schema.valeur, 'coffre_poser_le_dossier', { p_kdrive_id: `sb_${hex(16)}` });
    if (!pose.lu) return pasLu(enMotsDuCoffre(pose.pourquoi));
    dossier = String(pose.valeur); // un autre dépôt a pu le ranger avant : c'est le sien qui vaut
  }
  if (!DOSSIER.test(dossier)) return pasLu('Le coffre de cette organisation est rangé ailleurs que dans Supabase : il ne s’ouvre pas ici.');
  const id = `${dossier}-${hex(12)}`;
  const faute = await d.seau.deposer(cheminDansLeSeau(projet, id)!, fichier.octets);
  if (faute) return pasLu(`Le coffre n’a pas pu ranger le fichier : ${faute}`);
  const enr = await d.base(compte, schema.valeur, 'coffre_enregistrer', {
    p_kdrive_id: id, p_nom: fichier.nom.slice(0, 255) || 'document', p_taille: fichier.octets.byteLength, p_type: fichier.type ?? '',
  });
  if (!enr.lu) {
    // REFUSÉ PAR LA BASE (coffre plein, compte sans coffre) : le fichier ne reste pas dans le stockage sans ligne.
    const r = await effacer(projet, id, d.seau);
    if (!r.lu) console.error(`[Coffre] ${projet.slice(0, 8)} — ${id} refusé par la base et resté dans le seau : ${r.pourquoi}`);
    return pasLu(enMotsDuCoffre(enr.pourquoi));
  }
  return lu({ id: String((enr.valeur as { id?: unknown } | null)?.id ?? ''), nom: fichier.nom, taille: fichier.octets.byteLength });
}

export async function ouvrirDuCoffre(projet: string, compte: string, id: string, d: DependancesDuCoffre): Promise<Issue<FichierLu>> {
  const schema = await d.schema(projet);
  if (!schema.lu) return schema;
  const f = await d.base(compte, schema.valeur, 'coffre_le_fichier', { p_id: id });
  if (!f.lu) return pasLu(enMotsDuCoffre(f.pourquoi));
  const v = f.valeur as { kdriveId?: string; nom?: string; type?: string | null } | null;
  const chemin = v?.kdriveId && FICHIER.test(v.kdriveId) ? cheminDansLeSeau(projet, v.kdriveId) : null;
  if (!v || !chemin) return pasLu('Le coffre : ce fichier n’est pas dans le coffre de ce compte.');
  const o = await d.seau.lire(chemin);
  if (!o.lu) return pasLu(`Le coffre n’a pas pu lire le fichier : ${o.pourquoi}`);
  if (!o.valeur) return pasLu('Le fichier n’est plus dans le coffre.');
  return lu({ nom: v.nom ?? 'document', type: v.type ?? null, octets: o.valeur });
}

export async function retirerDuCoffre(projet: string, compte: string, id: string, d: DependancesDuCoffre): Promise<Issue<true>> {
  const schema = await d.schema(projet);
  if (!schema.lu) return schema;
  const r = await d.base(compte, schema.valeur, 'coffre_retirer', { p_id: id });
  if (!r.lu) return pasLu(enMotsDuCoffre(r.pourquoi));
  const range = String((r.valeur as { kdriveId?: unknown } | null)?.kdriveId ?? '');
  const e = await effacer(projet, range, d.seau);
  if (!e.lu) {
    console.error(`[Coffre] ${projet.slice(0, 8)} — ${range} retiré de la base, resté dans le seau : ${e.pourquoi}`);
    return pasLu(`Le fichier est retiré du coffre de l’app, mais son stockage ne l’a pas effacé : ${e.pourquoi}`);
  }
  return lu(true as const);
}

/** VIDER LE COFFRE de son organisation : la base retire tout (un rôle qui gère l'équipe), puis le seau efface. */
export async function viderLeCoffre(projet: string, compte: string, d: DependancesDuCoffre): Promise<Issue<{ readonly documents: number }>> {
  const schema = await d.schema(projet);
  if (!schema.lu) return schema;
  const r = await d.base(compte, schema.valeur, 'coffre_vider', {});
  if (!r.lu) return pasLu(enMotsDuCoffre(r.pourquoi));
  const v = (r.valeur ?? {}) as { dossier?: string | null; fichiers?: unknown };
  const fichiers = Array.isArray(v.fichiers) ? v.fichiers.filter((x): x is string => typeof x === 'string') : [];
  // Chaque fichier nommé par la base, puis le dossier pour ce qui y resterait.
  const ids = [...fichiers, ...(v.dossier ? [v.dossier] : [])];
  const fautes: string[] = [];
  for (const id of ids) {
    const e = await effacer(projet, id, d.seau);
    if (!e.lu) fautes.push(`${id} : ${e.pourquoi}`);
  }
  if (fautes.length > 0) {
    console.error(`[Coffre] ${projet.slice(0, 8)} — effacement incomplet : ${fautes.join(' ; ')}`);
    return pasLu(`Les documents sont retirés de l’app, mais le stockage n’a pas tout effacé (${fautes.length} sur ${ids.length}).`);
  }
  return lu({ documents: fichiers.length });
}
