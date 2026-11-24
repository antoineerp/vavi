/**
 * Ce que la plateforme fait pour l'app, quand une page l'appelle : envoyer un courriel ou un SMS, composer un PDF, lire un
 * fichier, trouver un lieu, chercher dans des textes, appeler un logiciel branché, lire un agenda, calculer le ciel,
 * ranger un document au coffre de l'organisation, lire les photos de l'appareil, en monter un film.
 * `capacites` n'offre que les fonctions qu'app.json déclare : en appeler une autre ne compile pas. Rien ici ne porte de
 * clé ni de fournisseur : la plateforme les tient. Chaque appel rend la donnée, ou un refus qui dit pourquoi et le geste
 * qui le lève ; jamais un succès simulé.
 */
import type { CapaciteDeclaree } from '../donnees/types';
import { COFFRE } from './coffre';
import { film } from './film';
import { photos } from './photos';
import { appelerLaPlateforme, recevoirDeLaPlateforme } from './plateforme';
import type { Resultat } from './resultat';
import { leDocument, type DocumentDeLApp } from './document';

export { html, type HtmlSur } from './html';
export type { DocumentDeLApp, SectionDuDocument } from './document';

const lu = <A, B>(r: Resultat<A>, f: (a: A) => B): Resultat<B> => (r.forme === 'refus' ? r : { forme: 'donnee', donnee: f(r.donnee) });

export interface Lieu { readonly libelle: string; readonly latitude: number; readonly longitude: number; readonly fuseau: string | null }
/** Une entreprise du registre public, avec sa fiche publique (`fiche`) : la source à montrer. */
export interface Entreprise {
  readonly siren: string; readonly nom: string; readonly activite: string | null; readonly adresse: string | null; readonly codePostal: string | null;
  readonly ville: string | null; readonly effectif: string | null; readonly creeeLe: string | null;
  readonly dirigeants: readonly { readonly nom: string; readonly qualite: string | null }[]; readonly fiche: string;
}
export interface CriteresDEntreprises {
  /** Des mots du nom ou de l'activité. */
  readonly texte?: string;
  /** Le code d'activité (NAF), comme « 56.10A ». */
  readonly activite?: string;
  readonly codePostal?: string;
  readonly departement?: string;
  /** Le nombre de salariés, bornes comprises. */
  readonly effectif?: { readonly min?: number; readonly max?: number };
  readonly page?: number;
}
export interface Passage { readonly texte: string; readonly score: number | null; readonly source: string | null }
export interface AgendaLu {
  /** Les créneaux occupés qui touchent la période, triés, en ISO. */
  readonly occupe: readonly { readonly debut: string; readonly fin: string }[];
  /** Les journées entières occupées (AAAA-MM-JJ). */
  readonly journees: readonly string[];
  /** Les événements que la lecture n'a pas pu placer : à dire à l'écran. */
  readonly ignores: number;
}
export interface CielDUneDate {
  readonly instant: string;
  /** `double` ou `inexistante` : l'heure du lieu était ambiguë ce jour-là (changement d'heure), à dire à l'écran. */
  readonly ambiguite: 'double' | 'inexistante' | null;
  /** Longitudes en degrés ; `retrograde` vrai quand l'astre recule. */
  readonly astres: readonly { readonly corps: string; readonly longitude: number; readonly vitesse: number; readonly retrograde: boolean }[];
  readonly ascendant: number;
  readonly milieuDuCiel: number;
  readonly maisons: { readonly systeme: string; readonly cuspides: readonly number[] };
}

