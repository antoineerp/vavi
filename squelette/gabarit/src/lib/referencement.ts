/**
 * La tête de chaque page : son titre et sa description, tels que les moteurs de recherche et les liens partagés les
 * lisent. Le propriétaire les choisit dans « Gérer le contenu » (`src/referencement.json`, posé par la plateforme) ;
 * sans choix, le titre de la page suivi du nom de l'app, et la description que la page déclare, sinon celle de l'app.
 */
import referencement from '../referencement.json';
import { APP } from './app';
import { descriptionDe, PAGES, titreDe } from './navigation';

interface Choisi { readonly titre?: string; readonly description?: string }
const REF = referencement as { readonly pages: Readonly<Record<string, Choisi>>; readonly image?: string };

export function laTeteDe(chemin: string): { readonly titre: string; readonly description: string; readonly image: string | null } {
  const choisi = REF.pages[chemin] ?? {};
  const page = PAGES.find((p) => p.chemin === chemin);
  const titre = page ? titreDe(page) : null;
  return {
    titre: choisi.titre || (titre && titre !== APP.nom ? `${titre} · ${APP.nom}` : APP.nom),
    description: choisi.description || (page ? descriptionDe(page) : null) || APP.description,
    image: REF.image ?? null,
  };
}

function meta(attribut: 'name' | 'property', cle: string, valeur: string | null): void {
  let m = document.head.querySelector<HTMLMetaElement>(`meta[${attribut}="${cle}"]`);
  if (valeur === null) { m?.remove(); return; }
  if (!m) { m = document.createElement('meta'); m.setAttribute(attribut, cle); document.head.appendChild(m); }
  m.content = valeur;
}

/** Pose la tête de la page ouverte. */
export function poserLaTete(chemin: string): void {
  const t = laTeteDe(chemin);
  document.title = t.titre;
  meta('name', 'description', t.description);
  meta('property', 'og:title', t.titre);
  meta('property', 'og:description', t.description);
  meta('property', 'og:image', t.image);
}
