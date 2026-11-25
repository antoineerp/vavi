/**
 * LA BOÎTE DE RÉCEPTION DE LA CONSOLE — ce que la personne lit de ses formulaires : un résumé par formulaire (reçus,
 * spam, dernier envoi), la vue choisie (reçus, spam, un formulaire), l'adresse à qui répondre, l'export CSV. PUR.
 *
 * Remplace, pour vavi, la liste des soumissions et le tableau des formulaires de `FormsManager` (constructor-v13@32d18f3),
 * sans sa détection des formulaires dans le code : un formulaire existe ici parce qu'il a reçu un message.
 */
import type { Message } from './les-messages';

export type Vue = 'recus' | 'spam' | 'tous';
export interface ResumeDUnFormulaire { readonly formulaire: string; readonly recus: number; readonly spam: number; readonly dernier: string }

const COURRIEL = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;

/** Un formulaire par ligne, le plus récent d'abord. PURE. */
export function leResumeDesFormulaires(ms: readonly Message[]): ResumeDUnFormulaire[] {
  const par = new Map<string, { recus: number; spam: number; dernier: string }>();
  for (const m of ms) {
    const r = par.get(m.formulaire) ?? { recus: 0, spam: 0, dernier: m.creeLe };
    if (m.statut === 'spam') r.spam += 1; else r.recus += 1;
    if (m.creeLe > r.dernier) r.dernier = m.creeLe;
    par.set(m.formulaire, r);
  }
  return [...par].map(([formulaire, r]) => ({ formulaire, ...r })).sort((a, b) => b.dernier.localeCompare(a.dernier));
}

/** La vue lue dans l'adresse : `recus` par défaut ; un formulaire inconnu est ignoré. PURE. */
export function laVueDemandee(q: { readonly vue?: string; readonly formulaire?: string }, formulaires: readonly string[]): { readonly vue: Vue; readonly formulaire: string | null } {
  const vue: Vue = q.vue === 'spam' || q.vue === 'tous' ? q.vue : 'recus';
  return { vue, formulaire: q.formulaire && formulaires.includes(q.formulaire) ? q.formulaire : null };
}

export function lesMessagesDeLaVue(ms: readonly Message[], v: { readonly vue: Vue; readonly formulaire: string | null }): Message[] {
  return ms.filter((m) => (v.vue === 'tous' || (v.vue === 'spam') === (m.statut === 'spam')) && (!v.formulaire || m.formulaire === v.formulaire));
}

/** L'adresse du visiteur, s'il en a laissé une valide dans un champ dont le nom dit « mail ». PURE. */
export function laReponseA(donnees: Readonly<Record<string, unknown>>): string | null {
  const v = Object.entries(donnees).find(([k, x]) => /mail/i.test(k) && typeof x === 'string' && COURRIEL.test(x.trim()))?.[1];
  return typeof v === 'string' ? v.trim() : null;
}

/** Une cellule CSV : entre guillemets, et jamais lue comme une formule par un tableur (=, +, -, @ en tête). */
const cellule = (v: unknown): string => {
  const s = Array.isArray(v) ? v.join(', ') : v === null || v === undefined ? '' : String(v);
  return `"${(/^[=+\-@\t\r]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;
};

/** Les messages en CSV (séparateur `;`, lu tel quel par Excel en français) : date, formulaire, page, statut, puis chaque champ. PURE. */
export function leCsvDesMessages(ms: readonly Message[]): string {
  const champs = [...new Set(ms.flatMap((m) => Object.keys(m.donnees)))];
  const tete = ['date', 'formulaire', 'page', 'statut', ...champs];
  const lignes = ms.map((m) => [m.creeLe, m.formulaire, m.page ?? '', m.statut === 'spam' ? 'spam' : 'reçu', ...champs.map((c) => m.donnees[c])]);
  return `﻿${[tete, ...lignes].map((l) => l.map(cellule).join(';')).join('\r\n')}\r\n`;
}

const MOTIFS: Record<string, { readonly fr: string; readonly en: string }> = {
  'leurre-rempli': { fr: 'le champ caché, que seuls les robots voient, était rempli', en: 'the hidden field only robots see was filled in' },
  'trop-rapide': { fr: 'envoyé trop vite après l’ouverture de la page', en: 'sent too fast after the page opened' },
  'texte-aleatoire': { fr: 'des champs remplis de lettres tirées au hasard', en: 'fields filled with random letters' },
  'visite-trop-recente': { fr: 'envoyé trop vite après l’ouverture de la page', en: 'sent too fast after the page opened' },
  'sans-visite': { fr: 'envoyé sans avoir ouvert le site, et sans une phrase', en: 'sent without opening the site, and without a sentence' },
};

/** La raison d'un spam, en mots de tous les jours (le motif gardé est `<motif> : <détail>`). PURE. */
export function laRaisonDuSpam(motif: string | null, langue: 'fr' | 'en'): string | null {
  if (!motif) return null;
  const cle = motif.split(' : ')[0]!.trim();
  return MOTIFS[cle]?.[langue] ?? motif;
}
