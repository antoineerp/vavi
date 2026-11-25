// Repris de constructor-v13@5bb786e : lib/publication/la-decouverte.ts
/**
 * LA DÉCOUVERTE D'UN SITE EN LIGNE — sitemap, robots, llms.txt, adresse canonique, données structurées. PUR.
 *
 * Le pré-rendu (`le-pre-rendu.ts`) pose `decouverte.json` dans le dist : ce que les pages publiques affichent (titre,
 * description, texte), toutes les adresses de l'app, et ce qu'app.json dit de qui publie. L'adresse publique, elle, n'est
 * connue qu'au service : c'est ici, à la requête, que les fichiers de découverte prennent leurs adresses absolues et
 * qu'une page pré-rendue reçoit son adresse canonique. Rien n'est inventé : ce qui manque reste absent.
 */

export const FICHIER_DE_DECOUVERTE = 'decouverte.json';
export const MARQUE_DU_PRE_RENDU = 'data-pre-rendu';
/** Les pages pré-rendues vivent à part du dist : l'entrée `index.html` reste la coquille, que l'aperçu sert. */
export const DOSSIER_DU_PRE_RENDU = '_pre-rendu';
/** Le texte d'une page que `llms-full.txt` reprend, au plus. */
export const TEXTE_D_UNE_PAGE = 8000;
export const FICHIERS_DE_DECOUVERTE: ReadonlySet<string> = new Set(['robots.txt', 'sitemap.xml', 'llms.txt', 'llms-full.txt']);

export interface PageDecouverte { readonly adresse: string; readonly titre: string; readonly description: string; readonly texte?: string }
/** Qui publie le site, tel qu'app.json le déclare (`editeur`) ; rien d'autre. */
export interface Editeur { readonly nom?: string; readonly adresse?: string; readonly telephone?: string; readonly courriel?: string }
export interface Decouverte {
  readonly nom: string; readonly description: string; readonly langue: string;
  readonly pages: readonly PageDecouverte[];
  /** Toutes les adresses de l'app, publiques ou non, à paramètre comprises (`/the/:id`). */
  readonly routes: readonly string[];
  readonly editeur: Editeur | null;
  /** Le choix du propriétaire pour les robots d'IA (« Référencement ») ; `null` : aucun choix, tous entrent. */
  readonly ia?: ChoixDesIa | null;
}
/** Les deux familles de robots d'IA : ceux qui lisent pour répondre en citant le site, ceux qui collectent pour entraîner. */
export interface ChoixDesIa { readonly assistants: boolean; readonly entrainement: boolean }

