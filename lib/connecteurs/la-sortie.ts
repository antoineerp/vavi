// Repris de constructor-v13@32d18f3 : lib/security/sortie-reseau.ts (la porte de sortie : https seul, adresse IP littérale
// refusée, DNS résolu et chaque adresse non interne, redirections suivies à la main). Sans le jeton « tout hôte public » ni la
// lecture en octets, que rien n'emploie dans vavi.
/**
 * ============================================================================
 * LA SORTIE RÉSEAU DU SERVEUR — un connecteur sortant est un SSRF en puissance
 * ============================================================================
 * Phase 3 des connecteurs (27/08). Dès que la plateforme appelle une URL
 * DÉCIDÉE PAR UN TIERS (le manifeste d'un connecteur, la configuration d'un
 * projet), elle prête son réseau. Et son réseau atteint des choses que
 * personne d'autre n'atteint :
 *
 *     http://169.254.169.254/latest/meta-data/iam/…   les identifiants de
 *                                                     l'infrastructure
 *     http://127.0.0.1:54321/                          les services internes
 *     http://10.0.0.5/                                 le réseau privé
 *
 * C'est le cas d'école du SSRF, et un connecteur MCP sortant en est la forme
 * la plus directe : l'attaquant n'a même pas à trouver une faille, on lui
 * demande poliment quelle URL appeler.
 *
 * ── CE QUE LA LISTE D'HÔTES NE SUFFIT PAS À FAIRE ─────────────────────────
 * Une liste blanche vérifiée À L'ENREGISTREMENT du connecteur ne protège de
 * rien : trois chemins la contournent, et les trois sont ordinaires.
 *
 *   1. LA REDIRECTION. `https://hote-autorise.example/x` répond `302
 *      http://169.254.169.254/`. Le client HTTP suit par DÉFAUT, et l'appel
 *      sort de la liste sans que personne ne l'ait décidé. → on suit les
 *      redirections À LA MAIN, et CHAQUE saut est revalidé.
 *   2. LE NOM QUI RÉSOUT AILLEURS. `hote-autorise.example` est un nom :
 *      rien n'empêche son propriétaire de le faire pointer sur une adresse
 *      privée. Vérifier le NOM ne dit rien de la DESTINATION. → on résout, et
 *      on vérifie TOUTES les adresses rendues.
 *   3. L'ADRESSE ÉCRITE EN CLAIR. `http://169.254.169.254/` n'a pas de nom à
 *      comparer. → une URL dont l'hôte est une adresse IP littérale est
 *      refusée d'emblée : une liste blanche se fait par NOM.
 *
 * ── CE QUE CE MODULE N'EST PAS ────────────────────────────────────────────
 * Ce n'est pas un client HTTP « amélioré » : c'est une PORTE. Il ne connaît
 * aucun service, aucun fournisseur, aucun métier (règle 1) — il reçoit une
 * liste d'hôtes autorisés et il l'applique. Le jour où un connecteur de plus
 * existe, rien ici ne change.
 *
 * ── SENS SÛR ──────────────────────────────────────────────────────────────
 * Toute incertitude REFUSE. Résolution DNS impossible, adresse illisible,
 * schéma inconnu, redirection sans destination : on ne sort pas. C'est
 * l'inverse du sens sûr habituel de ce dépôt (« je n'ai pas pu lire » ⇒ on ne
 * conclut rien), et c'est délibéré : ici, ne pas conclure signifierait
 * ENVOYER. Un appel refusé se voit et se corrige ; un appel sorti ne se
 * reprend pas.
 */

