// Repris de constructor-v13@5bb786e : generateur-v2/controles/l-atelier.ts
/**
 * L'atelier : un dossier où l'arbre de l'app est écrit pour être construit et regardé.
 * Les dépendances sont installées une fois par empreinte de `package-lock.json`, puis liées dans chaque atelier.
 */
import { leVerrouCouvre } from '@/lib/paquets/les-paquets';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, renameSync, rmSync, symlinkSync, writeFileSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { promisify } from 'node:util';
import { argumentsDuBacASable, BWRAP, racineDeNode } from './le-bac-a-sable';

const executer = promisify(execFile);
/** Où les dépendances s'installent : l'image de production les y pose d'avance (`lib/atelier/prechauffer.ts`). */
const MAGASIN = process.env.VAVI_DEPENDANCES_DES_APPS || join(tmpdir(), 'vavi-dependances-des-apps');

export interface Sortie { readonly ok: boolean; readonly sortie: string }

/** Le début de la sortie quand le bac à sable ne s'ouvre pas : le build est refusé, jamais lancé à découvert. */
export const BAC_A_SABLE_FERME = 'The build sandbox could not start on this vavi server.';

/**
 * L'environnement d'une commande de la plateforme (l'installation des dépendances) : jamais celui du serveur, qui porte
 * ses secrets ; le strict nécessaire à npm.
 */
const ENV_DE_L_INSTALLATION = (): NodeJS.ProcessEnv => ({
  PATH: process.env.PATH, HOME: tmpdir(), CI: '1', NODE_ENV: process.env.NODE_ENV ?? 'production',
  ...(process.env.npm_config_cache ? { npm_config_cache: process.env.npm_config_cache } : {}),
  ...(process.env.HTTPS_PROXY ? { HTTPS_PROXY: process.env.HTTPS_PROXY, https_proxy: process.env.HTTPS_PROXY } : {}),
  ...(process.env.NODE_EXTRA_CA_CERTS ? { NODE_EXTRA_CA_CERTS: process.env.NODE_EXTRA_CA_CERTS } : {}),
});

/** Lance une commande dans un dossier ; rend sa sortie, jamais une exception. */
export async function lancer(commande: string, args: readonly string[], dossier: string, delaiMs = 180_000): Promise<Sortie> {
  try {
    const r = await executer(commande, [...args], { cwd: dossier, timeout: delaiMs, maxBuffer: 20 * 1024 * 1024, env: ENV_DE_L_INSTALLATION() });
    return { ok: true, sortie: `${r.stdout}${r.stderr}` };
  } catch (e) {
    const x = e as { stdout?: string; stderr?: string; message: string };
    return { ok: false, sortie: `${x.stdout ?? ''}${x.stderr ?? ''}` || x.message };
  }
}

/**
 * `--include=dev` : le build d'une app a besoin de ses outils (typescript, vite), déclarés en devDependencies du gabarit ;
 * sans lui, `npm ci` les saute dès que `NODE_ENV=production`, ce que pose l'image du serveur (incident du 24/11 sur
 * vavi-essai : « Cannot find module 'typescript/bin/tsc' »).
 */
export const ARGUMENTS_DE_L_INSTALLATION = ['ci', '--include=dev', '--no-audit', '--no-fund', '--ignore-scripts'] as const;
export const ARGUMENTS_DE_L_AJOUT = ['install', '--include=dev', '--no-audit', '--no-fund', '--ignore-scripts', '--save-exact'] as const;
/** Change quand la manière d'installer change : une installation d'avant, incomplète, n'est jamais reprise. */
const FACON = 'avec-les-outils-de-build';

const enCours = new Map<string, Promise<string>>();

/** Ce qui s'installe d'un package.json (ses dépendances), sans son nom : toutes les apps du même gabarit partagent l'installation. */
const lesDependances = (paquet: string): string => {
  try { const j = JSON.parse(paquet) as { dependencies?: unknown; devDependencies?: unknown }; return JSON.stringify([j.dependencies ?? {}, j.devDependencies ?? {}]); } catch { return paquet; }
};

/**
 * Les dépendances de ce `package-lock.json`, installées une fois. Deux builds simultanés du même verrou attendent la
 * même installation (vavi : plusieurs apps se construisent dans le même processus ; deux `npm ci` dans le même dossier
 * se marchaient dessus).
 */
export function dependances(lock: string, paquet: string): Promise<string> {
  const cle = createHash('sha256').update(lock).update(lesDependances(paquet)).digest('hex');
  const deja = enCours.get(cle);
  if (deja) return deja;
  const p = installer(lock, paquet).finally(() => enCours.delete(cle));
  enCours.set(cle, p);
  return p;
}

