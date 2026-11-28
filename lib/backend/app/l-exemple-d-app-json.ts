/**
 * UN APP.JSON COMPLET ET VALIDE — rendu à Claude avec le refus d'un app.json dont la FORME ne tient pas (des rôles en
 * chaînes, des tables en objet, des champs requis absents) : il corrige d'après lui, sans aller lire un autre projet de
 * la personne. Neutre (aucun métier) ; `test/backend/l-exemple-d-app-json.test.ts` prouve que `lireLeManifeste`
 * l'accepte tel quel.
 *
 * Ce qu'il remplace (interdit 9) : un refus qui ne nommait que les écarts (« roles.0 : Expected object… ») ; Claude
 * ouvrait alors un autre projet du compte pour en recopier la forme (essai d'Antoine du 25/11).
 */
import { POLICES_PROPOSEES } from '../fige/polices';
import { MOUVEMENTS, Nature, Obtention, Organisations, REGISTRES, SIGNATURES, TypeDeChamp } from './manifeste';
import { LIGNES } from './les-acces';
import { CADENCES } from './les-automatisations';
import { AUTEUR, COMPARAISONS, PERIODES } from './les-regles';

export const EXEMPLE_D_APP_JSON = {
  version: 1,
  nature: 'app',
  nom: 'Exemple',
  description: 'One sentence on what the app does and for whom.',
  langues: { principale: 'fr', autres: [] },
  demandes: [],
  direction: {
    couleurs: { fond: '#f7f7f5', texte: '#1c1c1a', accent: '#1f5f8b', surface: '#ffffff', bordure: '#dcdcd6', second: '#c8794a', ancre: '#14232e' },
    polices: { titres: 'Fraunces', texte: 'Inter' },
    rayon: 'doux', travail: 'affirme', couleursDemandees: false,
    registre: 'classique', mouvement: 'vivant', signatureVisuelle: 'photo', verre: true, degrade: true,
    intention: {
      signature: 'One sentence: the visual idea of THIS site.', premierEcran: 'What the first screen shows, and how.',
      composition: 'How the pages are laid out and where the rhythm breaks.', typographie: 'The character of headlines and text.',
      matiere: 'Surfaces, textures, the photos and their treatment.', voix: 'The voice of the texts.',
      pourquoiDesCouleurs: 'Why these colours for this subject.',
    },
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
      acces: { lire: ['tous'], creer: ['proprietaire'], modifier: ['proprietaire'], supprimer: ['proprietaire'], lignes: 'toutes' },
      propositions: false, contenu: false, exemples: [],
    },
    {
      nom: 'participations', libelle: 'Sign-ups',
      champs: [{ nom: 'evenement_id', libelle: 'Event', type: 'reference', obligatoire: true, table: 'evenements' }],
      acces: { lire: ['inscrits'], creer: ['inscrits'], modifier: ['inscrits'], supprimer: ['proprietaire'], lignes: 'siennes' },
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
    `Allowed values. nature: ${v(Nature)}. Font (direction.polices.titres and .texte): ${POLICES_PROPOSEES.join(' | ')}.`,
    `direction.registre: ${REGISTRES.join(' | ')}. direction.mouvement: ${MOUVEMENTS.join(' | ')}. direction.signatureVisuelle: ${SIGNATURES.join(' | ')}. Write \`direction\` as an art director for THIS request, after reading \`get_design_guide\` (callable without a project): its colours, fonts, register and \`intention\`.`,
    `Field type: ${v(TypeDeChamp)}. Role obtenu: ${v(Obtention)}. organisations: ${v(Organisations)}.`,
    `\`acces\` of a table says who does each gesture (lire, creer, modifier, supprimer): \`tous\` (anyone, with or without an account: a menu everyone reads, a booking anyone sends), \`inscrits\` (every role of the app), \`visiteur\` (only people without an account), or role names. \`lignes\` says which rows one sees: ${LIGNES.join(' | ')} (who manages the organisation always sees all). A table with a \`parent\` follows its parent row.`,
    `Each of \`agents\` (work done with no one in front of the screen) is { nom, libelle, dit: what it does in one sentence (10 to 300 characters), reveil, ia_par_jour?: its daily cap of AI calls }; its code is \`src/agents/<nom>.ts\`. reveil is one of: { "type": "horaire", "cadence": ${CADENCES.map((c) => `"${c}"`).join(' | ')}, "heure"?: 0 to 23 (Paris time), "jour"?: 0 to 6 for a weekly one, Sunday being 0 } | { "type": "evenement", "table": a declared table, on each new row } | { "type": "bouton", "par": [roles that start it from a page] }.`,
    `A table may declare its business rules, held by the database on every screen: \`regles\`: [{ nom, dit: the sentence the person reads when refused (in the app's language, at most 200 characters), si: [conditions, all true for the rule to apply; none: always], alors: [conditions that must then hold] }], and \`uniques\`: [{ champs: [1 to 3 fields that never repeat within an organisation, text compared without case], dit }]. A condition is { champ (a field, or \`etat\` with a cycle), est: ${COMPARAISONS.join(' | ')}, valeur? (a date as days from today: 0 today, -30 thirty days ago) or autre? (another field of the row) }. An empty field never triggers \`si\` and never fails \`alors\`, except \`rempli\`. Caps on a set of rows: \`plafonds\`: [{ nom, dit, champ? (a number field summed; absent: the number of rows), au_plus, par? ([\`${AUTEUR}\` (each person who writes) or fields]), periode? { champ: a date field, sur: ${PERIODES.join(' | ')} }, si? [conditions on the rows counted] }] (500 € of expenses per person per month). A transition may be reserved under a condition: \`reservee\`: [{ si: [conditions on the row], par: [roles that alone then do it], dit }] (above 500 €, only a manager approves). Example: "regles": [{ "nom": "justificatif", "dit": "Une dépense de plus de 50 € porte son justificatif.", "si": [{ "champ": "montant", "est": "superieur", "valeur": 50 }], "alors": [{ "champ": "justificatif", "est": "rempli" }] }].`,
    'A table whose rows occupy a time span (a booking, an appointment, a rental, a shift) declares `periode`: { debut, fin: its two date fields, libelle: the text field that names a row, exclusive?: true when two rows never overlap (the database refuses the second), ressource?: with exclusive, the field naming what is occupied (a reference to the room, the person, the vehicle), capacite?: how many at once (a number, or the integer field of the ressource table), libre?: cycle states that free the place, nuits?: true for a stay counted in nights (hotel, holiday rental, campsite: the departure day is free for the next arrival; a date-only period otherwise takes its last day too) }. The owner then manages it on the console\'s « Planning », one row per ressource, a cell per day.',
    'Each of `demandes` is { passage: the words of the person, quoted; tenuePar: [at least one name of a declared screen, agent or automation that does it] }; for a site, or when unsure, write `"demandes": []`.',
  ].join('\n');
}
