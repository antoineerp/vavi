/**
 * LES LIMITES DE DÉBIT — une fenêtre glissante par clé (un compte, une adresse IP), tenue en mémoire du processus.
 * Ce qu'elle arrête : un client qui boucle, un robot qui inscrit des clients ou rejoue des codes, un lot JSON-RPC géant.
 * La machine est seule aujourd'hui ; à plusieurs, chaque machine tient sa part (la limite réelle se multiplie par leur
 * nombre, jamais ne se perd).
 *
 * Neuf dans vavi (vague 0, audit du 24/11 : aucune limite de débit, lot JSON-RPC joué en Promise.all).
 */
export interface Limite { readonly nombre: number; readonly fenetreMs: number }

export const LIMITES = {
  /** Les appels MCP d'un compte. */
  mcp: { nombre: 240, fenetreMs: 60_000 },
  /** L'inscription d'un client OAuth, par adresse IP. */
  inscription: { nombre: 20, fenetreMs: 60 * 60_000 },
  /** L'échange de codes et les renouvellements, par adresse IP. */
  jeton: { nombre: 60, fenetreMs: 60_000 },
  /** Les autorisations données, par adresse IP. */
  autoriser: { nombre: 30, fenetreMs: 60_000 },
} as const satisfies Record<string, Limite>;

/** Les messages d'un lot JSON-RPC, au plus. */
export const LOT_AU_PLUS = 20;

/** Une fenêtre glissante : `passe` dit si l'appel entre, `apres` dans combien de secondes réessayer. */
export function uneFenetre(limite: Limite) {
  const vus = new Map<string, number[]>();
  return {
    passe(cle: string, maintenant = Date.now()): { readonly passe: true } | { readonly passe: false; readonly apres: number } {
      const recents = (vus.get(cle) ?? []).filter((t) => maintenant - t < limite.fenetreMs);
      if (recents.length >= limite.nombre) {
        vus.set(cle, recents);
        return { passe: false, apres: Math.max(1, Math.ceil((recents[0]! + limite.fenetreMs - maintenant) / 1000)) };
      }
      recents.push(maintenant);
      vus.set(cle, recents);
      // Le ménage : une clé muette depuis une fenêtre part.
      if (vus.size > 10_000) for (const [k, v] of vus) if (!v.some((t) => maintenant - t < limite.fenetreMs)) vus.delete(k);
      return { passe: true };
    },
  };
}

/** L'adresse du client derrière le proxy de l'hébergeur (Fly pose `fly-client-ip`). */
export const lAdresseDuClient = (h: Headers): string =>
  h.get('fly-client-ip') ?? h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'inconnue';

export const tropDAppels = (apres: number, corps: unknown) =>
  Response.json(corps, { status: 429, headers: { 'retry-after': String(apres), 'cache-control': 'no-store' } });
