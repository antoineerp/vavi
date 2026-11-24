/**
 * Ce qu'un jeu demande au navigateur, sans compte ni serveur : une boucle d'animation qui s'arrête quand l'onglet est
 * caché, les commandes du clavier et du toucher sous les mêmes noms, et le meilleur score gardé sur l'appareil.
 */
import { useEffect, useRef, useState } from 'react';
import { cleDeLApp } from './env';

/** Appelle `pas(dt)` à chaque image, `dt` en secondes (borné : un onglet revenu ne fait pas sauter la partie). */
export function useBoucleDeJeu(pas: (dt: number) => void, active = true): void {
  const rappel = useRef(pas);
  rappel.current = pas;
  useEffect(() => {
    if (!active) return;
    let image = 0;
    let avant = performance.now();
    const tourner = (maintenant: number) => {
      const dt = Math.min(0.05, (maintenant - avant) / 1000);
      avant = maintenant;
      if (!document.hidden) rappel.current(dt);
      image = requestAnimationFrame(tourner);
    };
    image = requestAnimationFrame(tourner);
    return () => cancelAnimationFrame(image);
  }, [active]);
}

export type Commande = 'haut' | 'bas' | 'gauche' | 'droite' | 'action';
const TOUCHES: Readonly<Record<string, Commande>> = {
  ArrowUp: 'haut', KeyW: 'haut', KeyZ: 'haut', ArrowDown: 'bas', KeyS: 'bas', ArrowLeft: 'gauche', KeyA: 'gauche', KeyQ: 'gauche',
  ArrowRight: 'droite', KeyD: 'droite', Space: 'action', Enter: 'action',
};

/**
 * Les commandes tenues en ce moment. Le clavier les tient seul ; au toucher, `appuyer` et `relacher` les tiennent depuis
 * les boutons que la page affiche, sous les mêmes noms.
 */
export function useCommandes(): { readonly tenues: ReadonlySet<Commande>; appuyer(c: Commande): void; relacher(c: Commande): void } {
  const tenues = useRef(new Set<Commande>());
  useEffect(() => {
    const bas = (e: KeyboardEvent) => { const c = TOUCHES[e.code]; if (c) { tenues.current.add(c); e.preventDefault(); } };
    const haut = (e: KeyboardEvent) => { const c = TOUCHES[e.code]; if (c) tenues.current.delete(c); };
    const vider = () => tenues.current.clear();
    window.addEventListener('keydown', bas);
    window.addEventListener('keyup', haut);
    window.addEventListener('blur', vider);
    return () => { window.removeEventListener('keydown', bas); window.removeEventListener('keyup', haut); window.removeEventListener('blur', vider); };
  }, []);
  return { tenues: tenues.current, appuyer: (c) => tenues.current.add(c), relacher: (c) => tenues.current.delete(c) };
}

/** Le meilleur score de ce jeu sur cet appareil. Un navigateur qui refuse le stockage garde le score pour la partie. */
export function useMeilleurScore(jeu: string): { readonly meilleur: number; proposer(score: number): boolean } {
  const cle = cleDeLApp(`meilleur-score:${jeu}`);
  const [meilleur, setMeilleur] = useState(() => {
    try { return Number(window.localStorage.getItem(cle)) || 0; } catch { return 0; }
  });
  return {
    meilleur,
    proposer(score) {
      if (score <= meilleur) return false;
      setMeilleur(score);
      try { window.localStorage.setItem(cle, String(score)); } catch { /* stockage refusé : le score vaut pour la partie */ }
      return true;
    },
  };
}
