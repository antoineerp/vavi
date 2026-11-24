// Repris de constructor-v13@5bb786e : lib/capabilities/les-entreprises.ts
/**
 * ============================================================================
 * LES ENTREPRISES — chercher des prospects dans le registre public des entreprises françaises
 * ============================================================================
 *
 * Ce qu'il remplace (interdit 9) : rien ; une app qui devait « trouver des clients » n'avait que la page publique qu'un
 * agent lit quand il en tient l'adresse, ou une base de contacts inventée. La plateforme ne tient AUCUNE base de
 * contacts à elle : elle interroge l'API Recherche d'entreprises de l'État (données Sirene et RNE, ouvertes, sans clé),
 * et rend des entreprises avec leur source. Les coordonnées d'une personne (courriel, téléphone) ne viennent pas d'ici :
 * le propriétaire les obtient par un fournisseur qu'il branche lui-même (fonction `connecteur`), à sa clé.
 *
 * Le service public tolère quelques requêtes par seconde et l'adresse qui appelle est celle de la plateforme : une file
 * et un cache, ici, quel que soit l'appelant (`debit-de-service-public.ts`).
 */
import { cacheDuService, fileDuService } from './debit-de-service-public';

export const SOURCE_DES_ENTREPRISES = 'Registre public des entreprises (recherche-entreprises.api.gouv.fr)';
const URL_DE_LA_RECHERCHE = 'https://recherche-entreprises.api.gouv.fr/search';
const FICHE = (siren: string): string => `https://annuaire-entreprises.data.gouv.fr/entreprise/${siren}`;
export const ENTREPRISES_PAR_PAGE = 20;

/** Les tranches d'effectif salarié que le registre rend et accepte (codes Sirene de l'INSEE), et les bornes qu'elles désignent. */
export const TRANCHES_D_EFFECTIF: ReadonlyArray<{ readonly code: string; readonly min: number; readonly max: number | null }> = [
  { code: '00', min: 0, max: 0 }, { code: '01', min: 1, max: 2 }, { code: '02', min: 3, max: 5 }, { code: '03', min: 6, max: 9 },
  { code: '11', min: 10, max: 19 }, { code: '12', min: 20, max: 49 }, { code: '21', min: 50, max: 99 }, { code: '22', min: 100, max: 199 },
  { code: '31', min: 200, max: 249 }, { code: '32', min: 250, max: 499 }, { code: '41', min: 500, max: 999 }, { code: '42', min: 1000, max: 1999 },
  { code: '51', min: 2000, max: 4999 }, { code: '52', min: 5000, max: 9999 }, { code: '53', min: 10000, max: null },
];

export interface Criteres {
  /** Des mots du nom ou de l'activité. */
  readonly texte?: string;
  /** Le code d'activité (NAF), « 56.10A » ou « 5610A ». */
  readonly activite?: string;
  readonly codePostal?: string;
  readonly departement?: string;
  /** Le nombre de salariés, bornes comprises. */
  readonly effectif?: { readonly min?: number; readonly max?: number };
  readonly page?: number;
}

export interface Entreprise {
  readonly siren: string;
  readonly nom: string;
  readonly activite: string | null;
  readonly adresse: string | null;
  readonly codePostal: string | null;
  readonly ville: string | null;
  readonly effectif: string | null;
  readonly creeeLe: string | null;
  readonly dirigeants: readonly { readonly nom: string; readonly qualite: string | null }[];
  readonly fiche: string;
}

export interface Recherche { readonly entreprises: readonly Entreprise[]; readonly total: number; readonly page: number; readonly pages: number; readonly source: string }

type Issue<T> = { readonly lu: true; readonly valeur: T; readonly repare: readonly string[] } | { readonly lu: false; readonly pourquoi: string };

const texte = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

/** Les tranches qui recoupent les bornes données. PUR. */
export function lesTranches(e: Criteres['effectif']): string[] {
  if (!e) return [];
  const min = Number.isFinite(e.min) ? Number(e.min) : 0;
  const max = Number.isFinite(e.max) ? Number(e.max) : Infinity;
  return TRANCHES_D_EFFECTIF.filter((t) => (t.max === null || t.max >= min) && t.min <= max).map((t) => t.code);
}

/**
 * L'adresse de la recherche, ses critères relus (PUR). Une forme courante mal écrite est réparée et dite (un code
 * d'activité sans point, un département sur un chiffre) ; un critère illisible est refusé, jamais ignoré en silence.
 */
