// Repris de constructor-v13@32d18f3 : app/api/ai/[projectId]/complete/route.ts, lib/capabilities/reponse-structuree.ts et
// lib/capabilities/la-proposition-de-l-ia.ts (la forme forcée par un outil, la réponse coupée qui n'est pas une décision,
// les images bornées, la proposition écrite par la plateforme). Sans le SDK : un appel HTTP, la clé du propriétaire.
/**
 * L'IA D'UNE APP — `ai/<projet>/complete`, sur la clé Anthropic du PROPRIÉTAIRE (`ANTHROPIC_API_KEY`, posée par
 * `set_secret` ou dans la console), jamais sur celle de la plateforme (règle 3). Deux formes : du texte, ou une DONNÉE à la
 * forme d'un JSON Schema (outil forcé). Avec `proposer: { table }`, la donnée est enregistrée comme proposition de l'IA
 * (`<table>_proposer`, au nom du compte, sous la RLS de l'app) : une personne en fait un fait.
 */
import { createHash } from 'node:crypto';
import { estUnIdentifiantSql } from '@/lib/relais/identifiant-sql';

export type Issue<T> = { readonly lu: true; readonly valeur: T } | { readonly lu: false; readonly pourquoi: string };

export const SECRET_DE_L_IA = 'ANTHROPIC_API_KEY';
/** Le modèle des apps : une seule manette, `VAVI_MODELE_DES_APPS`. */
export const MODELE_PAR_DEFAUT = 'claude-sonnet-5-5';
export const NOM_DE_L_OUTIL = 'reponse';
export const TAILLE_MAX_DU_SCHEMA = 20_000;
export const TAILLE_MAX_DU_TEXTE = 200_000;
export const IMAGES_PAR_APPEL = 6;
export const CARACTERES_PAR_IMAGE = 7_000_000;
const DATA_IMAGE = /^data:image\/(jpeg|png|webp|gif);base64,([A-Za-z0-9+/=]+)$/;

export interface Outil { readonly name: string; readonly description: string; readonly input_schema: Record<string, unknown> }
export interface DemandeALIA {
  readonly prompt: string;
  readonly system: string | null;
  readonly maxTokens: number;
  readonly outil: Outil | null;
  readonly images: readonly { readonly type: string; readonly donnees: string }[];
  readonly proposer: string | null;
}

/** Ce que la page envoie, relu ; un refus dit quoi changer. PUR. */
export function lireLaDemande(corps: Record<string, unknown>): Issue<DemandeALIA> {
  const prompt = typeof corps.prompt === 'string' ? corps.prompt : '';
  if (!prompt.trim()) return { lu: false, pourquoi: '« prompt » : le texte à envoyer au modèle' };
  const system = typeof corps.system === 'string' && corps.system.trim() ? corps.system : null;
  if (prompt.length + (system?.length ?? 0) > TAILLE_MAX_DU_TEXTE) return { lu: false, pourquoi: `un texte de ${TAILLE_MAX_DU_TEXTE} caractères au plus` };
  const maxTokens = Math.min(Math.max(Number(corps.maxTokens) || 2048, 256), 8000);

  let outil: Outil | null = null;
  if (corps.schema !== undefined && corps.schema !== null) {
    const s = corps.schema as Record<string, unknown>;
    if (typeof s !== 'object' || Array.isArray(s) || s.type !== 'object') return { lu: false, pourquoi: '« schema » est un JSON Schema d’objet ({ type: "object", properties: {…} })' };
    if (!s.properties || typeof s.properties !== 'object' || Array.isArray(s.properties) || Object.keys(s.properties).length === 0) {
      return { lu: false, pourquoi: '« schema.properties » nomme au moins un champ' };
    }
    if (JSON.stringify(s).length > TAILLE_MAX_DU_SCHEMA) return { lu: false, pourquoi: '« schema » trop volumineux' };
    const description = typeof corps.description === 'string' && corps.description.trim() ? corps.description.trim() : 'La réponse, dans la forme demandée.';
    outil = { name: NOM_DE_L_OUTIL, description, input_schema: s };
  }

  const images: { type: string; donnees: string }[] = [];
  if (Array.isArray(corps.images)) {
    if (corps.images.length > IMAGES_PAR_APPEL) return { lu: false, pourquoi: `au plus ${IMAGES_PAR_APPEL} images par appel` };
    for (const [i, u] of corps.images.entries()) {
      const m = typeof u === 'string' && u.length <= CARACTERES_PAR_IMAGE ? DATA_IMAGE.exec(u) : null;
      if (!m) return { lu: false, pourquoi: `l’image n° ${i + 1} n’est pas une image JPEG, PNG, WebP ou GIF en data:, réduite` };
      images.push({ type: `image/${m[1]}`, donnees: m[2]! });
    }
  }

  let proposer: string | null = null;
  if (corps.proposer !== undefined && corps.proposer !== null) {
    const t = (corps.proposer as { table?: unknown }).table;
    if (typeof t !== 'string' || !estUnIdentifiantSql(t)) return { lu: false, pourquoi: '« proposer » est { table: "<une table de l’app qui reçoit les propositions de l’IA>" }' };
    if (!outil) return { lu: false, pourquoi: 'une proposition se demande avec un « schema » : la forme de la ligne proposée' };
    proposer = t;
  }
  return { lu: true, valeur: { prompt, system, maxTokens, outil, images, proposer } };
}

