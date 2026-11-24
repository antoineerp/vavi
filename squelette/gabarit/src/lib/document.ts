/**
 * Le document que l'app compose en PDF : une couverture (le nom de l'app, le titre, ses faits, la date), puis ses sections,
 * aux couleurs et aux polices de la direction de l'app, lues dans ses jetons au moment de l'appel. La page n'écrit que le
 * contenu de chaque section, par le gabarit `html` qui échappe chaque valeur ; la mise en page est celle-ci, pour toute app.
 *
 * Ce qu'il remplace (interdit 9) : `pdf.generer({ html })`, où chaque page écrivait son document entier, en police du
 * système, sans couverture ni mise en page (05/11 : un rapport rendu comme une page web brute).
 */
import { APP } from './app';
import { langueCourante } from './langue';
import { html, type HtmlSur } from './html';

export interface SectionDuDocument { readonly titre: string; readonly corps: HtmlSur }

export interface DocumentDeLApp {
  readonly titre: string;
  readonly sousTitre?: string;
  /** Les faits de la couverture, chacun `[libellé, valeur]`. */
  readonly faits?: ReadonlyArray<readonly [string, string]>;
  readonly sections: readonly SectionDuDocument[];
  /** Le nom du fichier rendu. */
  readonly nom?: string;
  readonly paysage?: boolean;
}

const JETONS = ['--fond', '--sur-fond', '--sur-fond-attenue', '--surface', '--bordure', '--accent', '--sur-accent', '--accent-texte', '--police-titre', '--police-texte'];

/** Les jetons de l'app et les polices qu'ils nomment, lus dans la page ouverte : le document porte la même peau. */
function laPeau(): string {
  const style = getComputedStyle(document.documentElement);
  const jetons = JETONS.map((j) => `${j}: ${style.getPropertyValue(j).trim() || 'initial'};`).join(' ');
  const familles = [style.getPropertyValue('--police-titre'), style.getPropertyValue('--police-texte')].join(',');
  const polices: string[] = [];
  for (const feuille of [...document.styleSheets]) {
    let regles: CSSRuleList | null = null;
    try { regles = feuille.cssRules; } catch { continue; }
    for (const r of [...regles]) {
      if (!(r instanceof CSSFontFaceRule)) continue;
      const famille = r.style.getPropertyValue('font-family').replace(/["']/g, '').trim();
      if (!famille || !familles.includes(famille)) continue;
      // Une adresse relative ne se lit pas hors de l'app : elle devient absolue.
      polices.push(r.cssText.replace(/url\((["']?)([^"')]+)\1\)/g, (_m, _q, u: string) => `url("${new URL(u, feuille.href ?? location.href).href}")`));
    }
  }
  return `${polices.join('\n')}\n:root { ${jetons} }`;
}

const MISE_EN_PAGE = `
@page { size: A4; margin: 18mm 16mm 20mm; }
body { margin: 0; color: var(--sur-fond); background: #fff; font: 10.5pt/1.55 var(--police-texte), system-ui, sans-serif; }
h1, h2, h3 { font-family: var(--police-titre), var(--police-texte), serif; color: var(--sur-fond); line-height: 1.2; margin: 0 0 .5em; }
.couverture { min-height: 240mm; display: flex; flex-direction: column; justify-content: space-between; break-after: page; }
.couverture .marque { font-family: var(--police-titre), serif; font-weight: 700; color: var(--accent-texte); letter-spacing: .02em; }
.couverture h1 { font-size: 28pt; margin-top: 50mm; }
.couverture .sous-titre { font-size: 13pt; color: var(--sur-fond-attenue); }
.couverture dl { display: grid; grid-template-columns: 45mm 1fr; gap: 3mm 6mm; border-top: 2px solid var(--accent); padding-top: 6mm; }
.couverture dt { color: var(--sur-fond-attenue); } .couverture dd { margin: 0; }
section { break-inside: auto; margin-bottom: 9mm; }
section > h2 { font-size: 15pt; padding-bottom: 2mm; border-bottom: 1px solid var(--bordure); }
table { width: 100%; border-collapse: collapse; font-size: 9.5pt; }
th { text-align: left; font-weight: 600; border-bottom: 1.5px solid var(--sur-fond); padding: 2mm; }
td { border-bottom: 1px solid var(--bordure); padding: 2mm; vertical-align: top; }
tr { break-inside: avoid; }
.pied { margin-top: 10mm; font-size: 8.5pt; color: var(--sur-fond-attenue); border-top: 1px solid var(--bordure); padding-top: 3mm; }`;

/** Le document entier, prêt à rendre : chaque valeur passe par `html`, qui l'échappe. */
export function leDocument(d: DocumentDeLApp): string {
  const langue = langueCourante();
  const date = new Intl.DateTimeFormat(langue, { dateStyle: 'long' }).format(new Date());
  const corps = html`<div class="couverture">
    <div><p class="marque">${APP.nom}</p><h1>${d.titre}</h1>${d.sousTitre ? html`<p class="sous-titre">${d.sousTitre}</p>` : ''}<p class="sous-titre">${date}</p></div>
    ${d.faits?.length ? html`<dl>${d.faits.map(([l, v]) => html`<dt>${l}</dt><dd>${v}</dd>`)}</dl>` : ''}
  </div>
  ${d.sections.map((s) => html`<section><h2>${s.titre}</h2>${s.corps}</section>`)}
  <p class="pied">${APP.nom} · ${d.titre} · ${date}</p>`;
  return `<!doctype html><html lang="${langue}"><head><meta charset="utf-8"><title>${html`${d.titre}`.__html}</title>`
    + `<style>${laPeau()}${MISE_EN_PAGE}</style></head><body>${corps.__html}</body></html>`;
}
