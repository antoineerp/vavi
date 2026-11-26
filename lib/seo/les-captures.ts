/**
 * LES CAPTURES D'UN BUILD VERT — Claude voit ce qu'il a fait (Antoine, 25/11 : « comme Lovable », deuxième des trois).
 *
 * Après un build vert, la page d'accueil du dist est ouverte dans le navigateur du serveur, sur un écran d'ordinateur
 * puis de téléphone, et photographiée (JPEG). Les images reviennent à Claude dans la réponse de l'outil : il juge lui-même
 * ce qui se voit (une section vide, un texte illisible, un menu qui déborde) et corrige au tour. Rien n'est jugé ni
 * refusé ici : c'est une vue, et une mesure de ce que l'accueil affiche (`MesureDeLAccueil`).
 *
 * Même garde que le pré-rendu : le bac à sable de Chromium, le site servi en mémoire, la base de l'app ; et, pour que
 * la page soit vue comme la personne la verra, les IMAGES seules des hôtes de photos permis (la banque, la console).
 */
import type { EnvDeLApp } from '@/lib/publication/servir';
import { BASE_DU_PRE_RENDU, requetePermise, servir } from './le-pre-rendu';
import { RELEVER_LA_PAGE, type ReleveDeLaPage } from './le-releve-de-la-page';

export const ECRANS = { bureau: { width: 1280, height: 800 }, telephone: { width: 390, height: 844 } } as const;
export type Ecran = keyof typeof ECRANS;

interface RequeteVue { request(): { url(): string; resourceType(): string }; continue(): Promise<void>; abort(code?: string): Promise<void> }
interface PageAPhotographier {
  route(motif: string, h: (r: RequeteVue) => unknown): Promise<unknown>;
  goto(url: string, o: { waitUntil: 'networkidle'; timeout: number }): Promise<unknown>;
  waitForFunction(f: () => boolean, a: null, o: { timeout: number }): Promise<unknown>;
  screenshot(o: { type: 'jpeg'; quality: number }): Promise<Buffer>;
  evaluate(expression: string): Promise<unknown>;
  close(): Promise<void>;
}
export interface NavigateurAPhotographier {
  newPage(o: { viewport: { width: number; height: number }; locale: string; reducedMotion: 'reduce' }): Promise<PageAPhotographier>;
  close(): Promise<void>;
}

export interface Capture { readonly ecran: Ecran; readonly jpeg: Buffer }

/** Ce que l'accueil affiche, compté dans la page rendue sur l'écran d'ordinateur (choix d'Antoine du 26/11 : la mesure de
 * l'accueil). Des faits, pas un avis : `lib/design/le-guide` les compare au guide. */
export interface MesureDeLAccueil {
  /** Les sections de premier niveau (`<section>` hors d'une autre ; sans aucune, les enfants de `<main>`). */
  readonly sections: number;
  /** Les images affichées en grand (au moins 120 px de large), chargées ou en attente. */
  readonly photos: number;
  /** Les images dont le chargement a échoué. */
  readonly photosCassees: number;
  readonly titres: number;
}

/** Exécuté DANS la page, envoyé en texte : une fonction compilée porterait des aides du compilateur (`__name`) que la
 * page n'a pas (essai sur un vrai Chromium, 26/11). */
const MESURER_DANS_LA_PAGE = `(() => {
  const dehors = (e) => !e.closest('header, footer, nav');
  const toutes = [...document.querySelectorAll('section')].filter((e) => dehors(e) && !(e.parentElement && e.parentElement.closest('section')));
  const main = document.querySelector('main');
  const sections = toutes.length || (main ? [...main.children].filter(dehors).length : 0);
  const images = [...document.querySelectorAll('img')];
  return {
    sections,
    photos: images.filter((i) => i.getBoundingClientRect().width >= 120).length,
    photosCassees: images.filter((i) => i.complete && i.naturalWidth === 0 && Boolean(i.getAttribute('src'))).length,
    titres: document.querySelectorAll('h1').length,
  };
})()`;

/** Une requête que la page photographiée peut faire : celles du pré-rendu, plus une image d'un hôte de photos. PURE. */
export const requeteDeLaCapture = (url: string, sorte: string, site: string, hotes: readonly string[], hotesDesImages: readonly string[]): boolean =>
  requetePermise(url, site, hotes) || (sorte === 'image' && requetePermise(url, site, hotesDesImages));

export async function capturer(navigateur: NavigateurAPhotographier, dist: ReadonlyMap<string, Buffer>, o: {
  readonly env: Omit<EnvDeLApp, 'base'>; readonly langue: string; readonly hotesDesImages: readonly string[];
}): Promise<{ readonly captures: readonly Capture[]; readonly manquees: readonly string[]; readonly mesure?: MesureDeLAccueil; readonly releve?: ReleveDeLaPage }> {
  const { adresse: site, serveur } = await servir(dist, o.env);
  const captures: Capture[] = [];
  const manquees: string[] = [];
  let mesure: MesureDeLAccueil | undefined;
  let releve: ReleveDeLaPage | undefined;
  try {
    for (const ecran of Object.keys(ECRANS) as Ecran[]) {
      const page = await navigateur.newPage({ viewport: ECRANS[ecran], locale: o.langue, reducedMotion: 'reduce' });
      try {
        await page.route('**/*', (r) => (requeteDeLaCapture(r.request().url(), r.request().resourceType(), site, [o.env.supabaseUrl], o.hotesDesImages)
          ? r.continue() : r.abort('blockedbyclient')));
        await page.goto(`${site}${BASE_DU_PRE_RENDU}`, { waitUntil: 'networkidle', timeout: 15_000 });
        await page.waitForFunction(() => !document.querySelector('[data-etat="patience"]'), null, { timeout: 4_000 }).catch(() => undefined);
        captures.push({ ecran, jpeg: await page.screenshot({ type: 'jpeg', quality: 60 }) });
        if (ecran === 'bureau') {
          mesure = await page.evaluate(MESURER_DANS_LA_PAGE).then((m) => m as MesureDeLAccueil, () => undefined);
          // Les formes qui trahissent un site généré (26/11), sur l'écran où elles se voient : une rangée s'empile au téléphone.
          releve = await page.evaluate(RELEVER_LA_PAGE).then((r) => r as ReleveDeLaPage, () => undefined);
        }
      } catch (e) {
        manquees.push(`${ecran}: ${String((e as Error)?.message ?? e).split('\n')[0]!.slice(0, 160)}`);
      } finally {
        await page.close().catch(() => undefined);
      }
    }
  } finally {
    await navigateur.close().catch(() => undefined);
    serveur.close();
  }
  return { captures, manquees, ...(mesure ? { mesure } : {}), ...(releve ? { releve } : {}) };
}
