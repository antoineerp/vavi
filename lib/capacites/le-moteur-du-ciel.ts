// Repris de constructor-v13@5bb786e : lib/capabilities/astro-engine.ts
/**
 * Moteur astro de la capacité `server.compute` — extrait du route handler pour
 * être TESTABLE (les route files Next n'admettent pas d'exports arbitraires).
 *
 * ── CE QU'IL REND, ET SOUS QUELLE LOI ─────────────────────────────────────
 * Il rend la PHYSIQUE : longitudes écliptiques géocentriques (Soleil, Lune et
 * les huit corps suivants), positions horizontales, horaires, temps sidéral,
 * ascendant, milieu du ciel et cuspides. Il ne rend PAS l'INTERPRÉTATION : ni
 * signe, ni aspect, ni sens — le découpage en signes dépend d'une tradition
 * (tropical vs sidéral) que le substrat n'a pas à trancher (règle 3 bis).
 *
 * TROIS LOIS, chacune payée par un incident :
 *  1. AUCUNE APPROXIMATION MAISON quand la dépendance rend l'exacte. La série
 *     lunaire écrite ici tenait 3 termes sur ~60 : 2,15° d'écart mesuré, signe
 *     lunaire faux 3 fois sur 100 (`incident-la-lune-etait-tronquee-de-soixante-termes`).
 *     Ce qui reste approché DÉCLARE sa tolérance (`precisionDeg`).
 *  2. UNE RÉPONSE PORTE SON UNITÉ. La doc livrée au modèle annonçait des
 *     RADIANS depuis suncalc 1.x ; la 2.0 rend des DEGRÉS et compte l'azimut
 *     depuis le NORD — une app obéissante affichait 839° pour 14,6°
 *     (`incident-le-contrat-d-unites-avait-derive`). Le champ `unit` voyage
 *     avec le nombre : aucune prose ne peut plus dériver sans être démentie.
 *  3. UNE HEURE DE MUR N'EST PAS UN INSTANT. `new Date('1990-04-12T08:30:00')`
 *     se lit dans le fuseau du SERVEUR : 2 h d'erreur à Lyon, 3,6 % de signes
 *     lunaires faux, 21,6 % hors d'Europe. Le moteur REFUSE une date sans
 *     fuseau et nomme l'op qui convertit
 *     (`incident-l-heure-locale-etait-lue-comme-de-l-utc`).
 */
import * as SunCalc from 'suncalc';
import { julian, solar, moonposition, nutation, sidereal, base } from 'astronomia';

const R = Math.PI / 180;
const DEG = 180 / Math.PI;
const norm360 = (x: number): number => ((x % 360) + 360) % 360;
const iso = (d: Date | null) => (d && !Number.isNaN(d.getTime()) ? d.toISOString() : null);

/* ==========================================================================
 * L'INSTANT — ce que le moteur accepte pour une date
 * ========================================================================== */

/** Une date SEULE : la norme la lit en UTC, il n'y a rien à deviner. */
const DATE_SEULE = /^\d{4}-\d{2}-\d{2}$/;
/** Un instant EXPLICITE : il porte Z ou un décalage. */
const AVEC_FUSEAU = /(?:Z|[+-]\d{2}:?\d{2})$/i;

/**
 * Rend l'instant, ou REFUSE en nommant le geste qui manque. Une heure de mur
 * sans fuseau n'est pas une donnée : deux lecteurs en font deux instants.
 */
export function parseInstant(dateStr?: string): Date {
  if (!dateStr) return new Date();
  const s = String(dateStr).trim();
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) throw new Error(`date invalide: ${dateStr}`);
  if (DATE_SEULE.test(s) || AVEC_FUSEAU.test(s)) return d;
  throw new Error(
    `heure sans fuseau: "${s}". Une heure de mur n'est pas un instant — lue ici, elle prendrait `
    + `le fuseau du serveur (UTC), ce qui déplace la Lune d'un signe une fois sur trente. `
    + `Convertis-la d'abord : op "instant" { date, time, timezone } — le fuseau est rendu par `
    + `geo.locate avec les coordonnées du lieu. Ou envoie un instant explicite ("...Z" ou "...+02:00").`,
  );
}