import { lookup as dnsLookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export interface SortieRefusee {
  ok: false;
  /** Le motif, nommé — jamais un code nu (convention du 402). */
  raison:
    | 'schema-refuse'      // autre chose que https
    | 'adresse-litterale'  // une IP au lieu d'un nom : rien à comparer
    | 'hote-hors-liste'    // le nom n'est pas dans la liste du connecteur
    | 'dns-illisible'      // on n'a pas pu résoudre : on ne sort pas
    | 'adresse-interne'    // le nom résout vers une adresse non routable
    | 'trop-de-sauts'      // chaîne de redirections trop longue
    | 'redirection-vide';  // un 3xx sans destination lisible
  detail: string;
}

export type VerdictSortie = { ok: true; hote: string } | SortieRefusee;

/** Résolveur injectable — les tests sont hermétiques, la production utilise le DNS. */
export type Resolveur = (nom: string) => Promise<string[]>;

const resolveurParDefaut: Resolveur = async (nom) => {
  const adresses = await dnsLookup(nom, { all: true });
  return adresses.map((a) => a.address);
};

/**
 * Une adresse qu'un serveur ne doit jamais joindre sur ordre d'un tiers.
 *
 * Ce n'est pas une liste de « mauvais » hôtes (elle serait toujours
 * incomplète) : c'est l'ensemble des plages NON ROUTABLES sur l'internet
 * public. Tout ce qui n'est pas routable publiquement est, par définition,
 * quelque chose que seul NOTRE serveur peut atteindre — donc quelque chose
 * qu'un tiers n'a aucune raison de nous faire appeler.
 */
export function adresseInterne(adresse: string): boolean {
  const v = isIP(adresse);
  if (v === 4) {
    const o = adresse.split('.').map(Number);
    if (o.length !== 4 || o.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
    const [a = 0, b = 0] = o;
    if (a === 0) return true;                          // « cet hôte »
    if (a === 10) return true;                         // privé
    if (a === 127) return true;                        // boucle locale
    if (a === 169 && b === 254) return true;           // lien-local ET métadonnées cloud
    if (a === 172 && b >= 16 && b <= 31) return true;  // privé
    if (a === 192 && b === 168) return true;           // privé
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a === 192 && b === 0) return true;             // IETF / protocoles
    if (a >= 224) return true;                         // multicast + réservé + broadcast
    return false;
  }
  if (v === 6) {
    const s = adresse.toLowerCase().replace(/^\[|\]$/g, '');
    if (s === '::' || s === '::1') return true;                       // non spécifiée, boucle
    if (s.startsWith('fe80')) return true;                            // lien-local
    if (/^f[cd]/.test(s)) return true;                                // unique-local
    // IPv4 encapsulée : on juge l'adresse v4 qu'elle transporte, sinon
    // `::ffff:169.254.169.254` passerait la porte.
    const v4 = s.match(/(\d{1,3}(?:\.\d{1,3}){3})$/)?.[1];
    if (v4) return adresseInterne(v4);
    return false;
  }
  return true; // illisible ⇒ refus (sens sûr)
}

/**
 * L'hôte est-il couvert par la liste ? Correspondance EXACTE, ou sous-domaine
 * d'une entrée écrite `*.domaine`. Jamais une correspondance par sous-chaîne :
 * `api.exemple.com` ne doit pas autoriser `api.exemple.com.attaquant.net`.
 */
export function hoteCouvert(hote: string, autorises: ReadonlyArray<string>): boolean {
  const h = String(hote || '').toLowerCase().replace(/\.$/, '');
  if (!h) return false;
  return autorises.some((brut) => {
    const e = String(brut || '').toLowerCase().trim().replace(/\.$/, '');
    if (!e) return false;
    if (e.startsWith('*.')) {
      const suffixe = e.slice(1); // « .domaine »
      return h.endsWith(suffixe) && h.length > suffixe.length;
    }
    return h === e;
  });
}

/**
 * La porte, appliquée à UNE url. Appelée à chaque saut de redirection — c'est
 * ce qui distingue cette vérification d'un contrôle à l'enregistrement.
 */
export async function verifierSortie(
  url: string,
  autorises: ReadonlyArray<string>,
  resolveur: Resolveur = resolveurParDefaut,
  toutHotePublic = false,
): Promise<VerdictSortie> {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return { ok: false, raison: 'schema-refuse', detail: `URL illisible : ${String(url).slice(0, 120)}` };
  }
  if (u.protocol !== 'https:') {
    return {
      ok: false,
      raison: 'schema-refuse',
      detail: `Seul https est autorisé pour un appel sortant (reçu : ${u.protocol.replace(':', '')}). En clair, la clé du projet voyagerait lisible.`,
    };
  }

  const hote = u.hostname.replace(/^\[|\]$/g, '');
  if (isIP(hote) !== 0) {
    return {
      ok: false,
      raison: 'adresse-litterale',
      detail: `L'hôte est une adresse IP (${hote}). Une liste d'hôtes autorisés se compare par NOM : une adresse écrite en clair n'a rien à comparer, et c'est la façon la plus directe d'atteindre le réseau interne.`,
    };
  }

  if (!toutHotePublic && !hoteCouvert(hote, autorises)) {
    return {
      ok: false,
      raison: 'hote-hors-liste',
      detail: `${hote} n'est pas dans les hôtes déclarés par ce connecteur (${autorises.slice(0, 3).join(', ') || 'aucun'}).`,
    };
  }

  let adresses: string[];
  try {
    adresses = await resolveur(hote);
  } catch (e) {
    return { ok: false, raison: 'dns-illisible', detail: `${hote} n'a pas pu être résolu (${(e as Error)?.message || 'erreur DNS'}) — on ne sort pas sur un doute.` };
  }
  if (!adresses.length) {
    return { ok: false, raison: 'dns-illisible', detail: `${hote} ne résout vers aucune adresse — on ne sort pas sur un doute.` };
  }
  // TOUTES les adresses, pas la première : un nom peut en rendre plusieurs, et
  // il suffit qu'UNE soit interne pour que l'appel soit une tentative.
  const interne = adresses.find((a) => adresseInterne(a));
  if (interne) {
    return {
      ok: false,
      raison: 'adresse-interne',
      detail: `${hote} résout vers ${interne}, une adresse non routable publiquement. Un nom autorisé qui pointe vers le réseau interne est la façon normale de contourner une liste blanche.`,
    };
  }

  return { ok: true, hote };
}

