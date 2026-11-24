/**
 * LE REGISTRE DES TRAITEMENTS D'UNE APP — tiré d'app.json, jamais écrit à la main ni par Claude. PUR.
 *
 * Ce que l'app garde de qui la visite ou s'y inscrit, pourquoi, qui le lit, combien de temps : une ligne par table
 * déclarée, plus ce que la plateforme pose elle-même (comptes, formulaires, mesure d'audience, paiement). Les traceurs
 * posés par la plateforme sont tous essentiels (session, preuve de visite contre le spam, panier) : aucun bandeau de
 * consentement n'est exigé tant qu'aucun traceur non essentiel n'est posé. La mesure d'audience ne pose aucun cookie.
 *
 * Neuf dans vavi (lot 6e, décision du 24/11). Remplace, pour vavi, `lib/generators/gdpr-reality-guard.ts` de
 * constructor-v13, qui contrôlait le texte d'une page au lieu de dériver le registre des déclarations.
 */
import { VISITEUR, type Manifeste } from '@/lib/backend/app/manifeste';

export type Langue = 'fr' | 'en';

export interface Traitement {
  /** Ce qui est gardé, nommé pour la personne. */
  readonly quoi: string;
  /** Les données, champ par champ. */
  readonly donnees: readonly string[];
  readonly pourquoi: string;
  /** Qui les lit : des rôles de l'app, ou « tout le monde ». */
  readonly qui: readonly string[];
  readonly duree: string;
  /** Posé par la plateforme (comptes, formulaires…), ou déclaré par l'app (une table). */
  readonly source: 'plateforme' | 'app';
}

export interface Traceur { readonly nom: string; readonly but: string; readonly essentiel: boolean }

export interface Registre {
  readonly traitements: readonly Traitement[];
  readonly traceurs: readonly Traceur[];
  /** Un bandeau de consentement n'est exigé que si un traceur non essentiel est posé. */
  readonly bandeau: boolean;
  /** Ceux qui traitent les données pour le compte de l'éditeur. */
  readonly sousTraitants: readonly string[];
}

const MOTS = {
  fr: {
    tous: 'tout le monde', proprietaire: 'le propriétaire de l’app', auteur: 'le courriel de qui crée la ligne',
    tantQue: 'tant que la ligne existe ; effacée avec le compte de qui l’a créée',
    pourquoiTable: (l: string) => `faire fonctionner « ${l} »`,
    comptes: 'Les comptes', comptesDonnees: ['adresse de courriel', 'rôles dans l’app', 'date d’inscription'], comptesPourquoi: 'identifier la personne et lui ouvrir ses écrans',
    comptesDuree: 'tant que le compte existe ; la personne l’efface elle-même depuis la page Confidentialité',
    messages: 'Les messages des formulaires', messagesDonnees: ['ce que la personne écrit', 'la page d’envoi', 'une empreinte de l’adresse IP, changée chaque jour'],
    messagesPourquoi: 'répondre à la personne, écarter le spam', messagesDuree: 'gardés pour le propriétaire de l’app, qui y répond',
    audience: 'La mesure d’audience', audienceDonnees: ['la page vue', 'le site d’où l’on vient (son domaine seul)', 'la campagne (utm)'],
    audiencePourquoi: 'compter les visites, sans cookie ni donnée personnelle', audienceDuree: 'agrégée sur 30 jours dans la console',
    paiement: 'Les commandes et les paiements', paiementDonnees: ['nom', 'courriel', 'adresse de livraison', 'articles et montants', 'facture'],
    paiementPourquoi: 'encaisser, livrer, facturer', paiementDuree: 'une commande facturée est gardée 10 ans (obligation comptable), même après l’effacement du compte',
    session: 'Session', sessionBut: 'garder la personne connectée', preuve: 'Preuve de visite', preuveBut: 'refuser un formulaire envoyé sans avoir ouvert le site (spam)',
    panier: 'Panier', panierBut: 'garder les articles choisis, dans le navigateur', supabase: 'Supabase (hébergement de la base, Union européenne)',
    stripe: 'Stripe (paiement, sur le compte de l’éditeur)', resend: 'Resend (envoi des courriels)',
  },
  en: {
    tous: 'everyone', proprietaire: 'the app owner', auteur: 'the email of whoever creates the row',
    tantQue: 'as long as the row exists; erased with its creator’s account',
    pourquoiTable: (l: string) => `run “${l}”`,
    comptes: 'Accounts', comptesDonnees: ['email address', 'roles in the app', 'sign-up date'], comptesPourquoi: 'identify the person and open their screens',
    comptesDuree: 'as long as the account exists; the person erases it from the Privacy page',
    messages: 'Form messages', messagesDonnees: ['what the person writes', 'the page it was sent from', 'a daily-changing fingerprint of the IP address'],
    messagesPourquoi: 'reply to the person, keep spam out', messagesDuree: 'kept for the app owner, who replies',
    audience: 'Audience measurement', audienceDonnees: ['the page viewed', 'the referring site (its domain only)', 'the campaign (utm)'],
    audiencePourquoi: 'count visits, with no cookie and no personal data', audienceDuree: 'aggregated over 30 days in the console',
    paiement: 'Orders and payments', paiementDonnees: ['name', 'email', 'shipping address', 'items and amounts', 'invoice'],
    paiementPourquoi: 'take payment, ship, invoice', paiementDuree: 'an invoiced order is kept 10 years (accounting law), even after the account is erased',
    session: 'Session', sessionBut: 'keep the person signed in', preuve: 'Visit proof', preuveBut: 'refuse a form sent without opening the site (spam)',
    panier: 'Cart', panierBut: 'keep the chosen items, in the browser', supabase: 'Supabase (database hosting, European Union)',
    stripe: 'Stripe (payments, on the publisher’s account)', resend: 'Resend (email delivery)',
  },
} as const;