export interface InstantLocal {
  /** L'instant, en ISO UTC. */
  instant: string;
  /** Décalage du lieu à CETTE date, en minutes (heure d'été comprise). */
  offsetMinutes: number;
  timezone: string;
  /**
   * `double` : l'heure de mur existe deux fois (recul d'automne) — le premier
   * passage est rendu. `inexistante` : elle n'existe pas (avance de printemps)
   * — l'instant rendu est celui d'après le saut. DIVULGUÉ, jamais bloquant.
   */
  ambiguite: 'double' | 'inexistante' | null;
}

/** L'heure de mur que ce fuseau voit à cet instant, ramenée à un repère UTC. */
function murVuDe(ts: number, timezone: string): number {
  const p = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(new Date(ts)).reduce<Record<string, string>>(
    (acc, x) => { acc[x.type] = x.value; return acc; }, {},
  );
  return Date.UTC(
    Number(p.year), Number(p.month) - 1, Number(p.day),
    Number(p.hour) === 24 ? 0 : Number(p.hour), Number(p.minute), Number(p.second),
  );
}

/**
 * Heure de MUR + fuseau IANA → instant. Les règles sont celles de tzdata,
 * dans toute leur HISTOIRE : heure d'été, occupation (Paris en UTC+2 en 1944),
 * heure moyenne locale d'avant 1911 (Paris à +0h09m21s). Aucune table ici :
 * une table de fuseaux écrite à la main serait fausse le jour de sa dernière
 * mise à jour.
 */
export function instantDepuisHeureLocale(
  date: string,
  time: string,
  timezone: string,
): InstantLocal {
  const md = DATE_SEULE.exec(String(date || '').trim());
  if (!md) throw new Error(`date invalide: "${date}" — attendu AAAA-MM-JJ`);
  const mt = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(String(time || '').trim());
  if (!mt) throw new Error(`heure invalide: "${time}" — attendu HH:MM`);
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
  } catch {
    throw new Error(
      `fuseau inconnu: "${timezone}" — attendu un identifiant IANA ("Europe/Paris", "America/New_York"). `
      + 'geo.locate rend celui du lieu dans `timezone`.',
    );
  }

  const [y, mo, da] = String(date).split('-').map(Number) as [number, number, number];
  const cible = Date.UTC(y, mo - 1, da, Number(mt[1]), Number(mt[2]), Number(mt[3] || 0));

  // Les deux décalages qui encadrent la date décident : quand ils diffèrent,
  // l'heure de mur est soit double, soit inexistante — et on le DIT.
  const offAvant = (murVuDe(cible - 86400000, timezone) - (cible - 86400000)) / 60000;
  const offApres = (murVuDe(cible + 86400000, timezone) - (cible + 86400000)) / 60000;
  const t1 = cible - offAvant * 60000;
  const t2 = cible - offApres * 60000;
  const valide1 = murVuDe(t1, timezone) === cible;
  const valide2 = murVuDe(t2, timezone) === cible;

  let ts: number;
  let ambiguite: InstantLocal['ambiguite'] = null;
  if (t1 === t2) ts = t1;
  else if (valide1 && valide2) { ts = Math.min(t1, t2); ambiguite = 'double'; }
  else if (valide1) ts = t1;
  else if (valide2) ts = t2;
  else { ts = Math.min(t1, t2); ambiguite = 'inexistante'; }

  return {
    instant: new Date(ts).toISOString(),
    offsetMinutes: (cible - ts) / 60000,
    timezone,
    ambiguite,
  };
}

/* ==========================================================================
 * LES LONGITUDES ÉCLIPTIQUES
 * ========================================================================== */

