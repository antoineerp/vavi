/**
 * LA CONSOLE DE VAVI, telle que Claude doit la connaître (Antoine, 28/11 : « Claude doit toujours connaître le
 * fonctionnement de la console vavi pour conseiller et orienter l'utilisateur », et l'aider à faire un réglage qu'il est
 * seul à pouvoir faire, comme coller le client Google de son app).
 *
 * UNE SEULE SOURCE : les écrans d'un projet (leur nom affiché, en français et en anglais, et ce que chacun permet), lus
 * par le menu de la console (`app/projets/[id]/la-navigation.ts`) ET rendus à Claude par `get_project_state`, avec
 * l'adresse de chaque écran pour ce projet. Un écran ajouté au menu sans sa ligne ici ne compile pas. PUR.
 */
export type Ecran = '' | 'gerer' | 'textes' | 'donnees' | 'utilisateurs' | 'messages' | 'visites' | 'fonctions' | 'contenu' | 'referencement' | 'versions' | 'paiements' | 'confidentialite' | 'secrets' | 'connecteurs' | 'domaine' | 'recette' | 'regles';

export interface EcranDeLaConsole { readonly fr: string; readonly en: string; readonly sert: string }

export const ECRANS: Readonly<Record<Ecran, EcranDeLaConsole>> = {
  '': { fr: 'Vue d’ensemble', en: 'Overview', sert: 'preview, the Publish button (only the person puts the site online), export, the address online' },
  gerer: { fr: 'Gérer le contenu', en: 'Manage content', sert: 'the person rewrites texts, images, colours and fonts without Claude' },
  textes: { fr: 'Textes', en: 'Texts', sert: 'leads to Manage content' },
  contenu: { fr: 'Apparence et titres', en: 'Appearance and titles', sert: 'leads to Manage content' },
  recette: { fr: 'Recette (tests)', en: 'Acceptance tests', sert: 'the journeys of src/recette.json, replayed after each build' },
  referencement: { fr: 'Référencement (SEO)', en: 'Search (SEO)', sert: 'page titles and descriptions, Google verification' },
  versions: { fr: 'Versions', en: 'Versions', sert: 'every saved version; going back to one' },
  donnees: { fr: 'Données', en: 'Data', sert: 'the rows of each table: search, add, change, delete, CSV import and export, planning' },
  utilisateurs: { fr: 'Utilisateurs', en: 'Users', sert: 'the accounts of the app, their roles, invitations' },
  messages: { fr: 'Messages', en: 'Messages', sert: 'what the forms of the site received' },
  visites: { fr: 'Visites', en: 'Visits', sert: 'visits of the site online, without cookies' },
  paiements: { fr: 'Paiements', en: 'Payments', sert: 'the Stripe account of the owner, orders and invoices (an app that sells)' },
  domaine: { fr: 'Domaine', en: 'Domain', sert: 'the person’s own domain name' },
  fonctions: { fr: 'Fonctions', en: 'Functions', sert: 'what the app uses from vavi (AI, email, SMS…) and what is still missing' },
  regles: { fr: 'Règles', en: 'Rules', sert: 'the business rules the database holds on rows' },
  confidentialite: { fr: 'Confidentialité', en: 'Privacy', sert: 'the record of processing (GDPR) derived from app.json' },
  connecteurs: { fr: 'Connecteurs', en: 'Connectors', sert: 'software the app and its agents call by name: one with a key (n8n, Algolia, Cloudinary, Cal.com, Supabase, any API), or an account connected by OAuth (Gmail, Google Calendar, Google Sheets) through the OAuth client of the owner, pasted here' },
  secrets: { fr: 'Clés secrètes', en: 'Secret keys', sert: 'secret keys of the app (ANTHROPIC_API_KEY for AI, email or SMS provider keys), never shown again' },
};

/** Ce que Claude dit, pas à pas, pour un réglage que la personne fait elle-même dans la console. */
export const REGLAGES = {
  client_google: [
    'Why: Google shows the consent page with the name of the person’s application, and the person (not vavi) gets the access verified by Google. Gmail is a restricted scope: beyond 100 test users, Google requires its verification and a yearly third-party security assessment; in test mode, access expires after 7 days.',
    '1. console.cloud.google.com: create a project (or pick one).',
    '2. APIs & Services → Library: enable the API the app uses (Gmail API, Google Calendar API, Google Sheets API).',
    '3. OAuth consent screen: app name, support email, the scopes (gmail.modify, calendar.events or spreadsheets); in test mode, add the test users’ addresses.',
    '4. Credentials → Create credentials → OAuth client ID → Web application; authorised redirect URI: {retour}.',
    '5. In the vavi console, Connectors → “Your Google client”: paste the Client ID and Client secret, then “Connect Gmail” (or Calendar, Sheets) and accept on Google’s page.',
  ],
} as const;

/** Les écrans d'un projet, avec leur adresse, pour Claude (`get_project_state`). PUR. */
export function laConsoleDuProjet(adresse: string, projet: string) {
  return Object.entries(ECRANS).filter(([e]) => e !== 'textes' && e !== 'contenu').map(([e, x]) => ({
    screen: { fr: x.fr, en: x.en }, url: `${adresse}/projets/${projet}${e ? `/${e}` : ''}`, for: x.sert,
  }));
}

/** Un réglage, pas à pas, son adresse de retour posée. PUR. */
export const unReglage = (nom: keyof typeof REGLAGES, retour: string): readonly string[] => REGLAGES[nom].map((l) => l.replace('{retour}', retour));
