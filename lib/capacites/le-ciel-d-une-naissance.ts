// Repris de constructor-v13@5bb786e : lib/capabilities/le-ciel-d-une-naissance.ts
/**
 * ============================================================================
 * LE CIEL D'UNE NAISSANCE — l'éphéméride RÉELLE, servie à la voie neuve (07/10, « Ciel Natal »)
 * ============================================================================
 *
 * « Personne n'a vérifié que le thème astral est juste » (propriétaire). La voie neuve n'offrait aucune éphéméride
 * (`REFONTE-INVENTAIRE.md` : « l'éphéméride reste à faire ») : l'agent a écrit la sienne, 170 lignes dans le navigateur,
 * jamais exécutées contre une référence. Mesurée contre celle-ci sur 200 naissances : la Lune dans le mauvais signe
 * 177 fois (la longitude prise dans le plan de l'orbite, sans son nœud), Pluton 5 fois. Le même défaut que l'ancien
 * générateur avait déjà payé (`incident-la-lune-etait-tronquee-de-soixante-termes`).
 *
 * CE QU'IL REMPLACE (interdit 9) : un calcul astronomique écrit par le modèle. La plateforme rend la PHYSIQUE (VSOP87,
 * la Lune de Meeus au complet, l'ascendant, le milieu du ciel et les maisons de Placidus, l'heure de MUR convertie par
 * tzdata) ; l'app décide l'INTERPRÉTATION (signes, aspects, sens). Chaque nombre porte son unité et sa tolérance.
 * Une entrée mal formée est un REFUS qui dit ce qui manque, jamais une exception.
 */
import { computeEphemeris, computeHouses, instantDepuisHeureLocale } from './le-moteur-du-ciel';

export const CORPS_DU_CIEL = ['soleil', 'lune', 'mercure', 'venus', 'mars', 'jupiter', 'saturne', 'uranus', 'neptune', 'pluton'] as const;
export type CorpsDuCiel = (typeof CORPS_DU_CIEL)[number];
const NOM_DU_MOTEUR: Readonly<Record<string, CorpsDuCiel>> = {
  sun: 'soleil', moon: 'lune', mercury: 'mercure', venus: 'venus', mars: 'mars', jupiter: 'jupiter', saturn: 'saturne',
  uranus: 'uranus', neptune: 'neptune', pluto: 'pluton',
};

export interface EntreeDuCiel {
  /** AAAA-MM-JJ, la date du lieu. */
  readonly date: string;
  /** HH:MM, l'heure de MUR du lieu. */
  readonly heure: string;
  /** Le fuseau IANA du lieu (celui que rend `lieu.chercher`). */
  readonly fuseau: string;
  readonly latitude: number;
  readonly longitude: number;
}

export interface CielDUneNaissance {
  /** L'instant, en ISO UTC. */
  readonly instant: string;
  /** Le décalage du lieu à cette date, en minutes (heure d'été et histoire du fuseau comprises). */
  readonly decalageMinutes: number;
  /** `double` : l'heure existe deux fois (le premier passage est pris) ; `inexistante` : elle n'existe pas. DIT à l'écran. */
  readonly ambiguite: 'double' | 'inexistante' | null;
  /** Longitude écliptique géocentrique tropicale, en degrés [0, 360) ; vitesse en degrés par jour ; tolérance en degrés. */
  readonly astres: ReadonlyArray<{ readonly corps: CorpsDuCiel; readonly longitude: number; readonly vitesse: number;
    readonly retrograde: boolean; readonly precision: number }>;
  readonly ascendant: number;
  readonly milieuDuCiel: number;
  /** Placidus ; ÉGALES depuis l'ascendant près des pôles, et alors `motifDuRepli` le dit. Cuspides I à XII. */
  readonly maisons: { readonly systeme: 'placidus' | 'egales'; readonly cuspides: readonly number[]; readonly motifDuRepli?: string };
  readonly unite: 'degres';
}

export type LectureDeLEntree = { readonly ok: true; readonly entree: EntreeDuCiel } | { readonly ok: false; readonly raison: string };

/** Relire l'entrée — chaque manque NOMMÉ, avec la forme attendue. PUR. */
export function lireLEntreeDuCiel(brut: unknown): LectureDeLEntree {
  const b = (brut && typeof brut === 'object' ? brut : {}) as Record<string, unknown>;
  const manques: string[] = [];
  const date = typeof b.date === 'string' ? b.date.trim() : '';
  const heure = typeof b.heure === 'string' ? b.heure.trim() : '';
  const fuseau = typeof b.fuseau === 'string' ? b.fuseau.trim() : '';
  const latitude = Number(b.latitude);
  const longitude = Number(b.longitude);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) manques.push('date (AAAA-MM-JJ)');
  if (!/^\d{1,2}:\d{2}$/.test(heure)) manques.push('heure (HH:MM, l’heure du lieu)');
  if (!fuseau) manques.push('fuseau (l’identifiant IANA du lieu, rendu par lieu.chercher — une heure sans fuseau n’est pas un instant)');
  if (b.latitude === null || b.latitude === undefined || !Number.isFinite(latitude) || Math.abs(latitude) > 90) manques.push('latitude (degrés, -90 à 90)');
  if (b.longitude === null || b.longitude === undefined || !Number.isFinite(longitude) || Math.abs(longitude) > 180) manques.push('longitude (degrés, -180 à 180, est positif)');
  if (manques.length > 0) return { ok: false, raison: `Le ciel ne peut pas être calculé : il manque ${manques.join(', ')}.` };
  return { ok: true, entree: { date, heure: heure.padStart(5, '0'), fuseau, latitude, longitude } };
}

const arrondi = (x: number, n = 4): number => Math.round(x * 10 ** n) / 10 ** n;

/**
 * Le ciel d'une naissance. Une heure, un fuseau ou un lieu que le moteur refuse rend `{ ok: false, raison }` — jamais un
 * nombre approché sous le même nom.
 */
export async function leCielDUneNaissance(e: EntreeDuCiel): Promise<{ readonly ok: true; readonly ciel: CielDUneNaissance } | { readonly ok: false; readonly raison: string }> {
  let local;
  try { local = instantDepuisHeureLocale(e.date, e.heure, e.fuseau); } catch (x) { return { ok: false, raison: String((x as Error).message) }; }
  const instant = new Date(local.instant);
  let maisons;
  try { maisons = computeHouses(instant, e.latitude, e.longitude); } catch (x) { return { ok: false, raison: String((x as Error).message) }; }
  const eph = await computeEphemeris(instant);
  const astres = eph.bodies.flatMap((b) => {
    const corps = NOM_DU_MOTEUR[b.body];
    return corps ? [{ corps, longitude: arrondi(b.eclipticLongitude), vitesse: arrondi(b.dailyMotion), retrograde: b.retrograde, precision: b.precisionDeg }] : [];
  });
  return {
    ok: true,
    ciel: {
      instant: local.instant, decalageMinutes: local.offsetMinutes, ambiguite: local.ambiguite, astres,
      ascendant: arrondi(maisons.ascendant), milieuDuCiel: arrondi(maisons.milieuDuCiel),
      maisons: { systeme: maisons.systeme, cuspides: maisons.cuspides.map((c) => arrondi(c)),
        ...(maisons.motifDuRepli ? { motifDuRepli: maisons.motifDuRepli } : {}) },
      unite: 'degres',
    },
  };
}