/** L'app vend-elle : un panier, ou un rôle qui s'achète. */
export const vend = (m: Manifeste): boolean => (m.fonctions.panier && Boolean(m.vente)) || m.roles.some((r) => r.obtenu === 'paiement');

/** Le registre d'une app, dans la langue de la console. */
export function leRegistre(m: Manifeste, langue: Langue = 'fr'): Registre {
  const L = MOTS[langue];
  const libelleDuRole = (n: string): string => n === VISITEUR ? L.tous : m.roles.find((r) => r.nom === n)?.libelle ?? n;
  const comptes = m.roles.length > 0;
  const tables: Traitement[] = m.tables.map((t) => ({
    quoi: t.libelle, source: 'app',
    donnees: [...t.champs.map((c) => c.libelle), ...(t.ecriture.some((r) => r !== VISITEUR) ? [L.auteur] : [])],
    pourquoi: L.pourquoiTable(t.libelle),
    qui: t.appartenance === 'publique' && t.lecture.includes(VISITEUR) ? [L.tous] : [...new Set([...t.lecture.map(libelleDuRole), L.proprietaire])],
    duree: L.tantQue,
  }));
  const plateforme: Traitement[] = [
    ...(comptes ? [{ quoi: L.comptes, donnees: L.comptesDonnees, pourquoi: L.comptesPourquoi, qui: [L.proprietaire], duree: L.comptesDuree, source: 'plateforme' as const }] : []),
    { quoi: L.messages, donnees: L.messagesDonnees, pourquoi: L.messagesPourquoi, qui: [L.proprietaire], duree: L.messagesDuree, source: 'plateforme' },
    { quoi: L.audience, donnees: L.audienceDonnees, pourquoi: L.audiencePourquoi, qui: [L.proprietaire], duree: L.audienceDuree, source: 'plateforme' },
    ...(vend(m) ? [{ quoi: L.paiement, donnees: L.paiementDonnees, pourquoi: L.paiementPourquoi, qui: [L.proprietaire], duree: L.paiementDuree, source: 'plateforme' as const }] : []),
  ];
  const traceurs: Traceur[] = [
    ...(comptes ? [{ nom: L.session, but: L.sessionBut, essentiel: true }] : []),
    { nom: L.preuve, but: L.preuveBut, essentiel: true },
    ...(m.fonctions.panier ? [{ nom: L.panier, but: L.panierBut, essentiel: true }] : []),
  ];
  return {
    traitements: [...plateforme, ...tables], traceurs, bandeau: traceurs.some((x) => !x.essentiel),
    sousTraitants: [L.supabase, L.resend, ...(vend(m) ? [L.stripe] : [])],
  };
}