const ADRESSE = /^\/[^\s?#:*]*$/;
const ROUTE = /^\/[^\s?#*]*$/;
const texte = (v: unknown, max: number): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** Relue strictement : `null` si elle ne se lit pas, et rien n'est servi à sa place. */
export function lireLaDecouverte(brut: string): Decouverte | null {
  let o: unknown;
  try { o = JSON.parse(brut); } catch { return null; }
  if (!o || typeof o !== 'object' || !Array.isArray((o as { pages?: unknown }).pages)) return null;
  const d = o as Record<string, unknown>;
  const pages = (d.pages as unknown[]).flatMap((p) => {
    const x = (p && typeof p === 'object' ? p : {}) as Record<string, unknown>;
    const adresse = texte(x.adresse, 300), lu = texte(x.texte, TEXTE_D_UNE_PAGE);
    return ADRESSE.test(adresse) ? [{ adresse, titre: texte(x.titre, 200), description: texte(x.description, 400), ...(lu ? { texte: lu } : {}) }] : [];
  }).slice(0, 500);
  const routes = Array.isArray(d.routes) ? d.routes.map((r) => texte(r, 300)).filter((r) => ROUTE.test(r)).slice(0, 500) : [];
  const e = (d.editeur && typeof d.editeur === 'object' ? d.editeur : {}) as Record<string, unknown>;
  const editeur = Object.fromEntries((['nom', 'adresse', 'telephone', 'courriel'] as const).map((k) => [k, texte(e[k], 300)]).filter(([, v]) => v)) as Editeur;
  const ia = d.ia && typeof d.ia === 'object' ? d.ia as Record<string, unknown> : null;
  return { nom: texte(d.nom, 200), description: texte(d.description, 400), langue: texte(d.langue, 20), pages, routes, editeur: Object.keys(editeur).length ? editeur : null,
    ia: ia ? { assistants: ia.assistants !== false, entrainement: ia.entrainement !== false } : null };
}

const xml = (t: string): string => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** L'adresse absolue d'une page : `racine` est l'adresse publique du site, sans `/` final. */
export const url = (racine: string, adresse: string): string => `${racine}${adresse === '/' ? '/' : adresse.replace(/\/+$/, '')}`;

/**
 * LES ROBOTS D'IA, NOMMÉS — ceux qui lisent pour RÉPONDRE à quelqu'un (un assistant cite le site, avec son lien) et ceux
 * qui collectent pour ENTRAÎNER un modèle. Le propriétaire décide pour chaque famille (« Référencement ») ; sans décision,
 * tous entrent. Les moteurs de recherche ne sont jamais touchés : `User-agent: *` reste ouvert. Repris de
 * constructor-v13@32d18f3 (`lib/publication/la-decouverte.ts`).
 */
export const ROBOTS_DES_ASSISTANTS = ['OAI-SearchBot', 'ChatGPT-User', 'Claude-SearchBot', 'Claude-User', 'PerplexityBot', 'Perplexity-User', 'DuckAssistBot', 'MistralAI-User'] as const;
export const ROBOTS_D_ENTRAINEMENT = ['GPTBot', 'ClaudeBot', 'anthropic-ai', 'Google-Extended', 'Applebot-Extended', 'CCBot', 'meta-externalagent', 'Bytespider', 'cohere-ai', 'Amazonbot'] as const;

export function robotsTxt(racine: string, ia: ChoixDesIa | null = null): string {
  const famille = (robots: readonly string[], ouvert: boolean) => robots.map((r) => `User-agent: ${r}\n${ouvert ? 'Allow' : 'Disallow'}: /\n`).join('\n');
  return [
    'User-agent: *\nAllow: /\n',
    `# Assistants IA qui répondent en citant le site : ${ia?.assistants === false ? 'refusés' : 'autorisés'}`,
    famille(ROBOTS_DES_ASSISTANTS, ia?.assistants !== false),
    `# Collecte pour entraîner des modèles d’IA : ${ia?.entrainement === false ? 'refusée' : 'autorisée'}`,
    famille(ROBOTS_D_ENTRAINEMENT, ia?.entrainement !== false),
    `Sitemap: ${racine}/sitemap.xml\n`,
  ].join('\n');
}
/** L'aperçu ne se référence jamais : seul le site en ligne est le site. */
export const ROBOTS_DE_L_APERCU = 'User-agent: *\nDisallow: /\n';

export function sitemapXml(racine: string, d: Decouverte): string {
  const lignes = [...new Set(d.pages.map((p) => p.adresse))].map((a) => `  <url><loc>${xml(url(racine, a))}</loc></url>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${lignes.join('\n')}\n</urlset>\n`;
}

const coordonnees = (e: Editeur | null, md: (t: string) => string): string[] => {
  if (!e) return [];
  const l = [...(e.nom ? [`- Nom : ${md(e.nom)}`] : []), ...(e.adresse ? [`- Adresse : ${md(e.adresse)}`] : []),
    ...(e.telephone ? [`- Téléphone : ${md(e.telephone)}`] : []), ...(e.courriel ? [`- Courriel : ${md(e.courriel)}`] : [])];
  return l.length ? ['', '## Coordonnées', '', ...l] : [];
};

/** `llms.txt` (llmstxt.org) : ce qu'un modèle lit pour comprendre le site — son nom, ce qu'il fait, ses pages. */
export function llmsTxt(racine: string, d: Decouverte): string {
  const md = (t: string): string => t.replace(/[\r\n]+/g, ' ').replace(/([[\]])/g, '\\$1');
  return [`# ${md(d.nom || racine)}`, ...(d.description ? ['', `> ${md(d.description)}`] : []), '', '## Pages', '',
    ...d.pages.map((p) => `- [${md(p.titre || p.adresse)}](${url(racine, p.adresse)})${p.description ? `: ${md(p.description)}` : ''}`),
    ...coordonnees(d.editeur, md),
    ...(d.pages.some((p) => p.texte) ? ['', '## Optional', '', `- [Le texte complet des pages](${racine}/llms-full.txt)`] : []), ''].join('\n');
}

/** `llms-full.txt` : le texte que chaque page publique affiche, relevé au pré-rendu, jamais réécrit. */
export function llmsCompletTxt(racine: string, d: Decouverte): string {
  const md = (t: string): string => t.replace(/\r/g, '');
  return [`# ${md(d.nom || racine)}`, ...(d.description ? ['', `> ${md(d.description)}`] : []),
    ...d.pages.flatMap((p) => ['', `## ${md(p.titre || p.adresse)}`, '', `Adresse : ${url(racine, p.adresse)}`,
      ...(p.description ? [`Description : ${md(p.description)}`] : []), ...(p.texte ? ['', md(p.texte)] : [])]),
    ...coordonnees(d.editeur, md), ''].join('\n');
}

/** Le fichier de découverte demandé, rendu ; `null` : ce n'en est pas un. */
export function fichierDeDecouverte(nom: string, racine: string, d: Decouverte): { readonly corps: string; readonly type: string } | null {
  if (nom === 'robots.txt') return { corps: robotsTxt(racine, d.ia ?? null), type: 'text/plain; charset=utf-8' };
  if (nom === 'sitemap.xml') return { corps: sitemapXml(racine, d), type: 'application/xml; charset=utf-8' };
  if (nom === 'llms.txt') return { corps: llmsTxt(racine, d), type: 'text/plain; charset=utf-8' };
  if (nom === 'llms-full.txt') return { corps: llmsCompletTxt(racine, d), type: 'text/plain; charset=utf-8' };
  return null;
}

const entites = (t: string): string => t.replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

/**
 * Une page pré-rendue, servie à SON adresse : son adresse canonique, puis ses données structurées (`WebPage` dans
 * `WebSite`, et qui publie quand app.json le dit), tirées de la page elle-même. Une page qui n'est pas pré-rendue passe telle quelle.
 */
export function laPageServie(html: string, racine: string, adresse: string, d: Decouverte): string {
  if (!html.includes(MARQUE_DU_PRE_RENDU)) return html;
  const i = html.search(/<\/head>/i);
  if (i < 0) return html;
  const u = xml(url(racine, adresse));
  const titre = entites((/<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1] ?? '').trim());
  const description = entites(/<meta[^>]+name="description"[^>]+content="([^"]*)"/i.exec(html)?.[1] ?? '').trim();
  const e = d.editeur;
  const editeur = e?.nom ? { '@type': 'Organization', '@id': `${racine}/#editeur`, name: e.nom, url: `${racine}/`,
    ...(e.telephone ? { telephone: e.telephone } : {}), ...(e.courriel ? { email: e.courriel } : {}), ...(e.adresse ? { address: e.adresse } : {}) } : null;
  const page = { '@type': 'WebPage', name: titre || d.nom, url: url(racine, adresse), ...(description ? { description } : {}), ...(d.langue ? { inLanguage: d.langue } : {}),
    isPartOf: { '@type': 'WebSite', url: `${racine}/`, ...(d.nom ? { name: d.nom } : {}) }, ...(editeur ? { publisher: { '@id': editeur['@id'] } } : {}) };
  const json = JSON.stringify(editeur ? { '@context': 'https://schema.org', '@graph': [page, editeur] } : { '@context': 'https://schema.org', ...page }).replace(/</g, '\\u003c');
  const propre = html.slice(0, i).replace(/<link[^>]+rel=["']canonical["'][^>]*>/gi, '');
  return `${propre}<link rel="canonical" href="${u}"><meta property="og:url" content="${u}"><script type="application/ld+json">${json}</script>${html.slice(i)}`;
}

/** L'adresse demandée est-elle une adresse de l'app (`/the/:id` reconnaît `/the/42`) ? */
export function estUneAdresseDeLApp(chemin: string, routes: readonly string[]): boolean {
  const segments = (c: string): string[] => c.split('/').filter(Boolean);
  const demande = segments(chemin);
  return routes.some((r) => { const m = segments(r); return m.length === demande.length && m.every((x, i) => x.startsWith(':') || x === demande[i]); });
}