const TOUTES = {
  courriel: {
    /** Envoie un message par l'expéditeur du propriétaire ; sans expéditeur configuré, un refus le dit. */
    envoyer: (o: { readonly a: string; readonly sujet: string; readonly texte: string }) =>
      appelerLaPlateforme<{ readonly id?: string }>('mail/<projet>/send', { to: o.a, subject: o.sujet, text: o.texte }),
  },
  pdf: {
    /**
     * Compose en PDF un document de l'app : sa couverture et ses sections, mis en page à sa direction (`./document`) ; la
     * page n'en écrit que le contenu. Le fichier revient, à proposer au téléchargement. Rien n'est gardé.
     */
    generer: (d: DocumentDeLApp) =>
      recevoirDeLaPlateforme('doc/<projet>/generate', { html: leDocument(d), filename: d.nom, title: d.titre, landscape: d.paysage }),
  },
  lecture: {
    /**
     * Le texte d'un fichier (PDF, Word, tableur, texte) ; pour un tableur, aussi ses `entetes`. Rien n'est gardé. Les
     * lignes d'un tableur entrent dans une table par `<Importer>` (`@/briques/Importer`), jamais une à une.
     */
    lire: async (fichier: Blob, nom?: string) => {
      const f = new FormData();
      f.append('file', fichier, nom ?? ((fichier as File).name || 'fichier'));
      return lu(await appelerLaPlateforme<{ text: string; filename: string; entetes?: string[] }>('file/<projet>/parse', f),
        (d) => ({ texte: d.text, nom: d.filename, entetes: d.entetes ?? null }));
    },
  },
  lieu: {
    /** Une adresse saisie, cherchée quand la saisie est faite : ses lieux, avec coordonnées et fuseau ; aucun trouvé n'est pas une panne. */
    chercher: async (adresse: string) => lu(await appelerLaPlateforme<{ results?: { label: string; latitude: number; longitude: number; timezone?: string }[] }>(
      'geocode/<projet>', { query: adresse }), (d): readonly Lieu[] => (d.results ?? []).map((l) => ({ libelle: l.label, latitude: l.latitude, longitude: l.longitude, fuseau: l.timezone ?? null }))),
  },
  recherche: {
    /** Rend un texte cherchable ; `ligne` : la ligne qui le porte, vu de qui la voit et parti avec elle. */
    indexer: async (o: { readonly texte: string; readonly titre?: string; readonly ligne?: { readonly table: string; readonly id: string } }) =>
      lu(await appelerLaPlateforme<{ chunks?: number }>('docs/<projet>/index', { text: o.texte, title: o.titre, ligne: o.ligne }), (d) => ({ morceaux: d.chunks ?? 0 })),
    /** Les passages qui répondent à la question, chacun avec sa source, pour que la page cite ce qu'elle affirme. */
    chercher: async (o: { readonly question: string; readonly dans?: { readonly table: string; readonly ids?: readonly string[] } }) =>
      lu(await appelerLaPlateforme<{ results?: { content: string; score?: number; source?: string }[] }>('docs/<projet>/search', { query: o.question, dans: o.dans }),
        (d): readonly Passage[] => (d.results ?? []).map((p) => ({ texte: p.content, score: typeof p.score === 'number' ? p.score : null, source: p.source ?? null }))),
    /** Efface les passages d'une ligne. */
    oublier: (ligne: { readonly table: string; readonly id: string }) => appelerLaPlateforme<{ readonly oublies: number }>('docs/<projet>/forget', { ligne }),
  },
  connecteur: {
    /** Le logiciel que le propriétaire a branché, par son nom ; sa clé reste à la plateforme. */
    appeler: async <T = unknown>(nom: string, o: { readonly chemin?: string; readonly methode?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'; readonly corps?: unknown } = {}) =>
      lu(await appelerLaPlateforme<{ statut: number; donnees?: T; corps: string }>('external/<projet>/call', { cible: nom, chemin: o.chemin, methode: o.methode, requete: o.corps }),
        (d) => ({ statut: d.statut, donnees: d.donnees ?? null, texte: d.corps })),
  },
  sms: {
    /** Envoie un SMS au numéro donné, au format international, par le compte d'opérateur du propriétaire. */
    envoyer: (o: { readonly a: string; readonly texte: string }) => appelerLaPlateforme<{ readonly sid?: string }>('sms/<projet>/send', { to: o.a, body: o.texte }),
  },
  telephone: {
    /** Le numéro qui répond pour l'app, au format international, à montrer pour être appelé ; aucun branché, un refus le dit. */
    numero: () => appelerLaPlateforme<{ readonly numero: string }>('telephone/<projet>/numero', {}),
  },
  agenda: {
    /** Ce qui est occupé entre `du` et `au` (ISO) dans l'agenda que le propriétaire a branché ; aucun branché, un refus le dit. */
    occupe: (o: { readonly du: string; readonly au: string }) => appelerLaPlateforme<AgendaLu>('agenda/<projet>/occupe', o),
  },
  ephemeride: {
    /** Le ciel d'une date (AAAA-MM-JJ), d'une heure (HH:MM) et d'un lieu, l'heure lue dans son fuseau (celui que `lieu` rend). */
    ciel: (o: { readonly date: string; readonly heure: string; readonly fuseau: string; readonly latitude: number; readonly longitude: number }) =>
      appelerLaPlateforme<CielDUneDate>('ephemeride/<projet>', o),
  },
  prospects: {
    /** Les entreprises en activité qui répondent aux critères, page par page, et leur source ; une page vide n'est pas une panne. */
    chercher: async (c: CriteresDEntreprises) => lu(await appelerLaPlateforme<{ entreprises: readonly Entreprise[]; total: number; page: number; pages: number; source: string }>(
      'entreprises/<projet>', c), (d) => d),
  },
  /** Le coffre de l'organisation de la personne connectée ; `<Coffre>` de `@/briques/Coffre` en est l'écran fini. */
  coffre: COFFRE,
  /** Les photos du téléphone ou de l'ordinateur, lues sur l'appareil : date, heure, position, lieu ; rien ne part. */
  phototheque: photos,
  /** Des photos montées en vidéo légendée, sur l'appareil, à enregistrer ou partager. */
  film,
};

/** Les fonctions qu'app.json déclare, et elles seules. */
export const capacites: Pick<typeof TOUTES, CapaciteDeclaree> = TOUTES;