export interface OptionsSortie {
  hotesAutorises: ReadonlyArray<string>;
  methode?: string;
  entetes?: Record<string, string>;
  corps?: string;
  /** Plafonds — un connecteur ne doit pas pouvoir immobiliser le serveur. */
  delaiMs?: number;
  tailleMaxOctets?: number;
  sautsMax?: number;
  resolveur?: Resolveur;
  /** Injectable pour les tests ; la production utilise `fetch`. */
  transport?: typeof fetch;
  /**
   * Tout hôte PUBLIC, sans liste (la reprise des images d'un site que la personne nomme, 26/11) : le reste de la porte
   * tient (https seul, aucune adresse littérale ni interne, chaque saut revalidé).
   */
  toutHotePublic?: boolean;
}

export interface ReponseSortante {
  ok: boolean;
  statut: number;
  corps: string;
  /** L'hôte réellement atteint — après redirections. */
  hote: string;
}

export const DELAI_SORTIE_MS = 15_000;
export const TAILLE_MAX_OCTETS = 2 * 1024 * 1024;
export const SAUTS_MAX = 3;

/**
 * L'appel sortant. Les redirections sont suivies À LA MAIN (`redirect:
 * 'manual'`) précisément pour que chaque saut repasse par la porte : c'est le
 * seul moyen qu'une liste d'hôtes veuille dire quelque chose.
 */
