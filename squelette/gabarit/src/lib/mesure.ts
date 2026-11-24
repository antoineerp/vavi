/**
 * La mesure d'audience : chaque adresse PUBLIQUE atteinte est une visite, envoyée au collecteur de la plateforme
 * (`/api/audience/<projet>`), sans cookie ni adresse IP. Posée par la coquille, jamais demandée à l'agent.
 *
 * Ce qu'elle remplace : rien n'envoyait les visites d'une app de la voie D ; le collecteur les attendait et
 * l'écran d'audience du propriétaire restait à zéro sans le dire. Même règle que la voie C (`squelette/mesure-d-audience`) :
 * ne comptent pas l'automate (`navigator.webdriver`), la page pré-rendue, l'app dans un cadre (l'atelier), l'APERÇU
 * (`?apercu` à l'arrivée, gardé pour toute la visite) ni la même adresse revue dans les 30 secondes. De la chaîne de
 * requête, seuls les `utm_*` sortent. Le corps part en `text/plain` : un autre type déclencherait un préflight que le
 * navigateur refuse face au joker CORS du collecteur.
 */
import { useEffect } from 'react';
import { matchPath, useLocation } from 'react-router';
import { PAGES } from './navigation';

const MEME_PAGE_MS = 30_000;
const envoyees = new Map<string, number>();
const enApercu = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('apercu');

function campagneSeule(recherche: string): string {
  const gardes = new URLSearchParams();
  new URLSearchParams(recherche).forEach((valeur, cle) => { if (cle.startsWith('utm_')) gardes.append(cle, valeur); });
  const rendu = gardes.toString();
  return rendu ? `?${rendu}` : '';
}

function envoyer(chemin: string, recherche: string): void {
  try {
    const api = window.__CONSTRUCTOR_API_URL__ ?? '';
    const projet = window.__PROJECT_ID__ ?? '';
    if (!api || !projet || enApercu || navigator.webdriver || window.parent !== window) return;
    if ((document.visibilityState as string) === 'prerender') return;
    const maintenant = Date.now();
    const avant = envoyees.get(chemin);
    if (avant !== undefined && maintenant - avant < MEME_PAGE_MS) return;
    envoyees.set(chemin, maintenant);
    const corps = JSON.stringify({ chemin, utm: campagneSeule(recherche), referent: document.referrer || '', hote: location.hostname || '' });
    const url = `${api}/api/audience/${encodeURIComponent(projet)}`;
    const type = 'text/plain;charset=UTF-8';
    if (navigator.sendBeacon) navigator.sendBeacon(url, new Blob([corps], { type }));
    else void fetch(url, { method: 'POST', keepalive: true, headers: { 'Content-Type': type }, body: corps }).catch(() => undefined);
  } catch {
    // Une mesure qui abîme la page qu'elle mesure ne vaut pas le chiffre qu'elle rend.
  }
}

/** La page d'où part une demande ou un paiement, pour que la plateforme le relie à la visite (jamais la requête). */
export const pageCourante = (): string => (typeof window === 'undefined' ? '' : window.location.pathname);

/** Un écran derrière un compte (une fiche `/:id` comprise) est de l'usage, pas de l'audience. */
const derriereUnCompte = (chemin: string): boolean =>
  PAGES.some((p) => p.acces.nature !== 'public' && matchPath(p.chemin, chemin) !== null);

/** Monté une fois par la coquille, dans le routeur : chaque adresse publique atteinte est une visite. */
export function useMesureDAudience(): void {
  const { pathname, search } = useLocation();
  useEffect(() => { if (!derriereUnCompte(pathname)) envoyer(pathname, search); }, [pathname, search]);
}
