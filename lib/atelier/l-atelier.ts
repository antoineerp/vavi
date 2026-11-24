// Repris de constructor-v13@5bb786e : generateur-v2/controles/l-atelier.ts
/**
 * L'atelier : un dossier où l'arbre de l'app est écrit pour être construit et regardé.
 * Les dépendances sont installées une fois par empreinte de `package-lock.json`, puis liées dans chaque atelier.
 */
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { promisify } from 'node:util';

const executer = promisify(execFile);
/** Où les dépendances s'installent : l'image de production les y pose d'avance (`lib/atelier/prechauffer.ts`). */
const MAGASIN = process.env.VAVI_DEPENDANCES_DES_APPS || join(tmpdir(), 'vavi-dependances-des-apps');

export interface Sortie { readonly ok: boolean; readonly sortie: string }

/** Lance une commande dans un dossier ; rend sa sortie, jamais une exception. */
export async function lancer(commande: string, args: readonly string[], dossier: string, delaiMs = 180_000): Promise<Sortie> {
  try {
    const r = await executer(commande, [...args], { cwd: dossier, timeout: delaiMs, maxBuffer: 20 * 1024 * 1024, env: { ...process.env, CI: '1' } });
    return { ok: true, sortie: `${r.stdout}${r.stderr}` };
  } catch (e) {
    const x = e as { stdout?: string; stderr?: string; message: string };
    return { ok: false, sortie: `${x.stdout ?? ''}${x.stderr ?? ''}` || x.message };
  }
}

const enCours = new Map<string, Promise<string>>();

/**
 * Les dépendances de ce `package-lock.json`, installées une fois. Deux builds simultanés du même verrou attendent la
 * même installation (vavi : plusieurs apps se construisent dans le même processus ; deux `npm ci` dans le même dossier
 * se marchaient dessus).
 */
export function dependances(lock: string, paquet: string): Promise<string> {
  const cle = createHash('sha256').update(lock).digest('hex');
  const deja = enCours.get(cle);
  if (deja) return deja;
  const p = installer(lock, paquet).finally(() => enCours.delete(cle));
  enCours.set(cle, p);
  return p;
}

async function installer(lock: string, paquet: string): Promise<string> {
  const empreinte = createHash('sha256').update(lock).digest('hex').slice(0, 16);
  const dossier = join(MAGASIN, empreinte);
  if (existsSync(join(dossier, 'node_modules', '.installe'))) return join(dossier, 'node_modules');
  mkdirSync(dossier, { recursive: true });
  writeFileSync(join(dossier, 'package-lock.json'), lock);
  writeFileSync(join(dossier, 'package.json'), paquet);
  const r = await lancer('npm', ['ci', '--no-audit', '--no-fund', '--ignore-scripts'], dossier, 600_000);
  if (!r.ok) throw new Error(`les dépendances de l'app ne s'installent pas : ${r.sortie.slice(-2000)}`);
  writeFileSync(join(dossier, 'node_modules', '.installe'), empreinte);
  return join(dossier, 'node_modules');
}

export class Atelier {
  private constructor(readonly dossier: string) {}

  static async ouvrir(arbre: ReadonlyMap<string, string>): Promise<Atelier> {
    const lock = arbre.get('package-lock.json');
    const paquet = arbre.get('package.json');
    if (!lock || !paquet) throw new Error('package.json et package-lock.json sont figés : ils manquent à l’arbre');
    const atelier = new Atelier(mkdtempSync(join(tmpdir(), 'vavi-atelier-')));
    atelier.ecrire(arbre);
    symlinkSync(await dependances(lock, paquet), join(atelier.dossier, 'node_modules'), 'dir');
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
