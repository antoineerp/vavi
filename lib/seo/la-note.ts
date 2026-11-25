/**
 * LA NOTE DE RÉFÉRENCEMENT D'UNE PAGE — ce qu'un moteur de recherche ou un assistant IA trouve en la lisant, pesé critère
 * par critère, sur ce que le pré-rendu a relevé (`decouverte.json`) : jamais sur ce que la page « devrait » dire. PUR.
 *
 * Remplace, pour vavi, l'analyse de `components/dashboard/SEOManager.tsx` de constructor-v13 (demande d'Antoine du 25/11 :
 * « les sites générés immédiatement optimisés pour le SEO/GEO, et l'utilisateur suit ses statistiques »). Ce que vavi fait
 * de lui-même (pré-rendu, sitemap, robots, llms.txt, adresse canonique, données structurées) n'est pas noté : c'est servi.
 */
import type { Decouverte, PageDecouverte } from './la-decouverte';

/** Les bornes que Google affiche sans couper (titre) et qu'il reprend telles quelles (description). */
export const TITRE = { min: 20, max: 60 } as const;
export const DESCRIPTION = { min: 70, max: 160 } as const;
/** Assez de texte lisible sans JavaScript pour qu'un moteur ou une IA sache de quoi parle la page. */
export const TEXTE_MIN = 250;
/** La balise de vérification Google Search Console : le seul contenu accepté de `content`. */
export const JETON_GOOGLE = /^[A-Za-z0-9_-]{10,100}$/;

export type Critere = 'titre' | 'titre_unique' | 'description' | 'texte' | 'image' | 'editeur';
export interface Point { readonly critere: Critere; readonly ok: boolean; readonly mesure?: number }
export interface NoteDUnePage { readonly adresse: string; readonly titre: string; readonly note: number; readonly points: readonly Point[] }

const longueur = (t: string): number => [...t.trim()].length;

/** La note de chaque page publique, sur 100, dans l'ordre de la découverte. `image` : une image de partage est posée. */
export function lesNotes(d: Decouverte, o: { readonly image: boolean }): readonly NoteDUnePage[] {
  const titres = new Map<string, number>();
  for (const p of d.pages) titres.set(p.titre.trim().toLowerCase(), (titres.get(p.titre.trim().toLowerCase()) ?? 0) + 1);
  return d.pages.map((p: PageDecouverte) => {
    const t = longueur(p.titre), de = longueur(p.description), tx = longueur(p.texte ?? '');
    const points: Point[] = [
      { critere: 'titre', ok: t >= TITRE.min && t <= TITRE.max, mesure: t },
      { critere: 'titre_unique', ok: t > 0 && titres.get(p.titre.trim().toLowerCase()) === 1 },
      { critere: 'description', ok: de >= DESCRIPTION.min && de <= DESCRIPTION.max, mesure: de },
      { critere: 'texte', ok: tx >= TEXTE_MIN, mesure: tx },
      { critere: 'image', ok: o.image },
      { critere: 'editeur', ok: Boolean(d.editeur?.nom) },
    ];
    return { adresse: p.adresse, titre: p.titre, note: Math.round((100 * points.filter((x) => x.ok).length) / points.length), points };
  });
}

/** La moyenne du site ; `null` sans page publique (jamais 0). */
export const laNoteDuSite = (notes: readonly NoteDUnePage[]): number | null =>
  notes.length === 0 ? null : Math.round(notes.reduce((s, n) => s + n.note, 0) / notes.length);

/**
 * Ce que la personne colle depuis Google Search Console, relu : la balise entière (`<meta name="google-site-verification"
 * content="…">`) ou son seul contenu. `null` : vide (retirer) ; `false` : ce n'est pas un jeton de vérification.
 */
export function leJetonGoogle(colle: string): string | null | false {
  const t = colle.trim();
  if (!t) return null;
  const jeton = /content\s*=\s*["']([^"']*)["']/i.exec(t)?.[1]?.trim() ?? t;
  return JETON_GOOGLE.test(jeton) ? jeton : false;
}

/** Une page servie avec la balise de vérification Google, avant `</head>` ; un jeton mal formé n'est jamais posé. */
export function avecLaVerificationGoogle(html: string, jeton: string | null): string {
  if (!jeton || !JETON_GOOGLE.test(jeton)) return html;
  const i = html.search(/<\/head>/i);
  return i < 0 ? html : `${html.slice(0, i)}<meta name="google-site-verification" content="${jeton}">${html.slice(i)}`;
}
