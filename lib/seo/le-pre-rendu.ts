// Repris de constructor-v13@5bb786e : generateur-v2/controles/le-pre-rendu.ts
/**
 * LE PRÉ-RENDU DES PAGES PUBLIQUES — au build de l'aperçu, chaque page publique sans paramètre, ouverte en visiteur dans
 * un vrai navigateur sur le dist construit, est gardée telle qu'elle s'affiche (`_pre-rendu/<adresse>/index.html`,
 * marquée `data-pre-rendu`). Un moteur de recherche ou un assistant qui n'exécute pas JavaScript lit la page ; React la
 * remplace au chargement. `decouverte.json` dit le nom, la description, la langue, les pages gardées et toutes les
 * adresses de l'app. Une page en attente, en panne, redirigée ou sans texte n'est pas gardée : elle sert la coquille, et
 * c'est dit. Les fichiers de Claude ne sont jamais touchés : le pré-rendu AJOUTE des fichiers au dist, à côté.
 *
 * Elle est rendue sous une base neutre (`BASE_DU_PRE_RENDU`), remplacée au service par l'adresse où la page est servie :
 * une page pré-rendue ne sait pas si elle sera servie sous `/s/<id>/` ou, plus tard, à la racine d'un domaine.
 */
import { createServer, type Server } from 'node:http';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { poserLEnvironnement, type EnvDeLApp } from '@/lib/publication/servir';
import { typeDe } from '@/lib/publication/publier';
import { DOSSIER_DU_PRE_RENDU, FICHIER_DE_DECOUVERTE, MARQUE_DU_PRE_RENDU, TEXTE_D_UNE_PAGE, type Editeur } from './la-decouverte';

export const BASE_DU_PRE_RENDU = '/__vavi_base__/';

interface RequeteInterceptee { request(): { url(): string }; continue(): Promise<void>; abort(code?: string): Promise<void> }
interface PageDuNavigateur {
  route(motif: string, h: (r: RequeteInterceptee) => unknown): Promise<unknown>;
  goto(url: string, o: { waitUntil: 'networkidle'; timeout: number }): Promise<unknown>;
  waitForFunction(f: () => boolean, a: null, o: { timeout: number }): Promise<unknown>;
  evaluate<R, A>(f: (a: A) => R, a: A): Promise<R>;
  content(): Promise<string>;
  close(): Promise<void>;
}
/** Ce que le pré-rendu emploie d'un navigateur (Chromium par Playwright) ; `null` : aucun sur ce serveur. */
export interface UnNavigateur {
  newPage(o: { reducedMotion: 'reduce'; locale: string }): Promise<PageDuNavigateur>;
  close(): Promise<void>;
}

/**
 * Chromium sur ce serveur, par Playwright ; `null` si l'un ou l'autre manque, ou si son bac à sable ne démarre pas (le
 * pré-rendu est alors sauté, et c'est dit). Le navigateur exécute le code d'une app écrit par Claude : il garde SON bac à
 * sable (jamais `--no-sandbox`, que constructor-v13 passait), et il ne joint que l'hôte local et les hôtes permis (la
 * base de l'app) : tout le reste passe par un mandataire qui n'existe pas (vague 0, audit du 24/11).
 */
export async function leNavigateurDuServeur(hotes: readonly string[], env: Readonly<Record<string, string | undefined>> = process.env): Promise<UnNavigateur | null> {
  const o = await ouvrirLeNavigateur(hotes, env);
  return 'navigateur' in o ? o.navigateur : null;
}