/** Tolérances DÉCLARÉES, en degrés — ce qui n'est pas exact se dit. */
export const PRECISION_DEG = { soleil: 0.01, lune: 0.01, planete: 0.01, pluton: 0.05 } as const;

/** Longitude écliptique apparente du Soleil (degrés [0,360)). */
export function sunEclipticLongitude(date: Date): number {
  const jde = julian.DateToJDE(date);
  return norm360(solar.apparentLongitude(base.J2000Century(jde)) * DEG);
}

/**
 * Longitude écliptique apparente de la Lune (degrés [0,360)).
 * Meeus ch. 47 au complet, servi par `astronomia` : la série tronquée écrite
 * ici ratait l'évection (1,27°) et la variation (0,66°).
 */
export function moonEclipticLongitude(date: Date): number {
  const jde = julian.DateToJDE(date);
  const [deltaPsi] = nutation.nutation(jde);
  return norm360((moonposition.position(jde).lon + deltaPsi) * DEG);
}

/* ==========================================================================
 * L'ASCENDANT, LE MILIEU DU CIEL, LES MAISONS
 * ========================================================================== */

/** Temps sidéral apparent LOCAL, en degrés — l'entrée de tout ce qui suit. */
export function tempsSideralLocalDeg(date: Date, lonEst: number): number {
  return norm360(sidereal.apparent(julian.DateToJD(date)) * 15 / 3600 + lonEst);
}

/** Obliquité VRAIE de l'écliptique à cette date, en degrés. */
export function obliquiteVraieDeg(date: Date): number {
  const jde = julian.DateToJDE(date);
  const [, deltaEps] = nutation.nutation(jde);
  return (nutation.meanObliquity(jde) + deltaEps) * DEG;
}

/** Le point de l'écliptique dont l'ascension droite est α (latitude nulle). */
function longitudeDepuisAscensionDroite(alphaDeg: number, epsDeg: number): number {
  const a = alphaDeg * R;
  return norm360(Math.atan2(Math.sin(a), Math.cos(a) * Math.cos(epsDeg * R)) * DEG);
}

export interface Maisons {
  systeme: 'placidus' | 'egales';
  /** Longitude écliptique du point qui se lève, degrés [0,360). */
  ascendant: number;
  /** Longitude écliptique du point qui culmine, degrés [0,360). */
  milieuDuCiel: number;
  /** Les douze cuspides, de la maison I à la XII. */
  cuspides: number[];
  tempsSideralLocalDeg: number;
  obliquiteDeg: number;
  unit: 'degrees';
  /** Renseigné quand Placidus n'est pas défini ici — jamais un silence. */
  motifDuRepli?: string;
}

/**
 * Cuspide intermédiaire de Placidus par point fixe.
 * Un corps met son demi-arc DIURNE (90° + AD) à aller du méridien à l'horizon
 * est ; les maisons XI et XII sont au tiers et aux deux tiers de ce trajet,
 * les maisons II et III au tiers et aux deux tiers du demi-arc NOCTURNE.
 * `null` = le point est circumpolaire : Placidus n'y est pas défini, et on ne
 * fabrique pas un nombre pour remplir la case.
 */
function cuspidePlacidus(
  ramc: number, eps: number, phiDeg: number, part: number, nocturne: boolean,
): number | null {
  const tanPhi = Math.tan(phiDeg * R);
  const sinEps = Math.sin(eps * R);
  let alpha = nocturne ? ramc + 180 - part * 90 : ramc + part * 90;
  for (let i = 0; i < 50; i++) {
    const lam = longitudeDepuisAscensionDroite(alpha, eps);
    const dec = Math.asin(sinEps * Math.sin(lam * R));
    const x = Math.tan(dec) * tanPhi;
    if (!Number.isFinite(x) || Math.abs(x) >= 1) return null;
    const ad = Math.asin(x) * DEG;
    const suivant = nocturne
      ? ramc + 180 - part * (90 - ad)
      : ramc + part * (90 + ad);
    const pas = Math.abs(((suivant - alpha + 540) % 360) - 180);
    alpha = suivant;
    if (pas < 1e-10) return longitudeDepuisAscensionDroite(alpha, eps);
  }
  return null;
}