/** La requête Anthropic. L'outil est FORCÉ : « demander une forme » n'est pas « l'espérer ». PUR. */
export function laRequete(d: DemandeALIA, modele: string): Record<string, unknown> {
  return {
    model: modele,
    max_tokens: d.maxTokens,
    ...(d.system ? { system: d.system } : {}),
    messages: [{
      role: 'user',
      content: d.images.length === 0 ? d.prompt
        : [...d.images.map((i) => ({ type: 'image', source: { type: 'base64', media_type: i.type, data: i.donnees } })), { type: 'text', text: d.prompt }],
    }],
    ...(d.outil ? { tools: [d.outil], tool_choice: { type: 'tool', name: d.outil.name } } : {}),
  };
}

export interface ReponseDuModele { readonly content?: unknown; readonly stop_reason?: string | null; readonly usage?: { readonly input_tokens?: number; readonly output_tokens?: number } }
export type Verdict =
  | { readonly etat: 'texte'; readonly texte: string }
  | { readonly etat: 'decide'; readonly donnee: Record<string, unknown> }
  | { readonly etat: 'tronque' }
  | { readonly etat: 'sans-decision'; readonly empreinte: string };

/** Ce que la réponse PORTE. Une réponse coupée n'est pas une décision ; un outil appelé avec `{}` non plus. PUR. */
export function lireLaReponse(r: ReponseDuModele, forme: boolean): Verdict {
  const blocs = Array.isArray(r.content) ? (r.content as Record<string, unknown>[]) : [];
  if (r.stop_reason === 'max_tokens') return { etat: 'tronque' };
  const texte = blocs.filter((b) => b.type === 'text').map((b) => String(b.text ?? '')).join('');
  if (!forme) return { etat: 'texte', texte };
  const appel = blocs.find((b) => b.type === 'tool_use' && b.name === NOM_DE_L_OUTIL);
  const entree = appel?.input;
  if (entree && typeof entree === 'object' && !Array.isArray(entree) && Object.keys(entree).length > 0) {
    return { etat: 'decide', donnee: entree as Record<string, unknown> };
  }
  return { etat: 'sans-decision', empreinte: createHash('sha256').update(JSON.stringify(texte || blocs)).digest('hex').slice(0, 12) };
}

