/**
 * LES PAQUETS NPM D'UNE APP — en plus du gabarit verrouillé, ceux que Claude ajoute par l'outil `add_packages` (décision
 * d'Antoine du 25/11 : « Ouverts, vérifiés au build » ; Claude connaît l'écosystème mieux qu'une liste figée). Chaque
 * paquet est VÉRIFIÉ au registre npm avant d'entrer : il existe, sa version est exacte et non dépréciée, sa taille est
 * bornée, il n'a besoin d'aucun script d'installation (vavi installe toujours sans scripts) ni d'un système particulier.
 * La liste vit dans `vavi-paquets.json` (écrit par l'outil seul) ; le `package.json` de l'app est celui du gabarit plus
 * ces paquets, et le build installe hors du bac à sable, sans scripts, puis construit DANS le bac à sable, sans réseau.
 *
 * Ce qu'il remplace (interdit 9) : le refus `paquet_inconnu` de tout paquet hors du gabarit (essai « Thème astral » du
 * 25/11 : une bibliothèque d'éphémérides refusée). Un paquet du gabarit garde sa version verrouillée. PUR, sauf
 * `verifierAuRegistre`, dont le réseau est injecté.
 */
export const CHEMIN_DES_PAQUETS = 'vavi-paquets.json';
export const PAQUETS_MAX = 25;
export const TAILLE_MAX_OCTETS = 30 * 1024 * 1024;

export type Issue<T> = { readonly lu: true; readonly valeur: T } | { readonly lu: false; readonly pourquoi: string };
export type Paquets = Readonly<Record<string, string>>;

const NOM = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]{0,213}$/;
const EXACTE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

/** Les paquets ajoutés, lus du fichier ; un fichier absent ou illisible n'en ajoute aucun. PURE. */
export function lesPaquetsAjoutes(texte: string | undefined): Paquets {
  if (!texte) return {};
  try {
    const j = JSON.parse(texte) as { paquets?: Record<string, unknown> };
    return Object.fromEntries(Object.entries(j.paquets ?? {}).filter(([n, v]) => NOM.test(n) && typeof v === 'string' && EXACTE.test(v))) as Paquets;
  } catch { return {}; }
}

export const leFichierDesPaquets = (p: Paquets): string =>
  `${JSON.stringify({ paquets: Object.fromEntries(Object.entries(p).sort(([a], [b]) => a.localeCompare(b))) }, null, 2)}\n`;

/** Le `package.json` de l'app : celui du gabarit, plus les paquets ajoutés (jamais à la place d'un paquet du gabarit). PURE. */
export function lePackageJsonAvec(gabarit: string, ajoutes: Paquets): string {
  const extra = Object.entries(ajoutes);
  if (extra.length === 0) return gabarit;
  const j = JSON.parse(gabarit) as { dependencies?: Record<string, string> };
  const deps = { ...(j.dependencies ?? {}) };
  for (const [n, v] of extra) if (!(n in deps)) deps[n] = v;
  return `${JSON.stringify({ ...j, dependencies: Object.fromEntries(Object.entries(deps).sort(([a], [b]) => a.localeCompare(b))) }, null, 2)}\n`;
}

/** Le verrou couvre-t-il chaque dépendance du `package.json` ? Sinon, le build doit le recalculer (`npm install`). PURE. */
export function leVerrouCouvre(packageJson: string, lock: string): boolean {
  try {
    const deps = Object.keys((JSON.parse(packageJson) as { dependencies?: Record<string, string> }).dependencies ?? {});
    const racine = (JSON.parse(lock) as { packages?: Record<string, { dependencies?: Record<string, string> }> }).packages?.['']?.dependencies ?? {};
    return deps.every((d) => d in racine);
  } catch { return false; }
}

export interface Demande { readonly name: string; readonly version?: string }
interface Version { version?: string; deprecated?: string; os?: string[]; cpu?: string[]; gypfile?: boolean; hasInstallScript?: boolean;
  scripts?: Record<string, string>; dist?: { unpackedSize?: number } }

/** Pourquoi une version publiée ne peut pas entrer dans une app ; `null` : elle entre. PURE. */
export function leRefusDUneVersion(nom: string, v: Version): string | null {
  if (v.deprecated) return `${nom}@${v.version} is deprecated (${String(v.deprecated).slice(0, 120)})`;
  const scripts = Object.keys(v.scripts ?? {}).filter((s) => ['preinstall', 'install', 'postinstall'].includes(s));
  if (v.gypfile || scripts.length) return `${nom}@${v.version} needs an install script (${scripts.join(', ') || 'native build'}), and vavi never runs install scripts: choose a pure JavaScript package`;
  if (v.os?.length || v.cpu?.length) return `${nom}@${v.version} only installs on some systems`;
  if ((v.dist?.unpackedSize ?? 0) > TAILLE_MAX_OCTETS) return `${nom}@${v.version} weighs ${Math.round((v.dist!.unpackedSize ?? 0) / 1048576)} MB (at most ${TAILLE_MAX_OCTETS / 1048576} MB)`;
  return null;
}

/**
 * Chaque paquet demandé, vérifié au registre npm : sa version (exacte, sinon la dernière publiée sous `latest`), puis ce
 * qui la refuserait. Rend les versions retenues, ou le premier refus.
 */
export async function verifierAuRegistre(demandes: readonly Demande[], gabarit: readonly string[], appeler: typeof fetch = fetch): Promise<Issue<Paquets>> {
  const retenus: Record<string, string> = {};
  for (const d of demandes) {
    const nom = d.name.trim().toLowerCase();
    if (!NOM.test(nom)) return { lu: false, pourquoi: `"${d.name.slice(0, 80)}" is not an npm package name` };
    if (gabarit.includes(nom)) continue; // déjà dans le gabarit, à sa version verrouillée
    let doc: { 'dist-tags'?: Record<string, string>; versions?: Record<string, Version> };
    try {
      const r = await appeler(`https://registry.npmjs.org/${nom.replace('/', '%2F')}`, { headers: { accept: 'application/json' } });
      if (r.status === 404) return { lu: false, pourquoi: `${nom} does not exist on npm` };
      if (!r.ok) return { lu: false, pourquoi: `the npm registry answered ${r.status} for ${nom}` };
      doc = await r.json() as typeof doc;
    } catch (e) { return { lu: false, pourquoi: `the npm registry did not answer (${String((e as Error)?.message ?? e).slice(0, 120)})` }; }
    const version = d.version?.trim() || doc['dist-tags']?.latest;
    if (!version || !EXACTE.test(version)) return { lu: false, pourquoi: `${nom}: give an exact version (like 1.2.3), or none for the latest` };
    const v = doc.versions?.[version];
    if (!v) return { lu: false, pourquoi: `${nom}@${version} is not published on npm` };
    const refus = leRefusDUneVersion(nom, { ...v, version });
    if (refus) return { lu: false, pourquoi: refus };
    retenus[nom] = version;
  }
  return { lu: true, valeur: retenus };
}