/**
 * Ascendant, milieu du ciel et cuspides pour un instant et un lieu.
 * C'est la seule chose qui fasse du LIEU de naissance une entrée : les
 * longitudes planétaires sont géocentriques, elles ignorent `lat`/`lon`.
 */
export function computeHouses(date: Date, lat: number, lon: number): Maisons {
  if (Number.isNaN(date.getTime())) throw new Error('date invalide');
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new Error('lat/lon requis (nombres)');
  if (Math.abs(lat) > 89.9) throw new Error('latitude trop proche du pôle : aucun horizon exploitable');

  const ramc = tempsSideralLocalDeg(date, lon);
  const eps = obliquiteVraieDeg(date);

  const milieuDuCiel = longitudeDepuisAscensionDroite(ramc, eps);
  const ascendant = norm360(Math.atan2(
    Math.cos(ramc * R),
    -(Math.sin(ramc * R) * Math.cos(eps * R) + Math.tan(lat * R) * Math.sin(eps * R)),
  ) * DEG);

  const c11 = cuspidePlacidus(ramc, eps, lat, 1 / 3, false);
  const c12 = cuspidePlacidus(ramc, eps, lat, 2 / 3, false);
  const c2 = cuspidePlacidus(ramc, eps, lat, 2 / 3, true);
  const c3 = cuspidePlacidus(ramc, eps, lat, 1 / 3, true);

  if (c11 == null || c12 == null || c2 == null || c3 == null) {
    // Le repli est NOMMÉ, et il garde l'ascendant : ce qui est calculable
    // reste calculé, ce qui ne l'est pas est dit (règle « divulguer »).
    return {
      systeme: 'egales',
      ascendant,
      milieuDuCiel,
      cuspides: Array.from({ length: 12 }, (_, i) => norm360(ascendant + 30 * i)),
      tempsSideralLocalDeg: ramc,
      obliquiteDeg: eps,
      unit: 'degrees',
      motifDuRepli:
        `à ${lat.toFixed(2)}° de latitude, une des cuspides intermédiaires est circumpolaire : `
        + 'les maisons de Placidus n\'y sont pas définies. Maisons ÉGALES depuis l\'ascendant, '
        + 'qui reste exact ; le milieu du ciel n\'est alors pas la cuspide X.',
    };
  }

  return {
    systeme: 'placidus',
    ascendant,
    milieuDuCiel,
    cuspides: [
      ascendant, c2, c3,
      norm360(milieuDuCiel + 180), norm360(c11 + 180), norm360(c12 + 180),
      norm360(ascendant + 180), norm360(c2 + 180), norm360(c3 + 180),
      milieuDuCiel, c11, c12,
    ],
    tempsSideralLocalDeg: ramc,
    obliquiteDeg: eps,
    unit: 'degrees',
  };
}

/* ==========================================================================
 * LA FRONTIÈRE DES OPS
 * ========================================================================== */

/**
 * Ops GÉOCENTRIQUES/temporelles : aucune coordonnée d'observation requise.
 * SSOT consommée par la route /api/compute (incident 428196dc : la garde de la
 * route exigeait lat/lon pour les ops écliptiques — copie divergente écrite
 * AVANT leur ajout → 400 « lat/lon requis » sur un appel frontend CORRECT ;
 * le savoir « quelle op exige des coordonnées » appartient au moteur, jamais
 * à la frontière).
 */
