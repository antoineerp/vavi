/**
 * LES MESSAGES DES APPS — un formulaire de visiteur (contact, demande, réservation) envoyé par
 * `squelette/gabarit/src/lib/formulaire.ts`, reçu ici : relu (forme bornée), jugé (`le-jugement.ts`), plafonné, GARDÉ
 * (même en spam), puis transmis par courriel au propriétaire du projet s'il n'est pas du spam et si la plateforme a de
 * quoi envoyer. Le visiteur reçoit la même réponse qu'il soit jugé humain ou non : un robot n'apprend rien.
 *
 * Remplace, pour vavi, `app/api/forms/submit` de constructor-v13 (540 lignes, une boîte réglée par formulaire).
 */
import { premierSpam, sansLesChampsDuJugement, verdictDeLaVisite, verdictDesChamps, verdictDuContenu, PLAFOND_PAR_ADRESSE_PAR_HEURE,
  PLAFOND_PAR_PROJET_PAR_HEURE, type LectureDeLaPreuve, type Verdict } from './le-jugement';
import { laReponseA } from './la-boite-de-reception';

export type Issue<T> = { readonly lu: true; readonly valeur: T } | { readonly lu: false; readonly pourquoi: string };
export type EtatDuCourriel = 'a_envoyer' | 'envoye' | 'non_configure' | 'echec' | 'non_envoye';

export interface Message {
  readonly id: string; readonly formulaire: string; readonly donnees: Readonly<Record<string, unknown>>; readonly page: string | null;
  readonly statut: 'recu' | 'spam'; readonly motif: string | null; readonly courriel: EtatDuCourriel; readonly creeLe: string;
}

/** La boîte des messages, dans la base de la plateforme. Injectée : les essais jouent la réception sans réseau. */
export interface BoiteDesMessages {
  compter(projet: string, depuis: string, o: { readonly adresse?: string; readonly sansSpam?: boolean }): Promise<Issue<number>>;
  garder(projet: string, m: { readonly formulaire: string; readonly donnees: Record<string, unknown>; readonly page: string | null; readonly statut: 'recu' | 'spam';
    readonly motif: string | null; readonly adresse: string | null; readonly courriel: EtatDuCourriel }): Promise<Issue<string>>;
  noterLeCourriel(id: string, etat: EtatDuCourriel): Promise<Issue<true>>;
  lister(projet: string, combien: number): Promise<Issue<readonly Message[]>>;
}

export type Courrier = (m: { readonly a: string; readonly sujet: string; readonly texte: string; readonly repondreA: string | null }) => Promise<boolean>;

export interface DependancesDeLaReception {
  readonly boite: BoiteDesMessages;
  /** Le propriétaire du projet servi ; `null` : ce projet n'existe pas. */
  readonly proprietaireDe: (projet: string) => Promise<Issue<{ readonly courriel: string | null; readonly nom: string } | null>>;
  /** `null` : la plateforme n'a pas de quoi envoyer un courriel (dit dans la console, le message reste gardé). */
  readonly courrier: Courrier | null;
  readonly maintenant: number;
}

export interface Envoi {
  readonly projet: string; readonly formulaire: unknown; readonly data: unknown; readonly page: unknown;
  /** L'empreinte de l'adresse d'envoi, jamais l'adresse ; `null` : inconnue. */
  readonly adresse: string | null;
  readonly visite: LectureDeLaPreuve | null;
}

export type Reception =
  | { readonly statut: 200; readonly garde: string; readonly verdict: Verdict; readonly courriel: EtatDuCourriel }
  | { readonly statut: 400 | 404 | 429 | 503; readonly pourquoi: string };

const MAX_CHAMPS = 50;
const MAX_OCTETS = 20_000;
const FORMULAIRE = /^[A-Za-z0-9_-]{1,60}$/;

/** Le message relu : un objet plat de valeurs simples, borné ; sinon pourquoi. PURE. */
export function lireLEnvoi(formulaire: unknown, data: unknown, page: unknown): { readonly formulaire: string; readonly donnees: Record<string, unknown>; readonly page: string | null } | string {
  if (typeof formulaire !== 'string' || !FORMULAIRE.test(formulaire)) return 'formKey : lettres, chiffres, - et _ (60 au plus)';
  if (!data || typeof data !== 'object' || Array.isArray(data)) return 'data : un objet { champ: valeur }';
  const entrees = Object.entries(data as Record<string, unknown>);
  if (entrees.length === 0 || entrees.length > MAX_CHAMPS) return `data : de 1 à ${MAX_CHAMPS} champs`;
  for (const [k, v] of entrees) {
    if (k.length > 80) return `champ « ${k.slice(0, 20)}… » : un nom de 80 caractères au plus`;
    if (v !== null && !['string', 'number', 'boolean'].includes(typeof v) && !(Array.isArray(v) && v.every((x) => typeof x === 'string'))) return `champ « ${k} » : une valeur simple`;
  }
  if (Buffer.byteLength(JSON.stringify(data)) > MAX_OCTETS) return `data : ${MAX_OCTETS} octets au plus`;
  return { formulaire, donnees: data as Record<string, unknown>, page: typeof page === 'string' && page.startsWith('/') ? page.slice(0, 300) : null };
}