/**
 * L'installation se fait dans un dossier PRIVÉ, puis prend sa place d'un seul renommage : deux PROCESSUS qui installent
 * le même verrou (deux serveurs, deux essais en parallèle) ne partagent jamais un `node_modules` à moitié écrit. Le
 * premier renommage gagne ; l'autre jette le sien. (Incident CI du 24/11 sur la PR #5 : deux `npm ci` dans le même
 * dossier, `ENOENT mkdir node_modules/zod`.)
 */
async function installer(lock: string, paquet: string): Promise<string> {
  const empreinte = createHash('sha256').update(lock).update(lesDependances(paquet)).update(FACON).digest('hex').slice(0, 16);
  const dossier = join(MAGASIN, empreinte);
  const pret = () => existsSync(join(dossier, 'node_modules', '.installe'));
  if (pret()) return join(dossier, 'node_modules');
  mkdirSync(MAGASIN, { recursive: true });
  const prive = mkdtempSync(join(MAGASIN, `${empreinte}-`));
  try {
    writeFileSync(join(prive, 'package-lock.json'), lock);
    writeFileSync(join(prive, 'package.json'), paquet);
    // Des paquets ajoutés (`lib/paquets`) que le verrou du gabarit ne couvre pas : npm les résout et complète le verrou,
    // toujours sans scripts ; le build, lui, reste au bac à sable sans réseau.
    const r = await lancer('npm', leVerrouCouvre(paquet, lock) ? [...ARGUMENTS_DE_L_INSTALLATION] : [...ARGUMENTS_DE_L_AJOUT], prive, 600_000);
    if (!r.ok) throw new Error(`les dépendances de l'app ne s'installent pas : ${r.sortie.slice(-2000)}`);
    writeFileSync(join(prive, 'node_modules', '.installe'), empreinte);
    if (pret()) return join(dossier, 'node_modules');
    try { renameSync(prive, dossier); } catch (e) { if (!pret()) throw e; }
    return join(dossier, 'node_modules');
  } finally {
    if (existsSync(prive)) rmSync(prive, { recursive: true, force: true });
  }
}

export class Atelier {
  private constructor(readonly dossier: string, private readonly dependances: string) {}

  /**
   * Lance un script de node (un chemin relatif à l'atelier, ex. `node_modules/vite/bin/vite.js`) DANS LE BAC À SABLE :
   * ni réseau, ni environnement du serveur, ni autre disque que l'atelier (`le-bac-a-sable.ts`).
   */
  async lancerIsole(script: string, args: readonly string[], delaiMs = 180_000): Promise<Sortie> {
    const node = racineDeNode();
    const sonde = await lancer(BWRAP, argumentsDuBacASable({ atelier: this.dossier, lecture: [this.dependances], node, commande: [join(node, 'bin', 'node'), '-e', ''] }), this.dossier, 30_000);
    if (!sonde.ok) return { ok: false, sortie: `${BAC_A_SABLE_FERME} ${sonde.sortie.slice(-500)}` };
    const commande = [join(node, 'bin', 'node'), script, ...args];
    return lancer(BWRAP, argumentsDuBacASable({ atelier: this.dossier, lecture: [this.dependances], node, commande }), this.dossier, delaiMs);
  }

  static async ouvrir(arbre: ReadonlyMap<string, string>): Promise<Atelier> {
    const lock = arbre.get('package-lock.json');
    const paquet = arbre.get('package.json');
    if (!lock || !paquet) throw new Error('package.json et package-lock.json sont figés : ils manquent à l’arbre');
    const deps = await dependances(lock, paquet);
    const atelier = new Atelier(mkdtempSync(join(tmpdir(), 'vavi-atelier-')), dirname(deps));
    atelier.ecrire(arbre);
    symlinkSync(deps, join(atelier.dossier, 'node_modules'), 'dir');
    return atelier;
  }

  /** Écrit l'arbre tel quel : un fichier absent de l'arbre est retiré de l'atelier. */
  ecrire(arbre: ReadonlyMap<string, string>): void {
    for (const present of this.fichiers()) if (!arbre.has(present)) unlinkSync(join(this.dossier, present));
    for (const [chemin, contenu] of arbre) {
      mkdirSync(dirname(join(this.dossier, chemin)), { recursive: true });
      writeFileSync(join(this.dossier, chemin), contenu);
    }
  }

  private fichiers(dossier = this.dossier): string[] {
    return readdirSync(dossier).flatMap((n) => {
      if (n === 'node_modules' || n === 'dist') return [];
      const p = join(dossier, n);
      return statSync(p).isDirectory() ? this.fichiers(p) : [relative(this.dossier, p).split('\\').join('/')];
    });
  }

  fermer(): void { rmSync(this.dossier, { recursive: true, force: true }); }
}