export const ASTRO_OPS_WITHOUT_COORDS: ReadonlySet<string> = new Set([
  'moonIllumination',
  'sunEclipticLongitude',
  'moonEclipticLongitude',
  // Les positions planétaires sont GÉOCENTRIQUES : exiger lat/lon les
  // rejetterait à tort (même incident 428196dc que pour les longitudes).
  'planetEclipticLongitude',
  'ephemeris',
  // Conversion d'horloge : elle ne regarde le ciel d'aucun endroit.
  'instant',
]);

export function astroOpNeedsCoords(op: string): boolean {
  return !ASTRO_OPS_WITHOUT_COORDS.has(op);
}

export interface AstroExtra {
  /** op `instant` : heure de mur "HH:MM". */
  time?: string;
  /** op `instant` : fuseau IANA, rendu par geo.locate. */
  timezone?: string;
}

export function computeAstro(
  op: string,
  dateStr: string | undefined,
  lat: number,
  lon: number,
  extra: AstroExtra = {},
): unknown {
  // L'instant s'analyse PARESSEUSEMENT : l'op `instant` existe précisément
  // pour rendre `date` analysable, elle ne peut donc pas l'exiger d'abord.
  // Et tout passe par un `case` : l'invariant `ASTRO_OPS_WITHOUT_COORDS` se
  // vérifie en cherchant `case '<op>'` dans ce fichier (incident
  // `astro-coords-deadstub`), une écriture qui y échappe rend la garde muette.
  let analysee: Date | null = null;
  const quand = (): Date => (analysee ??= parseInstant(dateStr));
  switch (op) {
    case 'instant':
      return instantDepuisHeureLocale(
        String(dateStr || ''), String(extra.time || ''), String(extra.timezone || ''),
      );
    case 'sunPosition': {
      const p = SunCalc.getPosition(quand(), lat, lon);
      // suncalc ≥ 2.0 : DEGRÉS, azimut compté depuis le NORD (0=N, 90=E,
      // 180=S). L'unité voyage avec le nombre — une doc peut dériver, pas
      // une charge utile.
      return { azimuth: p.azimuth, altitude: p.altitude, unit: 'degrees', azimutDepuis: 'nord' };
    }
    case 'sunTimes': {
      const t = SunCalc.getTimes(quand(), lat, lon);
      return Object.fromEntries(Object.entries(t).map(([k, v]) => [k, iso(v as Date)]));
    }
    case 'moonPosition': {
      const p = SunCalc.getMoonPosition(quand(), lat, lon);
      return {
        azimuth: p.azimuth, altitude: p.altitude,
        distance: p.distance, parallacticAngle: p.parallacticAngle,
        unit: 'degrees', azimutDepuis: 'nord', distanceUnit: 'km',
      };
    }
    case 'moonIllumination': {
      const m = SunCalc.getMoonIllumination(quand());
      return { fraction: m.fraction, phase: m.phase, angle: m.angle, unit: 'degrees' };
    }
    case 'moonTimes': {
      const m = SunCalc.getMoonTimes(quand(), lat, lon);
      return { rise: iso((m as any).rise ?? null), set: iso((m as any).set ?? null), alwaysUp: !!(m as any).alwaysUp, alwaysDown: !!(m as any).alwaysDown };
    }
    case 'sunEclipticLongitude':
      return { eclipticLongitude: sunEclipticLongitude(quand()), unit: 'degrees', precisionDeg: PRECISION_DEG.soleil };
    case 'moonEclipticLongitude':
      return { eclipticLongitude: moonEclipticLongitude(quand()), unit: 'degrees', precisionDeg: PRECISION_DEG.lune };
    case 'houses':
      return computeHouses(quand(), lat, lon);
    default:
      throw new Error(`op astro inconnue: ${op}`);
  }
}

