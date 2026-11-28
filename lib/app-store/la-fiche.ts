/**
 * LE KIT DE LA FICHE APP STORE — Antoine, 28/11 (étude App Store, voie 1) : ce qu'App Store Connect demande pour la
 * fiche d'une app, prêt à déposer : les captures aux tailles exactes d'Apple, écran par écran et langue par langue, et
 * les textes de la fiche, écrits par Claude, tenus aux limites d'Apple. vavi ne fait pas d'app native et n'envoie rien
 * à Apple : le kit se télécharge (zip), et le LISEZ-MOI dit honnêtement ce qui reste à faire.
 *
 * Les tailles (aide d'App Store Connect, « Screenshot specifications », lue le 28/11/2026) : iPhone 6,9 pouces
 * 1320 × 2868 (un écran de 440 × 956 points, densité 3), iPad 13 pouces 2064 × 2752 (1032 × 1376, densité 2), de 1 à
 * 10 captures par taille, JPEG ou PNG sans transparence. Les textes : nom 30 caractères (règle 2.3.7), sous-titre 30,
 * texte promotionnel 170, description 4000, mots-clés 100 octets.
 *
 * Une entrée mal formée qui garde son sens est AJUSTÉE (espaces, mots-clés en double ou mal séparés) et c'est dit ; un
 * texte trop long est refusé avec sa longueur, car le raccourcir changerait ce que Claude a écrit. Ce qu'il remplace :
 * rien ; les captures de `build_preview` (l'accueil seul, 390 × 844, pour que Claude se voie) restent ce qu'elles sont.
 * PUR.
 */
import type { Etape, EcranDuParcours, Photo } from '@/lib/parcours/le-parcours';
import { leZip } from '@/lib/export/l-export';

export const LIMITES = { nom: 30, sousTitre: 30, promo: 170, description: 4000, motsClesOctets: 100 } as const;
export const ECRANS_MAX = 10;

export type Appareil = 'iphone' | 'ipad';
export const APPAREILS: Readonly<Record<Appareil, { readonly dossier: string; readonly libelle: string; readonly pixels: string; readonly ecran: EcranDuParcours }>> = {
  iphone: { dossier: 'iphone-6.9', libelle: 'iPhone 6,9"', pixels: '1320 × 2868', ecran: { width: 440, height: 956, echelle: 3 } },
  ipad: { dossier: 'ipad-13', libelle: 'iPad 13"', pixels: '2064 × 2752', ecran: { width: 1032, height: 1376, echelle: 2 } },
};

export interface FicheDUneLangue {
  readonly langue: string; readonly nom: string; readonly sousTitre: string; readonly promo: string;
  readonly description: string; readonly motsCles: string;
}
export interface EcranDuKit { readonly nom: string; readonly adresse: string; readonly etapes: readonly Etape[] }

/** Le code de langue d'App Store Connect pour une langue d'app (`fr` → `fr-FR`) ; une langue déjà régionale reste. */
const LOCALES: Readonly<Record<string, string>> = {
  fr: 'fr-FR', en: 'en-US', de: 'de-DE', es: 'es-ES', it: 'it', nl: 'nl-NL', pt: 'pt-PT', ja: 'ja', ko: 'ko', zh: 'zh-Hans',
  ar: 'ar-SA', ru: 'ru', sv: 'sv', da: 'da', no: 'no', nb: 'no', fi: 'fi', pl: 'pl', tr: 'tr', ca: 'ca', el: 'el', he: 'he',
  cs: 'cs', hu: 'hu', ro: 'ro', sk: 'sk', uk: 'uk', hr: 'hr', id: 'id', ms: 'ms', th: 'th', vi: 'vi', hi: 'hi',
};
export const laLocaleDApple = (langue: string): string => (langue.includes('-') ? langue : LOCALES[langue.toLowerCase()] ?? langue);

const octets = (t: string): number => Buffer.byteLength(t, 'utf8');
const longueur = (t: string): number => [...t].length;
const uneLigne = (t: string): string => t.replace(/\s+/g, ' ').trim();

/**
 * Les fiches relues : ajustées sans changer leur sens, ou refusées avec ce qui dépasse. `langues` : celles de l'app,
 * la principale d'abord.
 */
