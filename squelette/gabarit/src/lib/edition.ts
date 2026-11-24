/**
 * L'édition dans l'aperçu : l'app désigne, la plateforme écrit. Quand la plateforme l'encadre et le demande, l'app
 * souligne ce qui se survole et dit ce qui a été cliqué : une photo par son nom (`data-image`), ou le texte vu et, quand
 * le build l'a posé, où il vit dans le code (`data-texte`). Elle n'écoute que l'origine de la plateforme, et seulement dans un cadre ; ailleurs, rien ne se passe.
 */
type Cible = { readonly el: HTMLElement; readonly image?: string; readonly texte?: string; readonly source?: string };

function origineDeLaPlateforme(): string | null {
  try {
    // La console de vavi, à son origine (l'app est servie à son propre hôte) ; sinon la plateforme qui sert l'app.
    const laConsole = window.__VAVI_CONSOLE__;
    if (laConsole) return new URL(laConsole).origin;
    const url = window.__CONSTRUCTOR_API_URL__;
    return url ? new URL(url).origin : window.location.origin;
  } catch {
    return null;
  }
}

/** Une photo de l'app (`data-image`), sinon l'élément le plus proche du clic qui porte un texte à lui. */
function cibleDe(depart: EventTarget | null): Cible | null {
  const image = depart instanceof Element ? depart.closest('[data-image]') : null;
  if (image instanceof HTMLElement && image.dataset.image) return { el: image, image: image.dataset.image };
  let n: HTMLElement | null = depart instanceof HTMLElement ? depart : depart instanceof Element ? depart.parentElement : null;
  while (n && n !== document.body) {
    const aDuTexte = Array.from(n.childNodes).some((c) => c.nodeType === Node.TEXT_NODE && (c.textContent ?? '').trim().length > 0);
    if (aDuTexte) return { el: n, texte: (n.innerText || n.textContent || '').trim().slice(0, 5000), ...(n.dataset.texte ? { source: n.dataset.texte } : {}) };
    n = n.parentElement;
  }
  return null;
}

export function ecouterLEdition(): void {
  if (typeof window === 'undefined' || window.parent === window) return;
  const origine = origineDeLaPlateforme();
  if (origine === null) return;
  let actif = false;
  let survole: HTMLElement | null = null;
  const style = document.createElement('style');
  style.textContent = '[data-edition-survol]{outline:2px dashed currentColor !important;outline-offset:3px !important;cursor:pointer !important}';
  const dire = (message: Record<string, unknown>) => window.parent.postMessage(message, origine);
  const survoler = (e: MouseEvent) => {
    const c = cibleDe(e.target);
    if (survole && survole !== c?.el) survole.removeAttribute('data-edition-survol');
    survole = c?.el ?? null;
    survole?.setAttribute('data-edition-survol', '');
  };
  const cliquer = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const c = cibleDe(e.target);
    if (c) dire({ type: 'EDITION_CIBLE', ...(c.image ? { image: c.image } : { texte: c.texte ?? '', ...(c.source ? { source: c.source } : {}) }) });
  };
  window.addEventListener('message', (e) => {
    if (e.origin !== origine || e.source !== window.parent) return;
    const d = e.data as { type?: unknown; actif?: unknown } | null;
    if (!d || d.type !== 'EDITION_VISUELLE') return;
    if (d.actif === true && !actif) {
      actif = true;
      document.head.appendChild(style);
      document.addEventListener('mouseover', survoler, true);
      document.addEventListener('click', cliquer, true);
    } else if (d.actif !== true && actif) {
      actif = false;
      style.remove();
      survole?.removeAttribute('data-edition-survol');
      survole = null;
      document.removeEventListener('mouseover', survoler, true);
      document.removeEventListener('click', cliquer, true);
    }
    dire({ type: 'EDITION_PRETE', actif });
  });
  dire({ type: 'EDITION_DISPONIBLE' });
}
