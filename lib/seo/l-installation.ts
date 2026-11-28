/**
 * L'APP SUR L'ÉCRAN D'ACCUEIL — Antoine, 28/11 (étude App Store, voie 2) : une app vavi s'installe depuis le navigateur
 * du téléphone (Safari : Partager → « Sur l'écran d'accueil » ; Chrome : « Installer l'application ») et s'ouvre en plein
 * écran, sans barre d'adresse, avec son nom et son icône.
 *
 * Le gabarit lie `manifest.webmanifest` et `icone-180.png` dans `index.html` (chemins relatifs : le `<base>` posé au
 * service les place sous l'aperçu comme sous le site en ligne). Le pré-rendu AJOUTE ces fichiers au dist, à côté de ceux
 * de Claude, jamais à leur place : le manifeste tiré d'app.json, les icônes dessinées par le navigateur du serveur (une
 * icône d'écran d'accueil doit être un PNG plein, iOS ne lit pas le SVG). Sans navigateur, le manifeste part sans icône,
 * et le téléphone prend une vignette de la page : c'est dit, rien ne casse.
 *
 * Ce qu'il remplace : rien, l'icône d'onglet SVG seule (`iconeDeLOnglet`), qu'un téléphone n'emploie pas.
 */

/** Ce que l'icône montre : l'initiale du nom sur l'accent, ou le logo déposé sur le fond. */
export interface IconeDInstallation {
  readonly initiale: string; readonly accent: string; readonly surAccent: string; readonly fond: string;
  readonly logo?: string | null;
}
export interface Installation {
  readonly nom: string; readonly description: string; readonly langue: string;
  readonly fond: string; readonly theme: string; readonly icone: IconeDInstallation;
}

export const FICHIER_DU_MANIFESTE = 'manifest.webmanifest';
/** 180 : l'écran d'accueil d'iOS (`apple-touch-icon`) ; 192 et 512 : Android et l'installation de Chrome. */
export const TAILLES_DES_ICONES = [180, 192, 512] as const;
export const fichierDeLIcone = (taille: number): string => `icone-${taille}.png`;

/** Le nom sous l'icône : 12 caractères au plus (au-delà, le téléphone le coupe), le premier mot s'il tient. PUR. */
export function leNomCourt(nom: string): string {
  const n = nom.trim().replace(/\s+/g, ' ');
  if ([...n].length <= 12) return n;
  const mot = n.split(' ')[0]!;
  return [...mot].length <= 12 ? mot : [...n].slice(0, 12).join('').trim();
}

const COULEUR = /^#[0-9a-f]{3,8}$/i;

/** Le manifeste, tiré d'app.json ; `icones` : les tailles réellement dessinées. Adresses relatives au manifeste. PUR. */
export function leManifeste(i: Installation, icones: readonly number[]): string {
  const m = {
    name: i.nom.trim().slice(0, 100), short_name: leNomCourt(i.nom), description: i.description.trim().slice(0, 300),
    lang: i.langue, id: './', start_url: './', scope: './', display: 'standalone',
    ...(COULEUR.test(i.fond) ? { background_color: i.fond } : {}), ...(COULEUR.test(i.theme) ? { theme_color: i.theme } : {}),
    icons: [
      ...icones.filter((t) => t !== 180).map((t) => ({ src: fichierDeLIcone(t), sizes: `${t}x${t}`, type: 'image/png', purpose: 'any' })),
      // L'initiale tient dans la zone sûre (80 % du centre) : la même image sert d'icône découpée par Android.
      ...(icones.includes(512) ? [{ src: fichierDeLIcone(512), sizes: '512x512', type: 'image/png', purpose: 'maskable' }] : []),
    ],
  };
  return `${JSON.stringify(m, null, 2)}\n`;
}

const attr = (t: string): string => t.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/** La page que le navigateur photographie : un carré PLEIN (iOS arrondit lui-même ; un coin transparent y devient noir). PUR. */
export function laPageDeLIcone(i: IconeDInstallation, taille: number): string {
  const corps = i.logo
    ? `<div style="width:${taille}px;height:${taille}px;background:${attr(i.fond)};display:grid;place-items:center"><img src="${attr(i.logo)}" alt="" style="max-width:72%;max-height:72%;object-fit:contain"></div>`
    : `<div style="width:${taille}px;height:${taille}px;background:${attr(i.accent)};color:${attr(i.surAccent)};display:grid;place-items:center;`
      + `font:700 ${Math.round(taille * 0.52)}px/1 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif">${attr(i.initiale)}</div>`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0;overflow:hidden}</style></head><body>${corps}</body></html>`;
}

interface PageDeLIcone {
  goto(url: string, o: { waitUntil: 'networkidle'; timeout: number }): Promise<unknown>;
  screenshot(o: { type: 'png'; clip: { x: number; y: number; width: number; height: number } }): Promise<Buffer>;
  close(): Promise<void>;
}
export interface NavigateurDesIcones {
  newPage(o: { reducedMotion: 'reduce'; locale: string; viewport: { width: number; height: number } }): Promise<PageDeLIcone>;
}

/** Les fichiers de l'installation, à ajouter au dist : les icônes dessinées, puis le manifeste qui les nomme. */
export async function lesFichiersDeLInstallation(navigateur: NavigateurDesIcones | null, i: Installation):
  Promise<{ readonly fichiers: ReadonlyMap<string, Buffer>; readonly manquees: readonly string[] }> {
  const fichiers = new Map<string, Buffer>();
  const manquees: string[] = [];
  for (const t of navigateur ? TAILLES_DES_ICONES : []) {
    const page = await navigateur!.newPage({ reducedMotion: 'reduce', locale: i.langue, viewport: { width: t, height: t } });
    try {
      await page.goto(`data:text/html;charset=utf-8,${encodeURIComponent(laPageDeLIcone(i.icone, t))}`, { waitUntil: 'networkidle', timeout: 10_000 });
      fichiers.set(fichierDeLIcone(t), await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: t, height: t } }));
    } catch (e) {
      manquees.push(`${fichierDeLIcone(t)}: ${String((e as Error)?.message ?? e).split('\n')[0]!.slice(0, 160)}`);
    } finally {
      await page.close().catch(() => undefined);
    }
  }
  fichiers.set(FICHIER_DU_MANIFESTE, Buffer.from(leManifeste(i, TAILLES_DES_ICONES.filter((t) => fichiers.has(fichierDeLIcone(t)))), 'utf8'));
  return { fichiers, manquees };
}
