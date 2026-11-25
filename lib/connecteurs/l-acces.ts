// Repris de constructor-v13@32d18f3 : lib/capabilities/l-acces-des-connecteurs.ts (la forme de l'accès, les modèles des
// logiciels annoncés). Les aides parlent au vous de la console vavi ; le modèle Stripe (lecture) est retiré : vavi a son paiement.
/**
 * ============================================================================
 * L'ACCÈS D'UN CONNECTEUR — comment sa clé part, et les logiciels annoncés, branchés pour de vrai (30/09)
 * ============================================================================
 *
 * CE QU'IL REMPLACE (interdit 9) : le connecteur n'envoyait sa clé qu'en « Authorization: Bearer ». Algolia (en-têtes
 * `X-Algolia-*`), Cloudinary (identifiant:secret), Supabase (`apikey`)… ne se branchaient donc pas — et « Clés API »
 * les ANNONÇAIT quand même, avec des champs que rien ne lisait (audit du 30/09 : « des vrais connecteurs avec les
 * applications déjà annoncées »).
 *
 * LA RÈGLE (plateforme) : l'accès se DÉCLARE (une forme fermée) et part chiffré avec la clé ; les logiciels annoncés
 * sont des MODÈLES du même connecteur (adresse, forme, en-têtes fixes) que la personne complète — une seule mécanique,
 * la même porte de sortie. Aucun cas particulier dans l'appel : il lit la forme, il ne connaît aucun logiciel. Pur.
 */

export type FormeDAcces = 'bearer' | 'entete' | 'basique' | 'entete-et-bearer';

export interface AccesDeConnecteur {
  readonly forme: FormeDAcces;
  /** Pour `entete` et `entete-et-bearer` : le nom de l'en-tête qui porte la clé. */
  readonly entete?: string;
  /** En-têtes fixes, non secrets (un identifiant d'application, une version d'API). */
  readonly fixes?: Readonly<Record<string, string>>;
}

export const ACCES_PAR_DEFAUT: AccesDeConnecteur = { forme: 'bearer' };
export const FORMES_D_ACCES: readonly FormeDAcces[] = ['bearer', 'entete', 'basique', 'entete-et-bearer'];

const NOM_D_ENTETE = /^[A-Za-z0-9][A-Za-z0-9-]{0,63}$/;
/** Ce qu'un connecteur ne pose jamais : la porte, le transport, l'identité. */
const ENTETES_INTERDITS = new Set(['host', 'content-length', 'cookie', 'connection', 'transfer-encoding', 'content-type', 'authorization', 'x-forwarded-for']);

type Issue<T> = { readonly ok: true; readonly valeur: T } | { readonly ok: false; readonly raison: string };

/** PURE — la forme d'un accès ; absent : Bearer. Chaque faute nommée. */
export function lireLAcces(brut: unknown): Issue<AccesDeConnecteur> {
  if (brut === undefined || brut === null) return { ok: true, valeur: ACCES_PAR_DEFAUT };
  const o = (typeof brut === 'object' ? brut : {}) as Record<string, unknown>;
  const forme = String(o.forme ?? 'bearer') as FormeDAcces;
  if (!FORMES_D_ACCES.includes(forme)) return { ok: false, raison: `la façon d’envoyer la clé est l’une de : ${FORMES_D_ACCES.join(', ')}` };
  const entete = typeof o.entete === 'string' ? o.entete.trim() : '';
  if ((forme === 'entete' || forme === 'entete-et-bearer') && (!NOM_D_ENTETE.test(entete) || ENTETES_INTERDITS.has(entete.toLowerCase()))) {
    return { ok: false, raison: 'le nom de l’en-tête qui porte la clé est un nom d’en-tête HTTP (ex. X-Api-Key)' };
  }
  const fixes: Record<string, string> = {};
  if (o.fixes && typeof o.fixes === 'object') {
    for (const [k, v] of Object.entries(o.fixes as Record<string, unknown>)) {
      if (!NOM_D_ENTETE.test(k) || ENTETES_INTERDITS.has(k.toLowerCase())) return { ok: false, raison: `« ${k} » n’est pas un en-tête qu’un connecteur peut poser` };
      const val = String(v ?? '').trim();
      if (!val || val.length > 500 || /[\r\n]/.test(val)) return { ok: false, raison: `la valeur de « ${k} » est vide ou illisible` };
      fixes[k] = val;
    }
  }
  if (Object.keys(fixes).length > 8) return { ok: false, raison: 'huit en-têtes fixes au plus' };
  return { ok: true, valeur: { forme, ...(entete && forme !== 'bearer' && forme !== 'basique' ? { entete } : {}), ...(Object.keys(fixes).length ? { fixes } : {}) } };
}

/** PURE — les en-têtes d'un appel : la clé selon sa forme, et les en-têtes fixes. Sans clé : les fixes seuls. */
export function entetesDeLAcces(acces: AccesDeConnecteur, cle: string | null): Record<string, string> {
  const e: Record<string, string> = { ...(acces.fixes ?? {}) };
  if (!cle) return e;
  switch (acces.forme) {
    case 'bearer': e.authorization = `Bearer ${cle}`; break;
    case 'basique': e.authorization = `Basic ${Buffer.from(cle, 'utf-8').toString('base64')}`; break;
    case 'entete': e[acces.entete as string] = cle; break;
    case 'entete-et-bearer': e[acces.entete as string] = cle; e.authorization = `Bearer ${cle}`; break;
  }
  return e;
}