/**
 * ============================================================================
 * LES PLANÈTES — éphéméride RÉELLE (VSOP87), plus une promesse en commentaire
 * ============================================================================
 * Simulation `test/simulation-moteurs-par-domaine` : le substrat renvoyait les
 * positions planétaires « à la lib client astronomia (pack UI réel) » — une lib
 * livrée NULLE PART. Une app d'astrologie générée n'avait donc AUCUN moteur
 * pour ses planètes : le modèle écrivait des valeurs plausibles, et personne ne
 * pouvait le voir. C'est le faux le plus difficile à détecter — un nombre.
 *
 * `astronomia` est désormais une dépendance RÉELLE de la plateforme, et le
 * calcul se fait ici, côté serveur, comme le reste de `server.compute`.
 *
 * CE QUE LE MOTEUR REND, ET CE QU'IL NE REND PAS :
 *  • il rend la PHYSIQUE — longitude écliptique géocentrique en degrés, vitesse
 *    quotidienne, rétrogradation, et depuis ce lot l'ascendant et les maisons.
 *    Vérifiable contre n'importe quelle éphéméride.
 *  • il ne rend PAS l'INTERPRÉTATION — ni signe, ni aspect. Le découpage en
 *    signes dépend d'une tradition (tropical vs sidéral) que le substrat n'a
 *    pas à trancher : c'est du domaine, il appartient au modèle (règle 1). La
 *    conversion est triviale et documentée dans le helper :
 *    `signeTropical = Math.floor(longitude / 30)`.
 *
 * Les données VSOP87 pèsent ~300 Ko par planète : chargement PARESSEUX et mis
 * en cache, jamais au démarrage.
 */
export const PLANETES = ['mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto'] as const;
export type Planete = typeof PLANETES[number];

const cacheVsop = new Map<string, any>();

async function chargerPlanete(nom: Planete): Promise<any> {
  const deja = cacheVsop.get(nom);
  if (deja) return deja;
  // `switch` d'imports STATIQUES : un `import(variable)` empêcherait le
  // bundler de résoudre le module (build Next cassé), et un import en tête
  // chargerait 2 Mo de données à chaque démarrage.
  const mod = await (async () => {
    switch (nom) {
      case 'mercury': return import('astronomia/data/vsop87Bmercury');
      case 'venus': return import('astronomia/data/vsop87Bvenus');
      case 'mars': return import('astronomia/data/vsop87Bmars');
      case 'jupiter': return import('astronomia/data/vsop87Bjupiter');
      case 'saturn': return import('astronomia/data/vsop87Bsaturn');
      case 'uranus': return import('astronomia/data/vsop87Buranus');
      case 'neptune': return import('astronomia/data/vsop87Bneptune');
      default: return null;
    }
  })();
  if (!mod) return null;
  const { planetposition } = await import('astronomia');
  const planete = new (planetposition as any).Planet((mod as any).default || mod);
  cacheVsop.set(nom, planete);
  return planete;
}

async function chargerTerre(): Promise<any> {
  const deja = cacheVsop.get('earth');
  if (deja) return deja;
  const [{ planetposition }, data] = await Promise.all([
    import('astronomia'),
    import('astronomia/data/vsop87Bearth'),
  ]);
  const terre = new (planetposition as any).Planet((data as any).default || data);
  cacheVsop.set('earth', terre);
  return terre;
}

/** Longitude écliptique géocentrique d'une planète, en degrés [0,360). */
export async function planetEclipticLongitude(nom: Planete, date: Date): Promise<number> {
  const [{ julian: jul, elliptic, coord, nutation: nut, pluto }, terre] = await Promise.all([
    import('astronomia') as any,
    chargerTerre(),
  ]);
  const jde = jul.DateToJDE(date);
  const eps = nut.meanObliquity(jde);

  // Pluton n'est PAS dans VSOP87 (ce n'est plus une planète du modèle) :
  // astronomia lui réserve un module dédié. L'omettre serait un manque visible
  // dans toute app d'astrologie.
  const equatorial = nom === 'pluto'
    ? pluto.astrometric(jde, terre)
    : elliptic.position(await chargerPlanete(nom), terre, jde);

  const ecliptique = new coord.Equatorial(equatorial.ra, equatorial.dec).toEcliptic(eps);
  return norm360((ecliptique.lon * 180) / Math.PI);
}

