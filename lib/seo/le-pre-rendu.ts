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
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { poserLEnvironnement, type EnvDeLApp } from '@/lib/publication/servir';
import { typeDe } from '@/lib/publication/publier';
import { DOSSIER_DU_PRE_RENDU, FICHIER_DE_DECOUVERTE, MARQUE_DU_PRE_RENDU, TEXTE_D_UNE_PAGE, type Editeur } from './la-decouverte';

export const BASE_DU_PRE_RENDU = '/__vavi_base__/';

interface PageDuNavigateur {
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

/** Chromium sur ce serveur, par Playwright ; `null` si l'un ou l'autre manque (le pré-rendu est alors sauté, et c'est dit). */
export async function leNavigateurDuServeur(env: Readonly<Record<string, string | undefined>> = process.env): Promise<UnNavigateur | null> {
  try {
    // Le nom passe par une variable : le paquet du serveur se charge à l'exécution, jamais empaqueté par le build de vavi.
    const paquet = env.VAVI_PLAYWRIGHT ?? 'playwright';
    const { chromium } = createRequire(join(process.cwd(), 'package.json'))(paquet) as { chromium: { launch(o: object): Promise<UnNavigateur> } };
    const chemin = env.VAVI_CHROMIUM ?? (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
    return await chromium.launch({ ...(chemin ? { executablePath: chemin } : {}), args: ['--no-sandbox'] });
  } catch {
    return null;
  }
}

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
    routes: [...new Set(routes)], ...(o.app.editeur ? { editeur: o.app.editeur } : {}) }, null, 2)}\n`, 'utf8'));
  return { fichiers, gardees: gardees.map((g) => g.adresse), ecartees };
}
