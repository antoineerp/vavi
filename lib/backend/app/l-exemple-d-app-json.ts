/**
 * UN APP.JSON COMPLET ET VALIDE — rendu à Claude avec le refus d'un app.json dont la FORME ne tient pas (des rôles en
 * chaînes, des tables en objet, des champs requis absents) : il corrige d'après lui, sans aller lire un autre projet de
 * la personne. Neutre (aucun métier) ; `test/backend/l-exemple-d-app-json.test.ts` prouve que `lireLeManifeste`
 * l'accepte tel quel.
 *
 * Ce qu'il remplace (interdit 9) : un refus qui ne nommait que les écarts (« roles.0 : Expected object… ») ; Claude
 * ouvrait alors un autre projet du compte pour en recopier la forme (essai d'Antoine du 25/11).
 */
import { NOMS_DES_POLICES } from '../fige/polices';
import { Appartenance, Nature, Obtention, Organisations, TypeDeChamp } from './manifeste';

export const EXEMPLE_D_APP_JSON = {
  version: 1,
  nature: 'app',
  nom: 'Exemple',
  description: 'One sentence on what the app does and for whom.',
  langues: { principale: 'fr', autres: [] },
  demandes: [],
  direction: {
    couleurs: { fond: '#f7f7f5', texte: '#1c1c1a', accent: '#1f5f8b', surface: '#ffffff', bordure: '#dcdcd6' },
    polices: { titres: 'Fraunces', texte: 'Inter' },
    rayon: 'doux', travail: 'affirme', couleursDemandees: false,
  },
  organisations: 'une',
  roles: [
    { nom: 'proprietaire', libelle: 'Owner', obtenu: 'proprietaire' },
    { nom: 'membre', libelle: 'Member', obtenu: 'invitation' },
  ],
  tables: [
    {
      nom: 'evenements', libelle: 'Events',
      champs: [
        { nom: 'titre', libelle: 'Title', type: 'texte', obligatoire: true },
        { nom: 'le', libelle: 'Date', type: 'date', obligatoire: true },
        { nom: 'places', libelle: 'Seats', type: 'nombre', obligatoire: true },
        { nom: 'genre', libelle: 'Kind', type: 'choix', obligatoire: true, valeurs: ['A', 'B'] },
      ],
      appartenance: 'publique', lecture: ['proprietaire', 'membre'], ecriture: ['proprietaire'],
      propositions: false, contenu: false, exemples: [],
    },
    {
      nom: 'participations', libelle: 'Sign-ups',
      champs: [{ nom: 'evenement_id', libelle: 'Event', type: 'reference', obligatoire: true, table: 'evenements' }],
      appartenance: 'personnelle', lecture: ['proprietaire', 'membre'], ecriture: ['proprietaire', 'membre'],
      propositions: false, contenu: false, exemples: [],
    },
  ],
  indicateurs: [], automatisations: [], agents: [], ecrans: [],
  fonctions: {},
  promesses: [],
} as const;

/** L'exemple, en JSON compact, pour le texte d'un refus. */
export const EXEMPLE_D_APP_JSON_TEXTE = JSON.stringify(EXEMPLE_D_APP_JSON);

/**
 * LA FORME D'APP.JSON, DITE AVANT LE PREMIER ENVOI (essai d'Antoine du 26/11, Yokono : trois refus d'affilée, Claude
 * devinait la forme — rôles en chaînes, polices hors liste, `demandes` sans `passage`). Ce qu'elle remplace : l'exemple
 * rendu seulement APRÈS un refus. L'exemple, puis les valeurs permises, lues des énumérations du manifeste : rien ne
 * diverge de ce que `lireLeManifeste` accepte.
 */
export function laFormeDAppJson(): string {
  const v = (x: { options: readonly string[] }) => x.options.join(' | ');
  return [
    `Its shape, to follow exactly (a complete valid app.json): ${EXEMPLE_D_APP_JSON_TEXTE}`,
    `Allowed values. nature: ${v(Nature)}. Font (direction.polices.titres and .texte): ${NOMS_DES_POLICES.join(' | ')}.`,
    `Field type: ${v(TypeDeChamp)}. Table appartenance: ${v(Appartenance)}. Role obtenu: ${v(Obtention)}. organisations: ${v(Organisations)}.`,
    'Each of `demandes` is { passage: the words of the person, quoted; tenuePar: [names of the screens, agents or automations that do it] }; leave it [] when unsure.',
  ].join('\n');
}