/**
 * LES LOGICIELS ANNONCÉS — chacun un MODÈLE du connecteur : ce que la personne complète (ses champs), l'adresse et
 * l'accès qui en dérivent. `{champ}` se remplace par la valeur saisie. Retirés de l'annonce faute d'API à clé
 * (OAuth ou fournisseur non nommé) : Google Drive, Firebase, « Open Banking », « ERP Sync ». Tout autre logiciel à clé se
 * branche en « Autre logiciel » (son adresse, sa façon d'envoyer la clé).
 */
export interface ModeleDeConnecteur {
  readonly id: string;
  readonly nom: string;
  readonly nomDansLApp: string;
  readonly aide: string;
  readonly ouTrouverLaCle: string;
  readonly champs: ReadonlyArray<{ readonly id: string; readonly libelle: string; readonly exemple: string }>;
  readonly baseUrl: string;
  readonly acces: AccesDeConnecteur;
  /** Comment la clé se compose des champs (Cloudinary : `{apiKey}:{apiSecret}`) ; absent : le champ « cle ». */
  readonly cle?: string;
}

export const MODELES_DE_CONNECTEURS: readonly ModeleDeConnecteur[] = [
  {
    id: 'n8n', nom: 'n8n', nomDansLApp: 'n8n',
    aide: 'Déclenche vos workflows n8n : l’app appelle le chemin de votre webhook (ex. « /mon-flux »).',
    ouTrouverLaCle: 'Dans n8n, nœud Webhook → Authentication « Header Auth » : le nom et la valeur que vous y mettez.',
    champs: [{ id: 'instance', libelle: 'Adresse de vos webhooks', exemple: 'https://mon-equipe.app.n8n.cloud/webhook' }, { id: 'entete', libelle: 'Nom de l’en-tête d’authentification', exemple: 'X-N8N-Token' }],
    baseUrl: '{instance}', acces: { forme: 'entete', entete: '{entete}' },
  },
  {
    id: 'algolia', nom: 'Algolia', nomDansLApp: 'algolia',
    aide: 'Recherche instantanée : l’app interroge vos index (ex. « /1/indexes/produits/query »).',
    ouTrouverLaCle: 'dashboard.algolia.com → Settings → API Keys : Application ID et une clé (Search ou Admin selon l’usage).',
    champs: [{ id: 'appId', libelle: 'Application ID', exemple: 'ABCD1234EF' }],
    baseUrl: 'https://{appId}-dsn.algolia.net', acces: { forme: 'entete', entete: 'X-Algolia-API-Key', fixes: { 'X-Algolia-Application-Id': '{appId}' } },
  },
  {
    id: 'cloudinary', nom: 'Cloudinary', nomDansLApp: 'cloudinary',
    aide: 'Vos images et vidéos : l’app appelle l’API d’administration (ex. « /resources/image »).',
    ouTrouverLaCle: 'console.cloudinary.com → Settings → API Keys : Cloud name, API Key et API Secret (la clé ci-dessous).',
    champs: [{ id: 'cloudName', libelle: 'Cloud name', exemple: 'mon-cloud' }, { id: 'apiKey', libelle: 'API Key', exemple: '123456789012345' }],
    baseUrl: 'https://api.cloudinary.com/v1_1/{cloudName}', acces: { forme: 'basique' }, cle: '{apiKey}:{cle}',
  },
  {
    id: 'cal-com', nom: 'Cal.com', nomDansLApp: 'calcom',
    aide: 'Vos rendez-vous : l’app lit et crée des réservations (ex. « /bookings »).',
    ouTrouverLaCle: 'app.cal.com → Settings → Developer → API Keys.',
    champs: [],
    baseUrl: 'https://api.cal.com/v2', acces: { forme: 'bearer', fixes: { 'cal-api-version': '2024-08-13' } },
  },
  {
    id: 'supabase', nom: 'Supabase (un autre projet)', nomDansLApp: 'supabase',
    aide: 'Les tables d’un AUTRE projet Supabase, par son API REST (ex. « /rest/v1/clients?select=* »).',
    ouTrouverLaCle: 'supabase.com → votre projet → Settings → API : la référence du projet et une clé.',
    champs: [{ id: 'ref', libelle: 'Référence du projet', exemple: 'abcdefghijklmnop' }],
    baseUrl: 'https://{ref}.supabase.co', acces: { forme: 'entete-et-bearer', entete: 'apikey' },
  },
];

/** PURE — un modèle complété : la déclaration du connecteur (adresse, accès, clé composée). */
export function completerLeModele(
  modele: ModeleDeConnecteur, valeurs: Readonly<Record<string, string>>, cle: string,
): Issue<{ baseUrl: string; acces: AccesDeConnecteur; cle: string }> {
  const manquants = modele.champs.filter((c) => !String(valeurs[c.id] ?? '').trim());
  if (manquants.length > 0) return { ok: false, raison: `à remplir : ${manquants.map((c) => c.libelle).join(', ')}` };
  const place = (t: string): string => t.replace(/\{(\w+)\}/g, (_m, k: string) => (k === 'cle' ? cle : String(valeurs[k] ?? '').trim()));
  const fixes = modele.acces.fixes ? Object.fromEntries(Object.entries(modele.acces.fixes).map(([k, v]) => [k, place(v)])) : undefined;
  const acces = lireLAcces({ forme: modele.acces.forme, ...(modele.acces.entete ? { entete: place(modele.acces.entete) } : {}), ...(fixes ? { fixes } : {}) });
  if (!acces.ok) return acces;
  return { ok: true, valeur: { baseUrl: place(modele.baseUrl).replace(/\/+$/, ''), acces: acces.valeur, cle: modele.cle ? place(modele.cle) : cle } };
}
