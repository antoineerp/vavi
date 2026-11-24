/**
 * LES MESURES À L'ÉCRAN — ce qu'une page publique montre vraiment, mesuré dans le navigateur du pré-rendu, au bureau
 * puis au téléphone. Elles ferment le défaut « rendu visuel approximatif » des agents de code (cahier « Garde-fous de
 * Claude dans vavi », 24/11) sans image : une capture coûte environ 1 500 jetons, une mesure une ligne de texte.
 *
 * Ce sont des avertissements rendus à Claude au build (`screen_checks`), jamais un refus : un écart visuel n'empêche pas
 * l'app de s'ouvrir. Repris dans l'esprit de constructor-v13@5bb786e : generateur-v2/controles/le-chrome-mesure.ts.
 *
 * `mesurerLaPage` s'exécute DANS le navigateur (sérialisée par Playwright) : elle ne touche à rien hors du DOM.
 */

export const LARGEURS = [{ nom: 'desktop', largeur: 1280, hauteur: 800 }, { nom: 'phone', largeur: 390, hauteur: 844 }] as const;

export interface EcartALEcran { readonly sorte: 'overflow' | 'clipped_text' | 'low_contrast'; readonly ou: string; readonly fait: string }

/** Mesure la page affichée. Exécutée dans le navigateur : aucune variable extérieure, aucun import. */
export function mesurerLaPage(): EcartALEcran[] {
  const ecarts: EcartALEcran[] = [];
  const largeur = window.innerWidth;
  const nom = (e: Element): string => {
    const t = ((e as HTMLElement).innerText ?? '').trim().replace(/\s+/g, ' ').slice(0, 40);
    return `<${e.tagName.toLowerCase()}>${t ? ` « ${t} »` : ''}`;
  };
  const visibles = [...document.body.querySelectorAll('*')].filter((e) => {
    const r = e.getBoundingClientRect();
    const s = getComputedStyle(e);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
  });
  // Débordement : la page défile de côté. On nomme les éléments les plus profonds qui dépassent.
  if (document.documentElement.scrollWidth > largeur + 1) {
    const dehors = visibles.filter((e) => e.getBoundingClientRect().right > largeur + 1 && ![...e.children].some((f) => f.getBoundingClientRect().right > largeur + 1));
    for (const e of dehors.slice(0, 3)) ecarts.push({ sorte: 'overflow', ou: nom(e), fait: `goes ${Math.round(e.getBoundingClientRect().right - largeur)}px past the ${largeur}px screen` });
  }
  // Texte coupé : un élément qui cache ce qu'il contient, sans points de suspension voulus.
  for (const e of visibles) {
    const s = getComputedStyle(e);
    const cache = /hidden|clip/.test(s.overflowX + s.overflowY);
    const voulu = s.textOverflow === 'ellipsis' || Number(s.webkitLineClamp) > 0;
    if (cache && !voulu && (e as HTMLElement).innerText?.trim() && (e.scrollWidth > e.clientWidth + 2 || e.scrollHeight > e.clientHeight + 2)) {
      ecarts.push({ sorte: 'clipped_text', ou: nom(e), fait: 'its text is cut off' });
      if (ecarts.filter((x) => x.sorte === 'clipped_text').length >= 3) break;
    }
  }
  // Contraste : le texte direct d'un élément contre le premier fond plein au-dessus de lui (un fond en image n'est pas jugé).
  const rgb = (c: string): number[] | null => { const m = c.match(/[\d.]+/g); return m ? m.map(Number) : null; };
  const lum = (c: number[]): number => {
    const [r, g, b] = c.slice(0, 3).map((v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  };
  for (const e of visibles) {
    if (![...e.childNodes].some((n) => n.nodeType === 3 && n.textContent?.trim())) continue;
    let f: Element | null = e;
    let fond: number[] | null = null;
    while (f) {
      const s = getComputedStyle(f);
      if (s.backgroundImage !== 'none') { fond = null; break; }
      const c = rgb(s.backgroundColor);
      if (c && (c[3] ?? 1) > 0.95) { fond = c; break; }
      f = f.parentElement;
    }
    if (!f) fond = [255, 255, 255];
    const texte = rgb(getComputedStyle(e).color);
    if (!fond || !texte || (texte[3] ?? 1) < 0.95) continue;
    const [a, b] = [lum(texte), lum(fond)].sort((x, y) => y - x);
    const ratio = (a! + 0.05) / (b! + 0.05);
    const s = getComputedStyle(e);
    const grand = parseFloat(s.fontSize) >= 24 || (parseFloat(s.fontSize) >= 18.66 && Number(s.fontWeight) >= 700);
    if (ratio < (grand ? 3 : 4.5)) {
      ecarts.push({ sorte: 'low_contrast', ou: nom(e), fait: `contrast ${ratio.toFixed(1)}:1, needs ${grand ? 3 : 4.5}:1` });
      if (ecarts.filter((x) => x.sorte === 'low_contrast').length >= 3) break;
    }
  }
  return ecarts;
}

/** Les lignes rendues à Claude : bornées, une par écart. PURE. */
export function lesLignesDesMesures(mesures: readonly { readonly adresse: string; readonly ecran: string; readonly ecarts: readonly EcartALEcran[] }[], max = 10): string[] {
  const lignes = mesures.flatMap((m) => m.ecarts.map((e) => `${m.adresse} (${m.ecran}) ${e.sorte}: ${e.ou} ${e.fait}`));
  return lignes.length > max ? [...lignes.slice(0, max), `…and ${lignes.length - max} more`] : lignes;
}