/** Le courriel du message, lisible : chaque champ sur sa ligne. PURE. */
export function leCourrielDuMessage(nom: string, formulaire: string, donnees: Readonly<Record<string, unknown>>, page: string | null): { sujet: string; texte: string; repondreA: string | null } {
  const lignes = Object.entries(donnees).map(([k, v]) => `${k} : ${Array.isArray(v) ? v.join(', ') : String(v ?? '')}`);
  return {
    sujet: `${nom} — nouveau message (${formulaire})`,
    texte: [`Un visiteur a envoyé le formulaire « ${formulaire} »${page ? ` depuis la page ${page}` : ''}.`, '', ...lignes, '', 'Envoyé par vavi.'].join('\n'),
    repondreA: laReponseA(donnees),
  };
}

export async function recevoirUnEnvoi(d: DependancesDeLaReception, e: Envoi): Promise<Reception> {
  const lu = lireLEnvoi(e.formulaire, e.data, e.page);
  if (typeof lu === 'string') return { statut: 400, pourquoi: lu };
  const p = await d.proprietaireDe(e.projet);
  if (!p.lu) return { statut: 503, pourquoi: 'la base de vavi n’a pas répondu' };
  if (!p.valeur) return { statut: 404, pourquoi: 'projet inconnu' };
  const depuis = new Date(d.maintenant - 3600_000).toISOString();
  if (e.adresse) {
    const n = await d.boite.compter(e.projet, depuis, { adresse: e.adresse });
    if (n.lu && n.valeur >= PLAFOND_PAR_ADRESSE_PAR_HEURE) return { statut: 429, pourquoi: 'trop d’envois depuis cette adresse ; réessayez dans une heure' };
  }
  const n = await d.boite.compter(e.projet, depuis, { sansSpam: true });
  if (n.lu && n.valeur >= PLAFOND_PAR_PROJET_PAR_HEURE) return { statut: 429, pourquoi: 'trop d’envois ; réessayez dans une heure' };
  const verdict = premierSpam(verdictDesChamps(lu.donnees, d.maintenant), verdictDuContenu(lu.donnees), verdictDeLaVisite(lu.donnees, e.visite));
  const donnees = sansLesChampsDuJugement(lu.donnees);
  const g = await garderEtTransmettre(d, p.valeur, { projet: e.projet, formulaire: lu.formulaire, donnees, page: lu.page, adresse: e.adresse,
    spam: verdict.spam ? `${verdict.motif} : ${verdict.detail}` : null });
  if (!g.lu) return { statut: 503, pourquoi: 'la base de vavi n’a pas répondu' };
  return { statut: 200, garde: g.valeur.garde, verdict, courriel: g.valeur.courriel };
}

/** Gardé dans la boîte (même en spam), puis transmis par courriel au propriétaire quand ce n'est pas du spam. */
async function garderEtTransmettre(d: DependancesDeLaReception, proprietaire: { readonly nom: string; readonly courriel: string | null },
  m: { readonly projet: string; readonly formulaire: string; readonly donnees: Record<string, unknown>; readonly page: string | null; readonly adresse: string | null; readonly spam: string | null }):
  Promise<Issue<{ readonly garde: string; readonly courriel: EtatDuCourriel }>> {
  const destinataire = proprietaire.courriel;
  const courriel: EtatDuCourriel = m.spam ? 'non_envoye' : !d.courrier || !destinataire ? 'non_configure' : 'a_envoyer';
  const g = await d.boite.garder(m.projet, { formulaire: m.formulaire, donnees: m.donnees, page: m.page, statut: m.spam ? 'spam' : 'recu',
    motif: m.spam, adresse: m.adresse, courriel });
  if (!g.lu) return g;
  if (courriel !== 'a_envoyer') return { lu: true, valeur: { garde: g.valeur, courriel } };
  const c = leCourrielDuMessage(proprietaire.nom, m.formulaire, m.donnees, m.page);
  const parti = await d.courrier!({ a: destinataire!, ...c }).catch(() => false);
  await d.boite.noterLeCourriel(g.valeur, parti ? 'envoye' : 'echec');
  return { lu: true, valeur: { garde: g.valeur, courriel: parti ? 'envoye' : 'echec' } };
}

/**
 * Une ligne qu'un visiteur a envoyée SANS COMPTE dans une table (`/api/depot`), déjà jugée et gardée dans l'app : elle
 * arrive aussi dans la boîte de la console et par courriel, comme un formulaire. Ce qu'il remplace : rien ; le message
 * restait dans « Données », ni dans « Messages » ni par courriel, et le propriétaire ne savait pas qu'on lui avait écrit
 * (essai de la console du 26/11).
 */
export async function transmettreUneLigne(d: DependancesDeLaReception, e: { readonly projet: string; readonly table: string; readonly ligne: Readonly<Record<string, unknown>>;
  readonly page: string | null; readonly adresse: string | null }): Promise<Issue<{ readonly garde: string; readonly courriel: EtatDuCourriel }>> {
  const lu = lireLEnvoi(e.table, e.ligne, e.page);
  if (typeof lu === 'string') return { lu: false, pourquoi: lu };
  const p = await d.proprietaireDe(e.projet);
  if (!p.lu) return p;
  if (!p.valeur) return { lu: false, pourquoi: 'projet inconnu' };
  return garderEtTransmettre(d, p.valeur, { projet: e.projet, formulaire: lu.formulaire, donnees: lu.donnees, page: lu.page, adresse: e.adresse, spam: null });
}