export function relireLesFiches(fiches: readonly FicheDUneLangue[], langues: readonly string[]):
  | { readonly ok: true; readonly fiches: readonly FicheDUneLangue[]; readonly ajuste: readonly string[] }
  | { readonly ok: false; readonly ecarts: readonly string[] } {
  const ecarts: string[] = [];
  const ajuste: string[] = [];
  const vues = new Set<string>();
  const relues = fiches.map((f) => {
    const l = f.langue;
    if (!langues.includes(l)) ecarts.push(`${l}: the app is not in this language (its languages: ${langues.join(', ')})`);
    if (vues.has(l)) ecarts.push(`${l}: given twice`);
    vues.add(l);
    const nom = uneLigne(f.nom), sousTitre = uneLigne(f.sousTitre), promo = uneLigne(f.promo);
    const description = f.description.replace(/\r\n/g, '\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    const lus = f.motsCles.split(/[,;，、\n]/).map(uneLigne).filter(Boolean);
    const uniques = lus.filter((m, i) => lus.findIndex((x) => x.toLocaleLowerCase() === m.toLocaleLowerCase()) === i);
    const motsCles = uniques.join(',');
    if (motsCles !== f.motsCles) ajuste.push(`${l}: keywords written as ${JSON.stringify(motsCles)} (one comma between them, no space: Apple counts every byte${uniques.length < lus.length ? '; a repeated keyword removed' : ''})`);
    if (nom !== f.nom || sousTitre !== f.sousTitre || promo !== f.promo) ajuste.push(`${l}: extra spaces removed from the name, subtitle or promotional text`);
    if (longueur(nom) < 2) ecarts.push(`${l}: the name is empty`);
    if (longueur(nom) > LIMITES.nom) ecarts.push(`${l}: the name has ${longueur(nom)} characters, Apple allows ${LIMITES.nom}`);
    if (longueur(sousTitre) > LIMITES.sousTitre) ecarts.push(`${l}: the subtitle has ${longueur(sousTitre)} characters, Apple allows ${LIMITES.sousTitre}`);
    if (longueur(promo) > LIMITES.promo) ecarts.push(`${l}: the promotional text has ${longueur(promo)} characters, Apple allows ${LIMITES.promo}`);
    if (longueur(description) < 10) ecarts.push(`${l}: the description is empty`);
    if (longueur(description) > LIMITES.description) ecarts.push(`${l}: the description has ${longueur(description)} characters, Apple allows ${LIMITES.description}`);
    if (octets(motsCles) > LIMITES.motsClesOctets) ecarts.push(`${l}: the keywords take ${octets(motsCles)} bytes, Apple allows ${LIMITES.motsClesOctets} (an accented letter takes 2)`);
    return { langue: l, nom, sousTitre, promo, description, motsCles };
  });
  return ecarts.length ? { ok: false, ecarts } : { ok: true, fiches: relues, ajuste };
}

const bout = (t: string): string => t.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase().slice(0, 40) || 'ecran';
const numero = (i: number): string => String(i + 1).padStart(2, '0');

/** L'adresse d'un écran dans une langue : la principale à sa place, une autre sous `/<langue>`. */
export const lAdresseDansLaLangue = (adresse: string, langue: string, principale: string): string =>
  langue === principale ? adresse : adresse === '/' ? `/${langue}` : `/${langue}${adresse}`;

/** Le parcours d'un appareil : pour chaque langue, chaque écran ouvert, ses étapes jouées, puis photographié. */
export function lesEtapesDuKit(ecrans: readonly EcranDuKit[], langues: readonly string[], principale: string): Etape[] {
  return langues.flatMap((l) => ecrans.flatMap((e, i): Etape[] => [
    { action: 'open', path: lAdresseDansLaLangue(e.adresse, l, principale) }, ...e.etapes,
    { action: 'shoot', name: `${l}/${numero(i)}-${bout(e.nom)}` },
  ]));
}

const laFicheEnTexte = (f: FicheDUneLangue): string => [
  `Nom / Name (${longueur(f.nom)}/${LIMITES.nom})`, f.nom, '',
  `Sous-titre / Subtitle (${longueur(f.sousTitre)}/${LIMITES.sousTitre})`, f.sousTitre, '',
  `Texte promotionnel / Promotional text (${longueur(f.promo)}/${LIMITES.promo})`, f.promo, '',
  `Mots-clés / Keywords (${octets(f.motsCles)}/${LIMITES.motsClesOctets} octets / bytes)`, f.motsCles, '',
  `Description (${longueur(f.description)}/${LIMITES.description})`, f.description, '',
].join('\n');

/** Les fichiers du kit, chemin → contenu : les textes et les captures de chaque langue, et le LISEZ-MOI. */
export function leKit(x: { readonly nom: string; readonly le: string; readonly fiches: readonly FicheDUneLangue[];
  readonly photos: ReadonlyMap<Appareil, readonly Photo[]> }): Map<string, string | Uint8Array> {
  const f = new Map<string, string | Uint8Array>();
  for (const fiche of x.fiches) f.set(`${laLocaleDApple(fiche.langue)}/fiche.txt`, laFicheEnTexte(fiche));
  for (const [appareil, photos] of x.photos) {
    for (const p of photos) {
      const [langue, nom] = p.nom.split('/') as [string, string];
      f.set(`${laLocaleDApple(langue)}/${APPAREILS[appareil].dossier}/${nom}.jpg`, p.jpeg);
    }
  }
  const tailles = [...x.photos.keys()].map((a) => `${APPAREILS[a].libelle} : ${APPAREILS[a].pixels} (${APPAREILS[a].dossier}/)`).join(' ; ');
  f.set('LISEZ-MOI.txt', [
    `${x.nom} — kit de la fiche App Store, fait par vavi le ${x.le.slice(0, 10)}`, '',
    'CE QUI EST DEDANS',
    `- Un dossier par langue (code d'App Store Connect : ${x.fiches.map((y) => laLocaleDApple(y.langue)).join(', ')}).`,
    '- fiche.txt : le nom, le sous-titre, le texte promotionnel, les mots-clés et la description, chacun dans la limite d\'Apple (le compte est écrit à côté).',
    `- Les captures, aux tailles exactes d'Apple, en JPEG sans transparence : ${tailles}.`, '',
    'COMMENT LES DÉPOSER',
    '- Dans App Store Connect : ton app → la version à publier → choisis la langue en haut à droite.',
    '- Glisse les captures du dossier de l\'iPhone dans « iPhone 6,9" » (et celles de l\'iPad dans « iPad 13" »), dans l\'ordre de leur numéro.',
    '- Recopie les textes de fiche.txt dans les champs du même nom. Recommence pour chaque langue.', '',
    'CE QUE CE KIT NE FAIT PAS (à lire avant de te lancer)',
    '- vavi ne fabrique pas l\'app iPhone elle-même : il faut un « binaire », construit sur un Mac avec Xcode, par toi ou un prestataire.',
    '- Apple exige que l\'app soit envoyée depuis TON compte Apple Developer (99 $ par an) : une app faite par un service de génération et envoyée par lui est refusée (règle 4.2.6).',
    '- Apple refuse une app qui n\'est qu\'un site web dans une coquille (règle 4.2) : il lui faut des fonctions propres au téléphone.',
    '- Un abonnement ou un contenu numérique vendu dans l\'app doit passer par l\'achat intégré d\'Apple (règle 3.1.1) ; un objet ou un service réel peut rester payé par Stripe.',
    '- Sans l\'App Store, ton app s\'installe déjà sur le téléphone : dans Safari, Partager → « Sur l\'écran d\'accueil » ; elle s\'ouvre alors en plein écran avec son icône.', '',
    '— English —',
    'One folder per language: fiche.txt holds the name, subtitle, promotional text, keywords and description within Apple\'s limits;',
    'the screenshots are at Apple\'s exact sizes. In App Store Connect, open the version, pick the language, drag the screenshots in their',
    'order into the matching device slot, and copy the texts. vavi does not build the iOS binary (it needs a Mac and Xcode) and sends',
    'nothing to Apple: the app must be submitted from your own Apple Developer account (guideline 4.2.6), and an app that is only a',
    'website is refused (4.2). Without the App Store, the app already installs from Safari: Share → "Add to Home Screen".', '',
  ].join('\n'));
  return f;
}

/** Le kit en archive, et la clé où le magasin le garde (le dernier fait remplace le précédent ; jamais servi par le site). */
export const leZipDuKit = (x: Parameters<typeof leKit>[0]): Buffer => Buffer.from(leZip(leKit(x)));
export const cleDuKit = (projet: string): string => `kits-app-store/${projet}.zip`;