/** Le navigateur, ou la raison pour laquelle il n'a pas démarré (dite au résultat de `build_preview` et au journal). */
export async function ouvrirLeNavigateur(hotes: readonly string[], env: Readonly<Record<string, string | undefined>> = process.env):
  Promise<{ readonly navigateur: UnNavigateur } | { readonly raison: string }> {
  const paquet = env.VAVI_PLAYWRIGHT ?? 'playwright';
  let chromium: { launch(o: object): Promise<UnNavigateur> };
  try {
    // Le nom passe par une variable : le paquet du serveur se charge à l'exécution, jamais empaqueté par le build de vavi.
    // Par `process.getBuiltinModule` : le build de Next remplaçait `createRequire(...)` importé par `(void 0)` (24/11,
    // vavi-essai : « (void 0) is not a function »), et le pré-rendu n'a jamais tourné sur le serveur.
    const exiger = process.getBuiltinModule('node:module').createRequire(join(process.cwd(), 'package.json'));
    ({ chromium } = exiger(paquet) as { chromium: typeof chromium });
  } catch (e) {
    return { raison: `Playwright not found (${paquet}): ${String((e as Error)?.message ?? e).split('\n')[0]!.slice(0, 200)}` };
  }
  try {
    const chemin = env.VAVI_CHROMIUM ?? (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
    return { navigateur: await chromium.launch({ ...(chemin ? { executablePath: chemin } : {}), chromiumSandbox: true, args: argumentsDuNavigateur(hotes) }) };
  } catch (e) {
    const raison = `Chromium did not start with its sandbox: ${String((e as Error)?.message ?? e).replace(/\s+/g, ' ').slice(0, 400)}`;
    console.error(`[pre-rendu] navigateur indisponible : ${raison}`);
    return { raison };
  }
}

/** Le réseau du navigateur : un mandataire mort pour tout, sauf la boucle locale (contournée par Chromium d'office) et
 * les hôtes permis. Les adresses IP écrites en dur et les WebSockets y passent aussi. PURE. */
export const argumentsDuNavigateur = (hotes: readonly string[]): string[] =>
  ['--proxy-server=http://127.0.0.1:9', `--proxy-bypass-list=${hotes.map((h) => new URL(h).host).join(';')}`];

/** Une requête que la page du pré-rendu peut faire : le site servi en mémoire, ou un hôte permis. PURE. */
export const requetePermise = (url: string, site: string, hotes: readonly string[]): boolean => {
  try {
    const o = new URL(url).origin;
    return o === new URL(site).origin || hotes.some((h) => new URL(h).origin === o) || url.startsWith('data:');
  } catch { return false; }
};

export interface PreRendu {
  /** Les fichiers à ajouter au dist. */
  readonly fichiers: ReadonlyMap<string, Buffer>;
  readonly gardees: readonly string[];
  readonly ecartees: readonly { readonly adresse: string; readonly pourquoi: string }[];
}
interface Faits { readonly pages: ReadonlyArray<{ readonly chemin: string; readonly acces: { readonly nature: string } }> }

/** Où une page pré-rendue s'écrit dans le dist : `/` → `_pre-rendu/index.html`, `/a/b` → `_pre-rendu/a/b/index.html`. */
export const fichierDuPreRendu = (adresse: string): string => `${DOSSIER_DU_PRE_RENDU}/${adresse === '/' ? '' : `${adresse.replace(/^\/+|\/+$/g, '')}/`}index.html`;

/** Ce que le navigateur a rendu, gardé sans l'environnement de service (reposé à chaque service). PUR. */
export function sansLEnvironnement(html: string): string {
  return html.replace(/<base href="[^"]*">/, '').replace(/<script>window\.__SUPABASE_URL__=[\s\S]*?<\/script>/, '');
}

/** Sert le dist en mémoire sous la base du pré-rendu, avec l'environnement de l'app. */
function servir(dist: ReadonlyMap<string, Buffer>, env: Omit<EnvDeLApp, 'base'>): Promise<{ adresse: string; serveur: Server }> {
  const entree = poserLEnvironnement(dist.get('index.html')?.toString('utf8') ?? '', { ...env, base: BASE_DU_PRE_RENDU });
  const serveur = createServer((q, r) => {
    const chemin = decodeURIComponent((q.url ?? '/').split('?')[0]!).replace(BASE_DU_PRE_RENDU, '').replace(/^\/+/, '');
    const fichier = /\.[a-z0-9]+$/i.test(chemin) ? dist.get(chemin) : undefined;
    if (fichier) { r.writeHead(200, { 'content-type': typeDe(chemin) }); r.end(fichier); return; }
    if (/\.[a-z0-9]+$/i.test(chemin)) { r.writeHead(404); r.end(); return; }
    r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(entree);
  });
  return new Promise((ok) => serveur.listen(0, '127.0.0.1', () => ok({ adresse: `http://127.0.0.1:${(serveur.address() as AddressInfo).port}`, serveur })));
}

/** Le choix des robots d'IA que le build porte (`referencement.json`, émis par le gabarit depuis `src/referencement.json`). */
function lesChoixDesIa(dist: ReadonlyMap<string, Buffer>): { assistants: boolean; entrainement: boolean } | null {
  try {
    const ia = (JSON.parse(dist.get('referencement.json')?.toString('utf8') ?? '{}') as { ia?: Record<string, unknown> }).ia;
    return ia && typeof ia === 'object' ? { assistants: ia.assistants !== false, entrainement: ia.entrainement !== false } : null;
  } catch { return null; }
}

export async function preRendre(navigateur: UnNavigateur, dist: ReadonlyMap<string, Buffer>, o: {
  readonly env: Omit<EnvDeLApp, 'base'>;
  readonly app: { readonly nom: string; readonly description: string; readonly langue: string; readonly autres: readonly string[]; readonly editeur: Editeur | null };
}): Promise<PreRendu> {
  const faits = JSON.parse(dist.get('faits.json')?.toString('utf8') ?? '{"pages":[]}') as Faits;
  const prefixes = ['', ...o.app.autres.map((l) => `/${l}`)];
  const avec = (x: string, c: string) => (x && c === '/' ? x : `${x}${c}`);
  const adresses = prefixes.flatMap((x) => faits.pages.filter((p) => p.acces.nature === 'public' && !p.chemin.includes(':') && p.chemin !== '*').map((p) => avec(x, p.chemin)));
  const routes = prefixes.flatMap((x) => faits.pages.map((p) => p.chemin).filter((c) => c !== '*').map((c) => avec(x, c)));
  const { adresse: site, serveur } = await servir(dist, o.env);
  const gardees: { adresse: string; html: string; titre: string; description: string; texte: string }[] = [];
  const ecartees: { adresse: string; pourquoi: string }[] = [];
  try {
    for (const adresse of adresses) {
      // Mouvement réduit : une page gardée en pleine entrée garderait ses blocs à opacité nulle.
      const page = await navigateur.newPage({ reducedMotion: 'reduce', locale: o.app.langue });
      try {
        await page.route('**/*', (r) => (requetePermise(r.request().url(), site, [o.env.supabaseUrl]) ? r.continue() : r.abort('blockedbyclient')));
        await page.goto(`${site}${BASE_DU_PRE_RENDU}${adresse.slice(1)}`, { waitUntil: 'networkidle', timeout: 20_000 });
        await page.waitForFunction(() => !document.querySelector('[data-etat="patience"]'), null, { timeout: 5_000 }).catch(() => undefined);
        const vu = await page.evaluate((marque: string) => {
          document.documentElement.setAttribute(marque, '');
          const racine = document.getElementById('racine');
          return {
            etat: [...document.querySelectorAll('[data-etat]')].map((e) => e.getAttribute('data-etat')).find((e) => e !== 'vide') ?? null,
            chemin: location.pathname, titre: document.title,
            texte: (racine?.innerText ?? '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim(),
            description: document.querySelector('meta[name="description"]')?.getAttribute('content') ?? '',
          };
        }, MARQUE_DU_PRE_RENDU);
        const arrivee = `/${vu.chemin.slice(BASE_DU_PRE_RENDU.length)}`.replace(/\/+$/, '') || '/';
        const pourquoi = vu.etat ? `it shows « ${vu.etat} »` : arrivee !== (adresse.replace(/\/+$/, '') || '/') ? `it leads to ${arrivee}` : vu.texte === '' ? 'it shows no text' : null;
        if (pourquoi) ecartees.push({ adresse, pourquoi });
        else gardees.push({ adresse, html: sansLEnvironnement(await page.content()), titre: vu.titre, description: vu.description, texte: vu.texte.slice(0, TEXTE_D_UNE_PAGE) });
      } catch (e) {
        ecartees.push({ adresse, pourquoi: `not rendered: ${String((e as Error)?.message ?? e).slice(0, 160)}` });
      } finally {
        await page.close().catch(() => undefined);
      }
    }
  } finally {
    await navigateur.close().catch(() => undefined);
    serveur.close();
  }
  const fichiers = new Map<string, Buffer>(gardees.map((g) => [fichierDuPreRendu(g.adresse), Buffer.from(g.html, 'utf8')]));
  fichiers.set(FICHIER_DE_DECOUVERTE, Buffer.from(`${JSON.stringify({ version: 1, nom: o.app.nom, description: o.app.description, langue: o.app.langue,
    pages: gardees.map((g) => ({ adresse: g.adresse, titre: g.titre, description: g.description, ...(g.texte ? { texte: g.texte } : {}) })),
    routes: [...new Set(routes)], ...(o.app.editeur ? { editeur: o.app.editeur } : {}), ...(lesChoixDesIa(dist) ? { ia: lesChoixDesIa(dist) } : {}) }, null, 2)}\n`, 'utf8'));
  return { fichiers, gardees: gardees.map((g) => g.adresse), ecartees };
}
