// Repris de constructor-v13@5bb786e : lib/capabilities/debit-de-service-public.ts
/**
 * ============================================================================
 * LE DÉBIT D'UN SERVICE PUBLIC SE BORNE CÔTÉ SERVEUR — jamais dans le client
 * ============================================================================
 * Les capacités du substrat appellent des services publics gratuits (Nominatim
 * pour `geo.locate`, et ce qui suivra) dont la politique d'usage se compte en
 * requêtes par seconde. Deux faits décident de l'endroit où la borne se pose :
 *
 *  1. l'IP qui appelle est celle de la PLATEFORME, partagée par toutes les
 *     apps générées : un champ d'autocomplétion sans anti-rebond dans UNE app
 *     fait bannir les autres ;
 *  2. le client est réécrit à chaque génération — une garde qui y vit est une
 *     garde qu'on redemande au modèle à chaque fois, donc une garde qu'on perd.
 *
 * Ce module ne connaît aucun service en particulier : il rend une FILE (un
 * passage par intervalle) et un CACHE (une réponse réutilisée tant qu'elle
 * vaut). Le service, lui, reste dans sa route.
 *
 * CE QU'IL NE FAIT PAS, ET QUI SE DIT : la borne est par PROCESSUS. Plusieurs
 * instances multiplient le débit d'autant. C'est le cache qui porte l'essentiel
 * de la charge, et un dépassement reste possible sous montée en charge — le
 * jour où ça compte, la file se déporte sur Redis (déjà présent).
 * ============================================================================
 */

export interface OptionsDeFile {
  /** Intervalle minimal entre deux passages, en millisecondes. */
  intervalleMs: number;
  /** Au-delà de cette attente, on refuse plutôt que d'empiler. */
  attenteMaxMs: number;
}

export interface FileDeService {
  /** Fait passer `travail` en respectant l'intervalle. Refuse si la file est trop longue. */
  passer<T>(travail: () => Promise<T>): Promise<T>;
  /** Attente actuelle avant le prochain passage, en ms — pour la trace. */
  attenteEstimeeMs(): number;
}

/** Levée quand la file est plus longue que ce que l'appelant peut attendre. */
export class ServiceSature extends Error {
  constructor(public readonly nom: string, public readonly attenteMs: number) {
    super(
      `Service "${nom}" saturé : ${Math.round(attenteMs)} ms d'attente avant le prochain passage. `
      + 'Réessaie dans un instant — la borne protège le service public appelé.',
    );
    this.name = 'ServiceSature';
  }
}

const files = new Map<string, FileDeService>();

/**
 * La file d'un service, créée une fois par processus. Un seul passage par
 * `intervalleMs`, dans l'ordre d'arrivée.
 */
export function fileDuService(nom: string, opts: OptionsDeFile): FileDeService {
  const deja = files.get(nom);
  if (deja) return deja;

  let prochainCreneau = 0;
  const file: FileDeService = {
    attenteEstimeeMs: () => Math.max(0, prochainCreneau - Date.now()),
    async passer<T>(travail: () => Promise<T>): Promise<T> {
      const maintenant = Date.now();
      const creneau = Math.max(maintenant, prochainCreneau);
      const attente = creneau - maintenant;
      if (attente > opts.attenteMaxMs) throw new ServiceSature(nom, attente);
      // Le créneau est RÉSERVÉ avant l'attente : deux appels simultanés
      // prennent deux créneaux distincts, jamais le même.
      prochainCreneau = creneau + opts.intervalleMs;
      if (attente > 0) await new Promise((r) => setTimeout(r, attente));
      return travail();
    },
  };
  files.set(nom, file);
  return file;
}

interface Entree<V> { valeur: V; expire: number }

export interface CacheDeService<V> {
  lire(cle: string): V | undefined;
  ecrire(cle: string, valeur: V): void;
  taille(): number;
}

/**
 * Cache à durée de vie et à taille bornées. Rien de plus : la clé est fournie
 * par l'appelant, qui seul sait ce qui distingue deux demandes.
 */
export function cacheDuService<V>(nom: string, dureeMs: number, maxEntrees: number): CacheDeService<V> {
  const deja = caches.get(nom);
  if (deja) return deja as CacheDeService<V>;

  const entrees = new Map<string, Entree<V>>();
  const cache: CacheDeService<V> = {
    lire(cle) {
      const e = entrees.get(cle);
      if (!e) return undefined;
      if (e.expire <= Date.now()) { entrees.delete(cle); return undefined; }
      // Relecture = fraîcheur d'usage : on la remet en queue (LRU simple).
      entrees.delete(cle);
      entrees.set(cle, e);
      return e.valeur;
    },
    ecrire(cle, valeur) {
      if (entrees.has(cle)) entrees.delete(cle);
      entrees.set(cle, { valeur, expire: Date.now() + dureeMs });
      while (entrees.size > maxEntrees) {
        const plusVieille = entrees.keys().next();
        if (plusVieille.done) break;
        entrees.delete(plusVieille.value);
      }
    },
    taille: () => entrees.size,
  };
  caches.set(nom, cache);
  return cache;
}

const caches = new Map<string, CacheDeService<unknown>>();

/** Remise à zéro — réservée aux tests, qui ont besoin d'un processus neuf. */
export function reinitialiserLesBornes(): void {
  files.clear();
  caches.clear();
}