export async function fetchSortant(
  url: string,
  options: OptionsSortie,
): Promise<ReponseSortante | SortieRefusee> {
  // Le corps se lit au fil de l'eau, sous le même délai, et s'arrête au plafond : un service ne remplit pas la mémoire.
  const plafond = options.tailleMaxOctets ?? TAILLE_MAX_OCTETS;
  return suivre(url, options, async (reponse, hote) => {
    const morceaux: Uint8Array[] = [];
    let total = 0;
    const lecteur = reponse.body?.getReader();
    if (lecteur) {
      for (;;) {
        const { done, value } = await lecteur.read();
        if (done) break;
        const reste = plafond - total;
        morceaux.push(value.byteLength > reste ? value.subarray(0, reste) : value);
        total += Math.min(value.byteLength, reste);
        if (total >= plafond) { await lecteur.cancel().catch(() => undefined); break; }
      }
    }
    return { ok: reponse.ok, statut: reponse.status, corps: Buffer.concat(morceaux).toString('utf8'), hote };
  }, true);
}

/** L'appel sortant, son corps rendu en octets (une image) : au-delà du plafond, `coupe` le dit et rien n'est rendu de plus. */
export async function fetchSortantEnOctets(
  url: string,
  options: OptionsSortie,
): Promise<{ readonly ok: boolean; readonly statut: number; readonly octets: Uint8Array; readonly coupe: boolean; readonly hote: string } | SortieRefusee> {
  const plafond = options.tailleMaxOctets ?? TAILLE_MAX_OCTETS;
  return suivre(url, options, async (reponse, hote) => {
    const morceaux: Uint8Array[] = [];
    let total = 0;
    let coupe = false;
    const lecteur = reponse.body?.getReader();
    if (lecteur) {
      for (;;) {
        const { done, value } = await lecteur.read();
        if (done) break;
        if (total + value.byteLength > plafond) { coupe = true; await lecteur.cancel().catch(() => undefined); break; }
        morceaux.push(value);
        total += value.byteLength;
      }
    }
    return { ok: reponse.ok, statut: reponse.status, octets: new Uint8Array(Buffer.concat(morceaux)), coupe, hote };
  }, true);
}

/** La boucle commune : la porte à chaque saut, puis `lire` sur la réponse finale. */
async function suivre<T>(
  url: string,
  options: OptionsSortie,
  lire: (reponse: Response, hote: string) => Promise<T | SortieRefusee>,
  delaiSurLeCorps = false,
): Promise<T | SortieRefusee> {
  const transport = options.transport ?? fetch;
  const sautsMax = options.sautsMax ?? SAUTS_MAX;
  const delai = options.delaiMs ?? DELAI_SORTIE_MS;
  let courante = url;

  for (let saut = 0; saut <= sautsMax; saut++) {
    const verdict = await verifierSortie(courante, options.hotesAutorises, options.resolveur, options.toutHotePublic === true);
    if (!verdict.ok) return verdict;

    const controleur = new AbortController();
    const minuteur = setTimeout(() => controleur.abort(), delai);
    let reponse: Response;
    try {
      reponse = await transport(courante, {
        method: saut === 0 ? (options.methode || 'GET') : 'GET',
        headers: saut === 0 ? options.entetes : undefined,
        body: saut === 0 ? options.corps : undefined,
        redirect: 'manual',
        signal: controleur.signal,
      } as RequestInit);
    } catch (e) {
      clearTimeout(minuteur);
      throw e;
    }
    if (!delaiSurLeCorps) clearTimeout(minuteur);

    if (reponse.status >= 300 && reponse.status < 400) {
      clearTimeout(minuteur);
      const cible = reponse.headers.get('location');
      if (!cible) {
        return { ok: false, raison: 'redirection-vide', detail: `${courante} répond ${reponse.status} sans destination lisible.` };
      }
      // Une destination RELATIVE reste sur le même hôte : elle repasse quand
      // même par la porte, parce que rien ne garantit qu'elle le reste après
      // résolution.
      courante = new URL(cible, courante).toString();
      continue;
    }

    try {
      return await lire(reponse, verdict.hote);
    } finally {
      clearTimeout(minuteur);
    }
  }

  return {
    ok: false,
    raison: 'trop-de-sauts',
    detail: `Plus de ${sautsMax} redirections depuis ${url} — une chaîne aussi longue sert à sortir de la liste, pas à servir une ressource.`,
  };
}