export interface CorpsCeleste {
  body: string;
  /** Longitude écliptique géocentrique, degrés [0,360). 0° = point vernal. */
  eclipticLongitude: number;
  /** Degrés parcourus par jour — négatif quand la planète rétrograde. */
  dailyMotion: number;
  retrograde: boolean;
  /** Tolérance DÉCLARÉE de cette longitude, en degrés. */
  precisionDeg: number;
}

/** Écart angulaire signé entre deux longitudes, en tenant compte du passage 360→0. */
function ecartSigne(apres: number, avant: number): number {
  let d = apres - avant;
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return d;
}

/**
 * Éphéméride complète à un instant : Soleil, Lune et les huit corps suivants.
 * La rétrogradation est MESURÉE (position à J et à J+1), jamais devinée.
 */
export async function computeEphemeris(date: Date): Promise<{ date: string; bodies: CorpsCeleste[]; unit: 'degrees' }> {
  if (Number.isNaN(date.getTime())) throw new Error('date invalide');
  const demain = new Date(date.getTime() + 86400000);

  const bodies: CorpsCeleste[] = [
    (() => {
      const l = sunEclipticLongitude(date);
      return {
        body: 'sun', eclipticLongitude: l,
        dailyMotion: ecartSigne(sunEclipticLongitude(demain), l),
        retrograde: false, precisionDeg: PRECISION_DEG.soleil,
      };
    })(),
    (() => {
      const l = moonEclipticLongitude(date);
      return {
        body: 'moon', eclipticLongitude: l,
        dailyMotion: ecartSigne(moonEclipticLongitude(demain), l),
        retrograde: false, precisionDeg: PRECISION_DEG.lune,
      };
    })(),
  ];

  for (const nom of PLANETES) {
    const [l, l2] = await Promise.all([planetEclipticLongitude(nom, date), planetEclipticLongitude(nom, demain)]);
    const mouvement = ecartSigne(l2, l);
    bodies.push({
      body: nom, eclipticLongitude: l, dailyMotion: mouvement, retrograde: mouvement < 0,
      precisionDeg: nom === 'pluto' ? PRECISION_DEG.pluton : PRECISION_DEG.planete,
    });
  }

  return { date: date.toISOString(), bodies, unit: 'degrees' };
}

/** Ops planétaires — géocentriques, donc sans coordonnées d'observation. */
export const ASTRO_OPS_ASYNC: ReadonlySet<string> = new Set(['planetEclipticLongitude', 'ephemeris']);

export async function computeAstroAsync(
  op: string,
  dateStr: string | undefined,
  planet?: string,
): Promise<unknown> {
  const date = parseInstant(dateStr);
  // `switch/case` et non `if` : l'invariant `ASTRO_OPS_WITHOUT_COORDS` est
  // vérifié en cherchant `case '<op>'` dans ce fichier (incident 428196dc — le
  // savoir « quelle op exige des coordonnées » appartient au moteur). Une
  // écriture qui échappe à cette forme rendrait la garde muette.
  switch (op) {
    case 'ephemeris':
      return computeEphemeris(date);
    case 'planetEclipticLongitude': {
      const nom = String(planet || '').toLowerCase() as Planete;
      if (!PLANETES.includes(nom)) {
        throw new Error(`planète inconnue: ${planet || '(absente)'} — attendu: ${PLANETES.join(', ')}`);
      }
      return {
        body: nom,
        eclipticLongitude: await planetEclipticLongitude(nom, date),
        unit: 'degrees',
        precisionDeg: nom === 'pluto' ? PRECISION_DEG.pluton : PRECISION_DEG.planete,
      };
    }
    default:
      throw new Error(`op astro asynchrone inconnue: ${op}`);
  }
}