/** Le verdict rendu à la page : jamais 200 avec une donnée vide. PUR. */
export function laReponseHttp(v: Verdict): { readonly statut: number; readonly corps: Record<string, unknown> } {
  if (v.etat === 'texte') return { statut: 200, corps: { text: v.texte } };
  if (v.etat === 'decide') return { statut: 200, corps: { data: v.donnee } };
  if (v.etat === 'tronque') return { statut: 422, corps: { error: 'réponse coupée avant la fin', detail: 'demandez moins de champs, ou augmentez maxTokens' } };
  return { statut: 422, corps: { error: 'le modèle n’a rendu aucune donnée', detail: 'vérifiez que le schéma décrit ce que vous attendez, puis relancez' } };
}

/** L'échec du fournisseur, dit à la personne : ce qui le lève. PUR. */
export function enMotsDuFournisseur(statut: number, corps: string): string {
  if (statut === 401 || statut === 403) return `la clé ${SECRET_DE_L_IA} du propriétaire est refusée par Anthropic : il en pose une valide dans la console (Secrets)`;
  if (statut === 404) return 'ce modèle n’est pas ouvert à ce compte Anthropic';
  if (statut === 429) return 'le compte Anthropic du propriétaire est à sa limite : réessayez dans un instant';
  if (statut === 400 && /credit|billing/i.test(corps)) return 'le compte Anthropic du propriétaire n’a plus de crédit';
  return `Anthropic a répondu ${statut}`;
}

export type Appel = (url: string, init: { method: 'POST'; headers: Record<string, string>; body: string; signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

export async function appelerLeModele(appel: Appel, cle: string, requete: Record<string, unknown>, signal?: AbortSignal): Promise<Issue<ReponseDuModele> & { readonly statut?: number }> {
  try {
    const r = await appel('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': cle, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify(requete),
      ...(signal ? { signal } : {}),
    });
    const texte = await r.text().catch(() => '');
    if (!r.ok) return { lu: false, pourquoi: enMotsDuFournisseur(r.status, texte), statut: r.status };
    try { return { lu: true, valeur: JSON.parse(texte) as ReponseDuModele }; } catch { return { lu: false, pourquoi: 'réponse d’Anthropic illisible' }; }
  } catch (x) {
    return { lu: false, pourquoi: `Anthropic injoignable (${String((x as Error)?.message ?? x).slice(0, 120)})` };
  }
}

/** Ce que la base répond à une proposition, dit sans le jargon. PUR. */
export function enMotsDeLaProposition(table: string, pourquoi: string): string {
  if (/does not exist|introuvable|42883/.test(pourquoi)) return `« ${table} » ne reçoit pas de propositions de l’IA (app.json ne les déclare pas) : rien n’a été enregistré.`;
  if (/row-level security|42501/.test(pourquoi)) return `Ce compte ne peut pas ajouter de ligne à « ${table} » : la proposition n’a pas été enregistrée.`;
  return `La proposition n’a pas pu être enregistrée dans « ${table} » : ${pourquoi.replace(/\s*\(SQLSTATE.*$/, '')}`;
}

/** `public.plateforme_pour`, au nom du compte. */
export type BaseAuNomDuCompte = (compte: string, schema: string, fonction: string, args: Record<string, unknown>) => Promise<Issue<unknown>>;

/** ENREGISTRE la donnée comme proposition de `table`, au nom de `compte`. Rend l'id de la ligne. */
export async function enregistrerLaProposition(schema: string, compte: string, table: string, donnee: Record<string, unknown>, base: BaseAuNomDuCompte): Promise<Issue<string>> {
  const r = await base(compte, schema, `${table}_proposer`, { p_ligne: donnee });
  if (!r.lu) return { lu: false, pourquoi: enMotsDeLaProposition(table, r.pourquoi) };
  return typeof r.valeur === 'string' ? { lu: true, valeur: r.valeur } : { lu: false, pourquoi: `la base n’a pas rendu l’identifiant de la proposition dans « ${table} »` };
}