export function laRecherche(c: Criteres): Issue<string> {
  const repare: string[] = [];
  const p = new URLSearchParams({ per_page: String(ENTREPRISES_PAR_PAGE), etat_administratif: 'A' });
  const mots = texte(c.texte);
  if (mots) p.set('q', mots.slice(0, 200));
  const activite = texte(c.activite)?.toUpperCase().replace(/\s/g, '') ?? null;
  if (activite) {
    const m = /^(\d{2})\.?(\d{2})([A-Z])$/.exec(activite);
    if (!m) return { lu: false, pourquoi: `« ${c.activite} » n’est pas un code d’activité (NAF) : deux chiffres, un point, deux chiffres, une lettre` };
    const forme = `${m[1]}.${m[2]}${m[3]}`;
    if (forme !== activite) repare.push(`code d’activité « ${c.activite} » lu « ${forme} »`);
    p.set('activite_principale', forme);
  }
  const cp = texte(c.codePostal);
  if (cp) {
    if (!/^\d{5}$/.test(cp)) return { lu: false, pourquoi: `« ${cp} » n’est pas un code postal : cinq chiffres` };
    p.set('code_postal', cp);
  }
  const dep = texte(c.departement)?.toUpperCase() ?? null;
  if (dep) {
    const forme = /^\d$/.test(dep) ? `0${dep}` : dep;
    if (!/^(\d{2}|2A|2B|\d{3})$/.test(forme)) return { lu: false, pourquoi: `« ${dep} » n’est pas un département` };
    if (forme !== dep) repare.push(`département « ${dep} » lu « ${forme} »`);
    p.set('departement', forme);
  }
  const tranches = lesTranches(c.effectif);
  if (c.effectif && tranches.length === 0) return { lu: false, pourquoi: 'aucune tranche d’effectif entre ces bornes' };
  if (tranches.length) p.set('tranche_effectif_salarie', tranches.join(','));
  if (!mots && !activite && !cp && !dep) return { lu: false, pourquoi: 'une recherche nomme au moins des mots, une activité, un code postal ou un département' };
  const page = Math.min(Math.max(Math.trunc(Number(c.page) || 1), 1), 50);
  p.set('page', String(page));
  return { lu: true, valeur: `${URL_DE_LA_RECHERCHE}?${p.toString()}`, repare };
}

/** Ce que le registre rend, à la forme de l'app : chaque entreprise avec sa fiche publique. PUR. */
export function lesEntreprises(brut: unknown): Recherche {
  const r = (brut ?? {}) as { results?: unknown[]; total_results?: unknown; page?: unknown; total_pages?: unknown };
  const tranche = (code: unknown): string | null => {
    const t = TRANCHES_D_EFFECTIF.find((x) => x.code === code);
    return t ? (t.max === null ? `${t.min} et plus` : t.min === t.max ? `${t.min}` : `${t.min} à ${t.max}`) : null;
  };
  const entreprises = (Array.isArray(r.results) ? r.results : []).flatMap((x): Entreprise[] => {
    const e = (x ?? {}) as Record<string, unknown>;
    const siege = (e.siege ?? {}) as Record<string, unknown>;
    const siren = texte(e.siren);
    const nom = texte(e.nom_complet) ?? texte(e.nom_raison_sociale);
    if (!siren || !nom) return [];
    const dirigeants = (Array.isArray(e.dirigeants) ? e.dirigeants : []).flatMap((d) => {
      const x = (d ?? {}) as Record<string, unknown>;
      const n = texte(x.denomination) ?? [texte(x.prenoms), texte(x.nom)].filter(Boolean).join(' ');
      return n ? [{ nom: n, qualite: texte(x.qualite) }] : [];
    });
    return [{ siren, nom, activite: texte(e.activite_principale) ?? texte(siege.activite_principale), adresse: texte(siege.adresse),
      codePostal: texte(siege.code_postal), ville: texte(siege.libelle_commune), effectif: tranche(e.tranche_effectif_salarie ?? siege.tranche_effectif_salarie),
      creeeLe: texte(e.date_creation), dirigeants, fiche: FICHE(siren) }];
  });
  const nombre = (v: unknown, d: number): number => (Number.isFinite(Number(v)) ? Number(v) : d);
  return { entreprises, total: nombre(r.total_results, entreprises.length), page: nombre(r.page, 1), pages: nombre(r.total_pages, 1), source: SOURCE_DES_ENTREPRISES };
}

/** Cherche dans le registre, par la file et le cache de la plateforme. `lu: false` dit pourquoi, jamais une liste vide. */
export async function chercherDesEntreprises(c: Criteres, appeler: typeof fetch = fetch): Promise<Issue<Recherche>> {
  const url = laRecherche(c);
  if (!url.lu) return url;
  const cache = cacheDuService<Recherche>('recherche-entreprises', 3_600_000, 500);
  const deja = cache.lire(url.valeur);
  if (deja) return { lu: true, valeur: deja, repare: url.repare };
  try {
    const res = await fileDuService('recherche-entreprises', { intervalleMs: 200, attenteMaxMs: 8_000 })
      .passer(() => appeler(url.valeur, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10_000) }));
    if (!res.ok) return { lu: false, pourquoi: `le registre des entreprises ne répond pas (${res.status})` };
    const valeur = lesEntreprises(await res.json());
    cache.ecrire(url.valeur, valeur);
    return { lu: true, valeur, repare: url.repare };
  } catch (e) {
    return { lu: false, pourquoi: `le registre des entreprises ne répond pas (${String((e as Error)?.message ?? e).slice(0, 120)})` };
  }
}
