// Repris de constructor-v13@5bb786e : generateur-v2/app/manifeste.ts
/**
 * app.json — la seule source de vérité d'une app générée.
 *
 * L'étape « cadrer » l'écrit ; toutes les autres la lisent. Les `describe` du schéma sont ce que le modèle lit de chaque
 * champ : le sens d'un champ s'écrit là, et nulle part ailleurs. Aucun autre fichier ne déclare la nature, les langues,
 * les rôles, les tables ou les fonctions d'une app. Une modification change app.json, puis repose ce qui en dérive.
 */
import { z } from 'zod';
import { NOMS_DES_POLICES } from '../fige/polices';
import { estViolette } from './couleur';
import { Identifiant, NomDeColonne } from './identifiant';
import { Automatisation, lesEnvoisRepares, lireLesAutomatisations } from './les-automatisations';
import { lireLesExemples } from './les-exemples';
import { lireLePalier, lireLesPaliers, Palier } from './les-paliers';
import { lireQuiFaitLeResultat } from './qui-fait-le-resultat';
import { lesLiensRepares } from './les-liens';
import { lesCyclesRepares, lireLesCycles } from './les-cycles';
import { lireLaLigneVendueUneFois } from './la-ligne-vendue-une-fois';
import { avecSesEtatsOuverts, Bornes, lireLIntegrite } from './l-integrite';
import { CHIFFRES, Indicateur, lireLesIndicateurs } from './les-indicateurs';
import { Cumul, lireUnCumul } from './les-cumuls';
import { lireUneValeurLue, ValeurLue } from './les-valeurs-lues';
import { lireLeNumero, Numero } from './les-numeros';
import { lireLaVitrine, Vitrine } from './la-vitrine-de-l-app';
import { Agent, lireLesAgents } from './les-agents';
import { Demande, Ecran, lesDemandesReparees, lireLesEcrans, Parcours } from './les-ecrans';
import { Analyse, estAnalysee, lireLAnalyse } from './l-analyse';
import { lireLaRemise } from './la-remise';
import { lireLesEnvois } from './l-envoi-sans-compte';
import { INSCRITS, lesAccesTraduits, TOUS } from './les-acces';
import { lesFormesReparees } from './les-formes-reparees';
import { lesErreursLues } from './les-erreurs-lues';

export { CHIFFRES, Identifiant, Indicateur };

export const Nature = z.enum(['site', 'boutique', 'jeu', 'app', 'document']).describe(
  '`document` : un texte à lire en ligne, d’un bout à l’autre (un rapport, une étude, une réponse argumentée, un guide), sans compte ni table ; `site` : des pages à lire, sans compte ; `boutique` : des articles vendus par un panier ; `jeu` : une partie qui se joue dans le navigateur ; `app` : des personnes se connectent pour travailler sur des données.');
export type Nature = z.infer<typeof Nature>;

export const Obtention = z.enum(['proprietaire', 'inscription', 'invitation', 'habilitation', 'paiement']).describe('comment une personne reçoit ce rôle : il est au propriétaire ; on s’inscrit seul ; qui gère l’équipe le donne par courriel (`invitation` à une personne qui arrive, `habilitation` à un membre qui en reçoit un de plus) ; `paiement` : la personne l’achète, au prix de son `offre`');

/** Les monnaies dans lesquelles la plateforme encaisse. */
export const DEVISES = ['EUR', 'CHF', 'GBP', 'USD', 'CAD'] as const;

export const Offre = z.object({
  prix: z.number().positive().nullable().default(null)
    .describe('le prix, dans la devise, seulement quand la demande le donne ; sinon null : le propriétaire le fixe, et rien ne s’encaisse avant'),
  devise: z.enum(DEVISES).optional().describe('absente : celle de `vente`, sinon l’euro'),
  duree: z.number().int().min(1).max(3660).nullable().default(null).describe('les jours d’accès qu’un paiement donne ; null : l’accès reste'),
}).describe('ce que coûte un rôle obtenu par `paiement`');

export const Role = z.object({
  nom: Identifiant,
  libelle: z.string().min(1),
  obtenu: Obtention,
  client: z.boolean().optional()
    .describe('avec `organisations: clients`, un rôle donné par `invitation` à un client : il reçoit son espace et ne voit que lui'),
  offre: Offre.optional(),
});

export const Organisations = z.enum(['une', 'plusieurs', 'clients'])
  .describe('`une` : une seule organisation ; `plusieurs` : des organisations isolées entre elles, le propriétaire compris, qui ne voit rien des leurs ; `clients` : le propriétaire et son équipe servent des clients : chaque client a son espace et ne voit que lui, l’équipe voit tous les espaces et y travaille');

export const TypeDeChamp = z.enum([
  'texte', 'texte_long', 'nombre', 'entier', 'montant', 'date', 'date_heure', 'booleen', 'choix', 'image', 'fichier',
  'reference',
]);

/** Un champ que la base pose (`calcul` sur sa ligne, `cumul` des lignes rattachées, `palier`, `numero`, `depuis`) : personne ne l'écrit. */
export const estCalcule = (c: { readonly calcul?: unknown; readonly cumul?: unknown; readonly palier?: unknown; readonly numero?: unknown; readonly depuis?: unknown }): boolean => Boolean(c.calcul || c.cumul || c.palier || c.numero || c.depuis);
/** Un champ que la base tient : calculé, ou la date qu'un geste de son cycle pose. */
export const estTenu = (t: { readonly cycle?: { readonly transitions: readonly { readonly date?: string }[] } }, c: Parameters<typeof estCalcule>[0] & { readonly nom: string }): boolean => estCalcule(c) || Boolean(t.cycle?.transitions.some((x) => x.date === c.nom));

export const Champ = z.object({
  nom: NomDeColonne,
  libelle: z.string().min(1),
  type: TypeDeChamp,
  obligatoire: z.boolean().default(false),
  /** Pour `choix` : les valeurs permises. */
  valeurs: z.array(z.string().min(1)).optional(),
  table: Identifiant.optional(), // pour `reference` : la table désignée
  calcul: z.object({
    operation: z.enum(['produit', 'somme', 'difference', 'quotient']),
    champs: z.array(z.union([Identifiant, z.number().finite()])).min(2).max(2).describe('les deux opérandes, dans l’ordre de l’opération : un champ chiffré de la ligne, ou un nombre fixe (3 pour la moyenne de trois champs, 100 pour un pourcentage)'),
  }).optional().describe('un champ que la base calcule sur sa ligne, à partir de deux opérandes : des champs chiffrés de la même ligne (un champ calculé ou lu `depuis` compris), au plus un nombre fixe ; personne ne l’écrit'),
  cumul: Cumul.optional(),
  depuis: ValeurLue.optional(),
  palier: Palier.optional(),
  numero: Numero.optional(),
  bornes: Bornes.optional(),
}).superRefine((c, ctx) => {
  lireLePalier(c, ctx);
  lireLeNumero(c, ctx);
  if (c.type === 'choix' && !c.valeurs?.length) ctx.addIssue({ code: 'custom', message: `${c.nom} : un choix nomme ses valeurs` });
  if (c.type === 'reference' && !c.table) ctx.addIssue({ code: 'custom', message: `${c.nom} : une référence nomme sa table` });
  if ((c.calcul || c.cumul) && !CHIFFRES.includes(c.type)) ctx.addIssue({ code: 'custom', message: `${c.nom} : un champ calculé est de type ${CHIFFRES.join(', ')}` });
  if (c.calcul && c.cumul) ctx.addIssue({ code: 'custom', message: `${c.nom} : un champ porte un \`calcul\` ou un \`cumul\`, pas les deux` });
});

export const Appartenance = z.enum(['personnelle', 'organisation', 'publique', 'rattachee'])
  .describe('qui voit une ligne, parmi les rôles qui lisent la table : `personnelle`, qui l’a créée, qui l’encadre et qui gère l’organisation, pas ses collègues ; `organisation`, chacun de ces rôles, toutes les lignes de l’organisation (dans une app à organisation unique, qui s’inscrit seul ou paie son accès n’est le collègue de personne : d’une table qu’il écrit, il ne lit que ses lignes) ; `publique`, tous (le seul cas, avec une table rattachée à une table publique, où `visiteur` lit sans compte) ; l’auteur relit toujours ce qu’il a écrit, et le dehors ne change que ses lignes ; `rattachee`, qui voit sa ligne mère (`parent`) : la ligne FAIT PARTIE de sa mère, n’existe pas sans elle et s’efface avec elle. Une ligne qui en REGROUPE ou en CLASSE d’autres est désignée par un champ `reference` facultatif, jamais par une table rattachée : effacer le classement n’efface pas ce qu’il classait');

export const Transition = z.object({
  nom: Identifiant,
  libelle: z.string().min(1),
  de: z.array(Identifiant).min(1),
  vers: Identifiant,
  /** Les rôles qui la font. Le paiement d'une commande est celui de la plateforme (`la-commande.ts`). */
  par: z.array(Identifiant).describe('les rôles qui font ce geste ; aucun (`[]`) : la base seule, quand une autre transition l’entraîne'),
  entraine: z.array(z.object({ champ: Identifiant.describe('un champ référence de cette table'), transition: Identifiant.describe('une transition de la table désignée') })).optional()
    .describe('ce que la base fait, dans la même écriture, sur les lignes que celle-ci désigne : l’état atteint là-bas est tenu par la base seule, et chaque transition qui quitte l’état d’arrivée d’ici le défait'),
  pasParLAuteur: z.boolean().optional().describe('la base refuse ce geste à qui a créé la ligne, tant qu’un autre membre de son organisation peut le faire'),
  date: Identifiant.optional().describe('un champ `date` ou `date_heure` de cette table que la base pose au moment où la transition a lieu, faite par un rôle ou entraînée ; personne d’autre ne l’écrit'),
  motif: z.literal('exige').optional().describe('le geste ne se fait pas sans motif (un refus, un renvoi) ; le motif va au journal de la ligne, où l’écran le lit : aucun champ ne le recopie'),
});

/** Les lignes d'exemple d'une table ; celles d'une table `contenu`, qui les porte toutes. */
export const EXEMPLES_AU_PLUS = 12;
export const LIGNES_D_UN_CONTENU = 300;

export const Table = z.object({
  nom: Identifiant,
  libelle: z.string().min(1),
  champs: z.array(Champ).min(1),
  appartenance: Appartenance,
  parent: Identifiant.optional(),
  lecture: z.array(Identifiant),
  ecriture: z.array(Identifiant).describe('les rôles qui créent et modifient ses lignes ; `visiteur` : une personne sans compte y envoie une ligne (une demande, avec son fichier), que la plateforme garde au nom du propriétaire, et la page lui montre aussitôt ce que la base en a calculé'),
  creation: z.array(Identifiant).optional().describe('tirée d’`acces.creer` : les rôles qui créent ; absente (un app.json d’avant), ceux d’`ecriture`'),
  modification: z.array(Identifiant).optional().describe('tirée d’`acces.modifier`'),
  suppression: z.array(Identifiant).optional().describe('tirée d’`acces.supprimer`'),
  lectureEntiere: z.array(Identifiant).optional().describe('table `personnelle` : les rôles de `lecture` qui voient TOUTES les lignes de l’organisation, pas seulement les leurs et celles des personnes qu’ils encadrent (une comptabilité, une direction) ; un rôle qui fait une transition sur les lignes des autres sans les encadrer y figure'),
  identite: z.array(Identifiant).optional().describe('les champs qui, ensemble, identifient une ligne'),
  cycle: z.object({
    etats: z.array(Identifiant).min(2),
    libelles: z.record(z.string().min(1)).describe('le libellé que la personne lit pour chaque état, un par état'),
    initial: Identifiant,
    modifiable: z.array(Identifiant).optional().describe('les états où la ligne se modifie et se supprime encore, l’initial toujours : nommez-y chaque état où l’on travaille encore la ligne (en cours, à compléter) ; absent : l’initial et ceux d’où part un geste qui part aussi de l’initial ; ailleurs, elle est figée'),
    transitions: z.array(Transition).min(1),
  }).optional(),
  vente: z.object({
    prix: Identifiant.describe('le champ du prix d’une unité, taxes comprises, dans la devise de la boutique'),
    libelle: Identifiant.describe('le champ texte qui nomme l’article au panier et au paiement'),
    stock: Identifiant.optional().describe('le champ des unités disponibles : ce qui dépasse ne se paie pas, le paiement le décompte'),
    tva: Identifiant.optional().describe('le champ du taux de TVA de l’article, en % ; absent : le taux normal du pays'),
    poids: Identifiant.optional().describe('le champ du poids d’une unité, en kg'),
    options: Identifiant.optional().describe('le champ texte qui liste, séparées par des virgules, les variantes que l’acheteur choisit avant de mettre l’article au panier'),
    payee: Identifiant.optional().describe('une ligne qui ne se vend qu’une fois : la transition de son cycle, sans rôle (`par: []`), que la base fait quand sa commande est payée ; elle ne s’achète que depuis les états d’où part cette transition, puis plus jamais'),
  }).optional().describe('chaque ligne de cette table est un article à vendre, qui s’achète sans compte ; une ligne qu’un `visiteur` envoie se vend aussi quand la base en pose le prix (un champ calculé)'),
  periode: z.object({
    debut: Identifiant.describe('le champ date où la ligne commence'),
    fin: Identifiant.describe('le champ date où elle finit'),
    libelle: Identifiant.describe('le champ texte qui la nomme sur la frise'),
  }).optional().describe('chaque ligne occupe une période, de son début à sa fin : elle se montre aussi sur une frise'),
  personnes: Identifiant.optional()
    .describe('le rôle dont chaque compte a SA ligne dans cette table, sa fiche (un technicien, un salarié, un client suivi) : la base pose la colonne `compte_id`, que le propriétaire relie à un compte dans la console (Utilisateurs) ; la page lit la fiche du compte connecté par `useMaFiche`, jamais en comparant une adresse recopiée dans un champ'),
  propositions: z.boolean().default(false)
    .describe('l’IA propose des lignes de cette table ; chacune reste une proposition, marquée, jusqu’à ce qu’une personne la fasse avancer par une transition'),
  sansRelecture: Identifiant.optional()
    .describe('seulement quand la demande veut le résultat de l’IA tout de suite, sans relecture par une personne : la transition que la base fait sur chaque proposition dès qu’elle naît, marquée produite par l’IA ; absente, l’équipe valide'),
  contenu: z.boolean().default(false)
    .describe('ses lignes sont fixées d’avance, par la demande ou par un texte public qu’elle nomme (une liste d’exigences, un barème, une nomenclature) : `exemples` les porte TOUTES, en entier, telles que ce texte les écrit, et la base les garde'),
  exemples: z.array(z.record(z.unknown())).max(LIGNES_D_UN_CONTENU).default([])
    .describe(`des lignes plausibles, champ par champ, qui remplissent l’aperçu tant que la base est vide (au plus ${EXEMPLES_AU_PLUS}, sauf une table \`contenu\`). Une référence, et la mère d’une table rattachée sous \`<mère>_id\`, nomment un exemple de la table désignée par la valeur d’un de ses champs (son identité d’abord) ; une date s’écrit en jours depuis aujourd’hui (-3 ; 1.375 pour demain à 9 h), pour tomber dans la semaine, le mois, l’année ; une table à cycle donne l’\`etat\` où chaque exemple se trouve (absent : l’état de départ)`),
});

/**
 * Ce que la plateforme fait pour l'app quand une page l'appelle, par `capacites` de `@/lib/capacites` : une fonction
 * déclarée ici, et seulement elle, s'y appelle ; une fonction déclarée est appelée par une page, ou servie par une
 * automatisation (le SMS d'une étape, l'appel d'un déclencheur) (`controles/couverture.ts`).
 */
export const CAPACITES = ['courriel', 'pdf', 'lecture', 'lieu', 'recherche', 'connecteur', 'sms', 'telephone', 'agenda', 'ephemeride', 'coffre', 'phototheque', 'film', 'prospects'] as const;
export type Capacite = (typeof CAPACITES)[number];
/** Celles qu'une page n'appelle que derrière un compte : elles dépensent pour le propriétaire ou lisent ses documents. */
export const CAPACITES_DERRIERE_UN_COMPTE: readonly Capacite[] = ['courriel', 'pdf', 'lecture', 'recherche', 'connecteur', 'sms', 'coffre', 'prospects'];

const Capacite = (sens: string) => z.boolean().default(false).describe(`${sens} ; seulement quand la demande en a besoin`);
export const Fonctions = z.object({
  panier: z.boolean().default(false),
  ia: z.boolean().default(false),
  courriel: Capacite('une page envoie un courriel à une adresse, par l’expéditeur du propriétaire (une automatisation qui prévient n’en a pas besoin)'),
  pdf: Capacite('une page compose un document PDF que la personne télécharge'),
  lecture: Capacite('une page lit le texte d’un fichier que la personne choisit (PDF, Word .docx, PowerPoint .pptx, CSV, texte) pour s’en servir, `capacites.lecture.lire` ; un tableur Excel se lit dans la page (`read-excel-file/browser`) ; un fichier à garder est un champ `fichier`'),
  lieu: Capacite('une page trouve une adresse : ses coordonnées et son fuseau horaire'),
  recherche: Capacite('une page rend des textes cherchables par le sens et y cherche, chaque passage rendu avec sa source'),
  connecteur: Capacite('une page appelle un logiciel que le propriétaire a branché, sous son nom'),
  sms: Capacite('une page ou une automatisation envoie un SMS par le compte d’opérateur du propriétaire'),
  telephone: Capacite('la plateforme répond aux appels du numéro du propriétaire, écoute et transcrit le message, qu’une automatisation au déclencheur `appel` range ; une page peut montrer ce numéro'),
  agenda: Capacite('une page lit les créneaux occupés de l’agenda que le propriétaire tient déjà ailleurs'),
  ephemeride: Capacite('une page calcule le ciel réel d’une date, d’une heure et d’un lieu : positions des astres, ascendant, maisons'),
  phototheque: Capacite('une page fait choisir des photos sur le téléphone ou l’ordinateur, et lit leur date, leur heure et leur position sans les envoyer ; une photo à garder est un champ `image`'),
  film: Capacite('une page monte des photos en vidéo légendée, sur l’appareil de la personne, qu’elle enregistre ou partage'),
  prospects: Capacite('une page ou un agent cherche des entreprises dans le registre public français (activité, lieu, effectif), chacune avec sa source ; leurs contacts viennent d’un fournisseur que le propriétaire branche (`connecteur`)'),
  coffre: Capacite('chaque organisation a son coffre de documents, où ses membres déposent, ouvrent et retirent des fichiers ; le fichier qui appartient à une ligne est un champ `fichier`'),
});
export type Fonctions = z.infer<typeof Fonctions>;

const Pays = z.string().regex(/^[A-Z]{2}$/, 'un code de pays en deux majuscules (FR, BE, CH…)');
export const Boutique = z.object({
  pays: Pays.describe('le pays du vendeur : sa TVA'),
  devise: z.enum(DEVISES).describe('la monnaie des prix'),
  tva: z.enum(['assujettie', 'franchise']).default('assujettie').describe('`franchise` : le vendeur n’applique pas de TVA'),
  livraison: z.object({
    pays: z.array(Pays).default([]).describe('les pays où les articles s’envoient ; vide : rien ne s’envoie'),
    prix: z.number().min(0).default(0).describe('le prix d’un envoi, dans la devise'),
    offerteDes: z.number().positive().nullable().default(null).describe('le montant du panier à partir duquel l’envoi est offert'),
    retrait: z.string().min(1).nullable().default(null).describe('l’adresse du retrait sur place, quand il est offert'),
  }).default({}),
  remise: z.object({
    table: Identifiant.describe('la table des codes'),
    code: Identifiant.describe('le champ texte du code que la personne saisit au panier'),
    pourcentage: Identifiant.optional().describe('le champ du pourcentage retiré des articles'),
    montant: Identifiant.optional().describe('le champ du montant retiré des articles, dans la devise'),
    actif: Identifiant.optional().describe('le champ booléen qui dit si le code vaut encore'),
    fin: Identifiant.optional().describe('le champ date après lequel le code ne vaut plus'),
  }).optional().describe('les codes de remise : un code saisi au panier baisse le prix payé, lu en base par la vente'),
}).describe('ce que la vente de l’app sait de son vendeur : pays, devise, TVA, livraison, codes de remise');

/** Les tables que la plateforme pose elle-même : aucune table d'app.json ne prend leur nom. */
export const TABLES_DE_LA_PLATEFORME = ['membres', 'membres_invitations', 'membres_espaces', 'membres_choix', 'commande', 'coffre_documents', 'coffre_dossiers'] as const;

const Couleur = z.string().regex(/^#[0-9a-f]{6}$/i);
/**
 * LA DIRECTION ARTISTIQUE RÉDIGÉE (Antoine, 26/11 : « on a perdu beaucoup de qualité design ») : Claude la rédige pour CETTE
 * demande, en directeur artistique, comme le faisaient `llm-design-intelligence.ts` et `art-direction.ts` de constructor-v13
 * (12/05, 948a77316) et sa direction d'octobre (`generateur/outils/la-direction-artistique.ts`). Chaque champ ajouté est
 * facultatif : un app.json d'avant se lit tel quel. Le registre et le mouvement sont CHOISIS par Claude ; aucun mot-clé
 * côté vavi ne les décide (ce qu'ils remplacent : les listes de mots de `detectArtDirection`). Le guide de chaque registre
 * est dans `lib/design/le-langage.ts`.
 */
export const REGISTRES = ['classique', 'editorial', 'narratif', 'catalogue', 'brut', 'outil'] as const;
export const MOUVEMENTS = ['vivant', 'discret', 'immobile'] as const;
export const SIGNATURES = ['photo', 'bande-inversee', 'maillage', 'typographie'] as const;
const Phrase = z.string().min(1).max(600);
export const Intention = z.object({
  signature: Phrase.optional().describe('the visual idea that makes THIS site and no other, in one sentence'),
  premierEcran: Phrase.optional().describe('what the home page shows before any scroll, and how'),
  composition: Phrase.optional().describe('how pages are organised and follow each other: grid, rhythm, density, the break that avoids monotony'),
  typographie: Phrase.optional().describe('the character of the headlines and the text, and what they say of the subject'),
  matiere: Phrase.optional().describe('surfaces, textures, photos (real subjects, framing, treatment)'),
  voix: Phrase.optional().describe('the voice of the texts: register, sentence length, what is never said'),
  pourquoiDesCouleurs: Phrase.optional().describe('why THESE colours for THIS subject, in one sentence'),
}).describe('the art direction written for this request: each line says what holds for THIS site and not another');

export const Direction = z.object({
  couleurs: z.object({ fond: Couleur, texte: Couleur, accent: Couleur, surface: Couleur, bordure: Couleur,
    second: Couleur.optional().describe('a second hue, accomplice of the accent: the end of a gradient headline, a second mark'),
    ancre: Couleur.optional().describe('the deep colour of dark bands (footer, inverted band), carrying light text; taken from the subject') }),
  registre: z.enum(REGISTRES).optional().describe('the register of the public pages, chosen from what the request carries: classique (premium editorial), editorial (typography first), narratif (immersive, full-height, the scroll tells), catalogue (products photo first), brut (very large type, strong contrast), outil (the screen is the product)'),
  mouvement: z.enum(MOUVEMENTS).default('vivant').describe('how much the app moves: vivant (reveal on scroll, hover, depth), discret (short and sober), immobile (nothing moves)'),
  signatureVisuelle: z.enum(SIGNATURES).optional().describe('what one recognises from the first screen: photo (full-frame photo under a veil), bande-inversee (a full-width band in inverted contrast), maillage (two soft colour blurs behind the opening), typographie (a monumental headline)'),
  verre: z.boolean().default(true).describe('true: frosted glass is allowed for the header and floating cards (`verre`); false: opaque surfaces'),
  degrade: z.boolean().default(true).describe('true: one or two words of a headline may go from the accent to the second hue (`texte-degrade`); false: flat colours'),
  intention: Intention.optional(),
  polices: z.object({ titres: z.enum(NOMS_DES_POLICES), texte: z.enum(NOMS_DES_POLICES) }),
  rayon: z.enum(['net', 'doux', 'rond']).describe('l’arrondi des boutons, des champs et des cartes'),
  travail: z.enum(['affirme', 'sobre']).default('affirme').describe('l’allure des écrans derrière un compte : `affirme`, une colonne de menu sombre et de grands titres ; `sobre`, une colonne de menu claire, l’écran ouvert à la teinte de l’accent, des titres de taille courante — celle d’une app jointe ou reprise qui a une colonne claire'),
  couleursDemandees: z.boolean().default(false).describe('vrai seulement quand la demande nomme elle-même ses couleurs'),
  logo: z.string().regex(/^https:\/\/[^\s"<>]{1,1000}$/).optional().describe('set only by the owner in the console (their uploaded logo): never write it; show the brand with `<Marque />`'),
}).superRefine((d, ctx) => {
  if (d.couleursDemandees) return;
  for (const [nom, hex] of Object.entries(d.couleurs)) {
    if (hex && estViolette(hex)) ctx.addIssue({ code: 'custom', path: ['couleurs', nom], message: `${hex} est violet, mauve ou indigo : ces teintes ne se posent que si la demande les nomme` });
  }
}).describe('la direction artistique, choisie pour le sujet de la demande : le contraste de lecture est construit à partir d’elle');

/** Qui publie l'app : le pied et les mentions légales le lisent. Ce que la demande ne dit pas reste absent, et le dit. */
export const Editeur = z.object({
  nom: z.string().min(1).optional().describe('le nom légal de qui publie l’app'),
  adresse: z.string().min(1).optional(), telephone: z.string().min(1).optional(), courriel: z.string().min(1).optional(),
  immatriculation: z.string().min(1).optional().describe('le numéro d’immatriculation de l’entreprise'),
  horaires: z.array(z.string().min(1)).optional().describe('une ligne par plage d’ouverture'),
}).describe('qui publie l’app, tel que la demande ou ses pièces jointes le disent : rien d’inventé, un fait inconnu reste absent');

export const Manifeste = z.object({
  version: z.literal(1),
  nature: Nature,
  nom: z.string().min(1),
  description: z.string().min(1),
  langues: z.object({ principale: z.string().length(2), autres: z.array(z.string().length(2)).default([]) }).describe('codes de langue à deux lettres : celle de la demande, plus celles que la demande nomme'),
  demandes: z.array(Demande).default([]),
  parcours: Parcours.optional(),
  direction: Direction,
  organisations: Organisations.default('une'),
  roles: z.array(Role).default([]),
  tables: z.array(Table).default([]),
  indicateurs: z.array(Indicateur).default([]),
  automatisations: z.array(Automatisation).default([]),
  agents: z.array(Agent).default([]),
  ecrans: z.array(Ecran).default([]),
  analyse: Analyse.optional(),
  fonctions: Fonctions.default({}),
  vente: Boutique.optional(),
  editeur: Editeur.optional(),
  ...Vitrine,
}).superRefine((m, ctx) => {
  const roles = new Set(m.roles.map((r) => r.nom)), tables = new Set(m.tables.map((t) => t.nom));
  const doublon = (noms: string[]) => noms.find((n, i) => noms.indexOf(n) !== i);
  for (const [d, dit] of [[doublon(m.roles.map((r) => r.nom)), 'le rôle % est déclaré'], [doublon(m.tables.map((t) => t.nom)), 'la table % est déclarée']] as const) {
    if (d) ctx.addIssue({ code: 'custom', message: `${dit.replace('%', d)} deux fois` });
  }
  lireLeMoteur(m, ctx);
  lireLesExemples(m.tables, ctx);
  lireLesAutomatisations(m, ctx, { posees: COLONNES_POSEES_PAR_LA_BASE, propositions: COLONNES_DES_PROPOSITIONS });
  lireLesAgents(m, ctx);
  lireLesEcrans(m, ctx);
  lireLAnalyse(m, ctx);
  lireLesEnvois(m, ctx);
  lireLesCycles(m.tables, roles, ctx);
  lireLesPaliers(m.tables, ctx);
  lireQuiFaitLeResultat(m, ctx);
  lireLaVitrine(m, ctx);
  for (const r of m.roles.filter((x) => x.client && (m.organisations !== 'clients' || x.obtenu !== 'invitation'))) ctx.addIssue({ code: 'custom', message: `le rôle ${r.nom} : \`client\` se déclare sur un rôle donné par \`invitation\`, dans une app à \`organisations: clients\`` });
  for (const c of CAPACITES_DERRIERE_UN_COMPTE.filter((x) => m.fonctions[x] && m.roles.length === 0)) {
    ctx.addIssue({ code: 'custom', path: ['fonctions', c], message: `la fonction ${c} s’appelle derrière un compte : l’app déclare au moins un rôle, ou ne la déclare pas` });
  }
  for (const r of m.roles.filter((x) => x.offre && x.obtenu !== 'paiement')) ctx.addIssue({ code: 'custom', message: `le rôle ${r.nom} : une \`offre\` ne se déclare que sur un rôle obtenu par \`paiement\`` });
  if (m.organisations === 'clients' && m.roles.some((r) => r.obtenu === 'paiement')) {
    ctx.addIssue({ code: 'custom', message: 'un rôle obtenu par `paiement` donne un accès à l’organisation de l’app : il ne se déclare pas avec `organisations: clients`' });
  }
  if (m.fonctions.ephemeride && !m.fonctions.lieu) ctx.addIssue({ code: 'custom', path: ['fonctions', 'lieu'], message: 'la fonction ephemeride lit le fuseau d’un lieu : l’app déclare aussi la fonction lieu' });
  if (m.nature === 'boutique' && !m.fonctions.panier) ctx.addIssue({ code: 'custom', message: 'une boutique a un panier' });
  if (m.nature === 'document' && (m.roles.length > 0 || m.tables.length > 0 || m.fonctions.panier)) ctx.addIssue({ code: 'custom', message: 'un `document` se lit sans compte, d’un bout à l’autre : ni rôle, ni table, ni panier ; ses chiffres s’écrivent dans ses pages, avec leurs sources' });
  if (m.nature === 'app' && m.tables.length === 0) ctx.addIssue({ code: 'custom', message: 'une `app` garde en base les lignes qu’on y gère : déclarez ses `tables` (une liste fixée d’avance se déclare `contenu`) ; sans table, c’est un `site`' });
  for (const t of m.tables) {
    if ((TABLES_DE_LA_PLATEFORME as readonly string[]).includes(t.nom) || t.nom.endsWith('_journal')) {
      ctx.addIssue({ code: 'custom', message: `la table ${t.nom} : ce nom est celui d’une table que la plateforme pose (${TABLES_DE_LA_PLATEFORME.join(', ')}, ou un journal)` });
    }
  }
  if (m.fonctions.panier) {
    if (!m.vente) ctx.addIssue({ code: 'custom', message: 'une app à panier déclare `vente` : le pays, la devise, la TVA et la livraison du vendeur' });
    if (!m.tables.some((t) => t.vente)) ctx.addIssue({ code: 'custom', message: 'une app à panier a au moins une table dont les lignes se vendent (`vente` sur la table)' });
    if (!m.roles.some((r) => r.obtenu === 'proprietaire')) ctx.addIssue({ code: 'custom', message: 'une app à panier a un rôle du propriétaire (`obtenu: proprietaire`) : il gère les commandes' });
    if (m.vente?.remise) lireLaRemise(m.vente.remise, m.tables, ctx);
  } else if (m.vente) {
    ctx.addIssue({ code: 'custom', message: '`vente` ne se déclare que pour une app à panier' });
  }
  for (const t of m.tables.filter((x) => x.lectureEntiere?.length)) {
    if (t.appartenance !== 'personnelle') ctx.addIssue({ code: 'custom', message: `la table ${t.nom} : \`lectureEntiere\` ne se déclare que sur une table \`personnelle\` (ailleurs, la lecture suit déjà l’organisation)` });
    for (const r of t.lectureEntiere!.filter((x) => !t.lecture.includes(x))) ctx.addIssue({ code: 'custom', message: `la table ${t.nom} : ${r} est dans \`lectureEntiere\` sans être dans \`lecture\`` });
    for (const r of t.lectureEntiere!.filter((x) => m.organisations === 'une' && m.roles.some((r) => r.nom === x && (r.obtenu === 'inscription' || r.obtenu === 'paiement')))) ctx.addIssue({ code: 'custom', message: `la table ${t.nom} : ${r} s’obtient par inscription ou paiement, il n’est le collègue de personne et ne lit pas les lignes des autres` });
  }
  for (const r of m.roles.filter((x) => [TOUS, INSCRITS, VISITEUR].includes(x.nom))) ctx.addIssue({ code: 'custom', message: `le rôle ${r.nom} : ce nom dit déjà qui fait un geste dans \`acces\` ; nommez ce rôle autrement` });
  for (const t of m.tables) {
    for (const r of [...t.lecture, ...t.ecriture]) {
      if (r !== 'visiteur' && !roles.has(r)) ctx.addIssue({ code: 'custom', message: `${t.nom} : le rôle ${r} n'est pas déclaré` });
    }
    if (t.appartenance === 'rattachee' && (!t.parent || !tables.has(t.parent))) {
      ctx.addIssue({ code: 'custom', message: `${t.nom} : une table rattachée nomme sa table mère` });
    }
    for (const c of t.champs) {
      const posee = (Object.prototype.hasOwnProperty.call(COLONNES_POSEES_PAR_LA_BASE, c.nom) && (c.nom !== 'etat' || t.cycle) ? COLONNES_POSEES_PAR_LA_BASE[c.nom] : null)
        ?? (t.propositions && Object.prototype.hasOwnProperty.call(COLONNES_DES_PROPOSITIONS, c.nom) ? COLONNES_DES_PROPOSITIONS[c.nom] : null)
        ?? (t.parent && c.nom === `${t.parent}_id` ? 'la ligne mère' : null);
      if (posee) ctx.addIssue({ code: 'custom', message: `${t.nom}.${c.nom} : la base pose déjà cette colonne (${posee}) ; nommez ce champ autrement` });
      if (c.type === 'reference' && c.table && !tables.has(c.table)) {
        ctx.addIssue({ code: 'custom', message: `${t.nom}.${c.nom} : la table ${c.table} n'est pas déclarée` });
      }
    }
    const champs = new Set(t.champs.map((c) => c.nom));
    if (t.periode) {
      const type = (n: string) => t.champs.find((c) => c.nom === n)?.type;
      for (const n of [t.periode.debut, t.periode.fin]) if (!['date', 'date_heure'].includes(type(n) ?? '')) ctx.addIssue({ code: 'custom', message: `${t.nom}.${n} : la période se lit sur un champ date` });
      if (!['texte', 'choix'].includes(type(t.periode.libelle) ?? '')) ctx.addIssue({ code: 'custom', message: `${t.nom}.${t.periode.libelle} : une ligne de la frise se nomme par un champ texte` });
    }
    for (const c of [...(t.identite ?? []), ...(t.vente ? [t.vente.prix, t.vente.libelle, t.vente.stock, t.vente.tva, t.vente.poids, t.vente.options] : [])]) {
      if (c && !champs.has(c)) ctx.addIssue({ code: 'custom', message: `${t.nom} : le champ ${c} n'existe pas` });
    }
    if (t.vente?.options && t.champs.find((c) => c.nom === t.vente!.options)?.type !== 'texte') {
      ctx.addIssue({ code: 'custom', message: `${t.nom}.${t.vente.options} : les variantes se lisent dans un champ texte` });
    }
    for (const e of t.cycle?.etats ?? []) if (!t.cycle!.libelles[e]) ctx.addIssue({ code: 'custom', message: `${t.nom} : l'état ${e} n'a pas de libellé` });
    for (const e of Object.keys(t.cycle?.libelles ?? {})) if (!t.cycle!.etats.includes(e)) ctx.addIssue({ code: 'custom', message: `${t.nom} : ${e} a un libellé mais n'est pas un état` });
    if (t.propositions) {
      if (!m.fonctions.ia) ctx.addIssue({ code: 'custom', message: `${t.nom} reçoit des propositions de l’IA : l’app déclare la fonction ia` });
      if (!t.cycle) ctx.addIssue({ code: 'custom', message: `${t.nom} reçoit des propositions de l’IA : elle a un cycle, dont une transition fait d’une proposition un fait` });
      if (t.ecriture.length === 0) ctx.addIssue({ code: 'custom', message: `${t.nom} reçoit des propositions de l’IA : un rôle l’écrit, au nom duquel l’IA propose` });
      if (t.appartenance === 'rattachee') ctx.addIssue({ code: 'custom', message: `${t.nom} : une table rattachée ne reçoit pas de propositions de l’IA` });
    }
    if (t.personnes) {
      if (!roles.has(t.personnes)) ctx.addIssue({ code: 'custom', message: `${t.nom} : \`personnes\` nomme le rôle ${t.personnes}, qui n'est pas déclaré` });
      if (champs.has(COLONNE_DE_LA_FICHE)) ctx.addIssue({ code: 'custom', message: `${t.nom}.${COLONNE_DE_LA_FICHE} : la base pose déjà cette colonne (le compte de la fiche) ; nommez ce champ autrement` });
      const autre = m.tables.find((x) => x !== t && x.personnes === t.personnes);
      if (autre && m.tables.indexOf(autre) < m.tables.indexOf(t)) ctx.addIssue({ code: 'custom', message: `${t.nom} : le rôle ${t.personnes} a déjà sa fiche dans ${autre.nom} ; un compte a une seule fiche` });
    }
    if (t.vente && !m.fonctions.panier) ctx.addIssue({ code: 'custom', message: `${t.nom} se vend : l'app a un panier` });
    lireLaLigneVendueUneFois(t, ctx);
    lireLIntegrite(t, ctx);
    if (t.exemples.length > EXEMPLES_AU_PLUS && !t.contenu && !estAnalysee(m, t.nom)) ctx.addIssue({ code: 'custom', message: `${t.nom} : au plus ${EXEMPLES_AU_PLUS} exemples ; une table dont les lignes sont fixées d’avance se déclare \`contenu\` et les porte toutes` });
    if (t.contenu && t.exemples.length === 0) ctx.addIssue({ code: 'custom', message: `${t.nom} est un \`contenu\` : \`exemples\` porte chacune de ses lignes` });
    if (t.contenu && !['organisation', 'publique'].includes(t.appartenance)) ctx.addIssue({ code: 'custom', message: `${t.nom} est un \`contenu\`, lu de tous ceux qui lisent la table : \`organisation\` ou \`publique\`` });
  }
});
export type Manifeste = z.infer<typeof Manifeste>;

/** Les calculs et les indicateurs nomment des champs et des états qui existent, chiffrés là où ils se comptent. */
function lireLeMoteur(m: { readonly tables: readonly z.infer<typeof Table>[]; readonly indicateurs: readonly z.infer<typeof Indicateur>[] }, ctx: z.RefinementCtx): void {
  for (const t of m.tables) for (const c of t.champs) if (c.cumul) lireUnCumul(t, { ...c, cumul: c.cumul }, m.tables, ctx);
  for (const t of m.tables) for (const c of t.champs) if (c.depuis) lireUneValeurLue(t, c, m.tables, ctx);
  for (const t of m.tables) for (const c of t.champs.filter((x) => x.calcul)) {
    for (const n of c.calcul!.champs.filter((x): x is string => typeof x === 'string')) {
      const source = t.champs.find((x) => x.nom === n);
      if (!source || !CHIFFRES.includes(source.type)) ctx.addIssue({ code: 'custom', message: `${t.nom}.${c.nom} : ${n} n’est pas un champ chiffré de ${t.nom}` });
    }
    if (c.calcul!.champs.every((x) => typeof x === 'number')) ctx.addIssue({ code: 'custom', message: `${t.nom}.${c.nom} : un calcul lit au moins un champ de sa ligne` });
    const vus = new Set<string>(); // un calcul lit un autre calcul de sa ligne, jamais en revenant sur lui-même
    const remonte = (n: string | number): boolean => typeof n === 'string' && ((n === c.nom && vus.size > 0) || (!vus.has(n) && Boolean(vus.add(n)) && (t.champs.find((x) => x.nom === n)?.calcul?.champs ?? []).some(remonte)));
    if (remonte(c.nom)) ctx.addIssue({ code: 'custom', message: `${t.nom}.${c.nom} : ce calcul se lit lui-même par une chaîne de calculs` });
  }
  lireLesIndicateurs(m, ctx);
}

/** Les rôles des clients (`organisations: clients`) : qui s'inscrit, qui est invité comme client ; chacun a son espace. */
export const rolesDesClients = (m: Pick<Manifeste, 'organisations' | 'roles'>): string[] =>
  (m.organisations === 'clients' ? m.roles.filter((r) => r.obtenu === 'inscription' || r.client).map((r) => r.nom) : []);
/** Qui gère son organisation : le propriétaire et, les organisations isolées, qui s'inscrit et fonde la sienne (remplace le seul propriétaire : ce fondateur n'invitait ni ne lisait son équipe). */
export const rolesQuiGerent = (m: Pick<Manifeste, 'organisations' | 'roles'>): string[] =>
  m.roles.filter((r) => r.obtenu === 'proprietaire' || (m.organisations === 'plusieurs' && r.obtenu === 'inscription')).map((r) => r.nom);

/** Le rôle implicite d'une personne sans compte. Il n'est jamais déclaré dans `roles`. */
export const VISITEUR = 'visiteur';

/** Les colonnes que la base pose sur chaque ligne (`pipeline/la-base.ts`) : aucun champ ne porte leur nom. */
export const COLONNES_POSEES_PAR_LA_BASE: Readonly<Record<string, string>> = {
  id: 'l’identifiant de la ligne', created_at: 'sa date de création', owner_id: 'le compte qui l’a créée',
  auteur: 'le courriel de qui l’a créée', organisation_id: 'son organisation', etat: 'l’état de son cycle, quand elle en a un',
};
/** La colonne que la base pose sur une table à `personnes` : le compte dont la ligne est la fiche (unique, reliée par la console). */
export const COLONNE_DE_LA_FICHE = 'compte_id';

/** Celles qu'elle pose en plus sur une table qui reçoit des propositions de l'IA : leur provenance. */
export const COLONNES_DES_PROPOSITIONS: Readonly<Record<string, string>> = {
  origine: 'qui a proposé la ligne, une personne ou l’IA', ia_explication: 'ce que l’IA en dit', ia_confiance: 'la confiance de l’IA',
};

/**
 * L'app.json d'une app DÉJÀ livrée, relu par la plateforme pour la servir (automatisations, agents, vente, accès payé,
 * base reposée) : par sa forme seule, tel quel. Ni les contrôles croisés que le cadrage a tenus à sa livraison, ni ses
 * réparations : retirer un champ ici retirerait sa colonne sous le code qui l'écrit. `null` : sa forme ne se lit pas.
 */
export function relireUnManifesteLivre(json: unknown): Manifeste | null {
  const forme = Manifeste.innerType().safeParse(lesAccesTraduits(json).valeur);
  return forme.success ? forme.data : null;
}

interface LuSansCompte { readonly nom: string; readonly appartenance: string; readonly parent?: string; readonly lecture: readonly string[] }

/** Une ligne de cette table se lit sans compte : publique, ou rattachée à une mère qui se lit sans compte. PUR. */
export function seLitSansCompte(tables: readonly LuSansCompte[], t: LuSansCompte, vus = new Set<string>()): boolean {
  if (!t.lecture.includes(VISITEUR)) return false;
  if (t.appartenance === 'publique') return true;
  const mere = t.appartenance === 'rattachee' && t.parent && !vus.has(t.parent) ? tables.find((x) => x.nom === t.parent) : undefined;
  return Boolean(mere) && seLitSansCompte(tables, mere!, vus.add(t.parent!));
}

/**
 * Ce que `visiteur` veut dire dans une `lecture`, rendu vrai, et dit. PURE.
 * - INCIDENT 25/11 (Antoine, une boutique de bières) : le catalogue d'une table publique qui se vend était lu du seul
 *   propriétaire ; le visiteur, qui achète, voyait « Votre compte ne peut pas faire ce geste ». Ce qui se vend sur une
 *   table publique se lit de qui l'achète : `visiteur` est ajouté.
 * - `visiteur` sur une table qui ne se lit pas sans compte ne donnait rien, en silence : une table `organisation` d'une
 *   app à organisation unique devient `publique` (tous la lisaient déjà) ; ailleurs, `visiteur` est retiré.
 */
export function lesLecturesReparees(json: unknown): { readonly valeur: unknown; readonly repare: readonly string[] } {
  const brut = json as { tables?: unknown; organisations?: unknown } | null;
  if (!brut || typeof brut !== 'object' || !Array.isArray(brut.tables)) return { valeur: json, repare: [] };
  const repare: string[] = [];
  type T = { nom?: unknown; vente?: unknown; appartenance?: unknown; parent?: unknown; lecture?: unknown };
  const lues = (brut.tables as unknown[]).filter((t): t is T => Boolean(t) && typeof t === 'object' && Array.isArray((t as T).lecture));
  let tables = (brut.tables as unknown[]).map((t) => {
    const x = t as T;
    if (!lues.includes(x) || !x.vente || x.appartenance !== 'publique' || (x.lecture as unknown[]).includes(VISITEUR)) return t;
    repare.push(`${String(x.nom)} se vend : ses lignes sont lues de qui achète (\`${VISITEUR}\` ajouté à \`lecture\`)`);
    return { ...x, lecture: [...(x.lecture as unknown[]), VISITEUR] };
  });
  const une = (brut.organisations ?? 'une') === 'une';
  tables = tables.map((t) => {
    const x = t as T;
    if (!x || typeof x !== 'object' || !Array.isArray(x.lecture) || !x.lecture.includes(VISITEUR) || x.appartenance !== 'organisation' || !une) return t;
    repare.push(`${String(x.nom)} se lit sans compte : \`appartenance\` devient \`publique\` (une seule organisation, qui la lisait déjà toute)`);
    return { ...x, appartenance: 'publique' };
  });
  const formes = tables.filter((t): t is LuSansCompte => Boolean(t) && typeof t === 'object' && Array.isArray((t as T).lecture)
    && typeof (t as T).nom === 'string' && typeof (t as T).appartenance === 'string') as LuSansCompte[];
  tables = tables.map((t) => {
    const x = t as T;
    if (!formes.includes(x as LuSansCompte) || !(x.lecture as unknown[]).includes(VISITEUR) || seLitSansCompte(formes, x as LuSansCompte)) return t;
    repare.push(`${String(x.nom)} : une ligne ${String(x.appartenance)} ne se lit pas sans compte (seule une table \`publique\`, ou rattachée à une table lue sans compte, l’est) : \`${VISITEUR}\` retiré de \`lecture\``);
    return { ...x, lecture: (x.lecture as unknown[]).filter((r) => r !== VISITEUR) };
  });
  return repare.length ? { valeur: { ...brut, tables }, repare } : { valeur: json, repare: [] };
}

/** Lit app.json au cadrage, ses liens et ses cycles réparés et dits. Rend le manifeste, ou la liste exacte de ce qui ne tient pas. */
export function lireLeManifeste(json: unknown): { ok: true; manifeste: Manifeste; repare: readonly string[] } | { ok: false; erreurs: string[]; repare: readonly string[] } {
  const acces = lesAccesTraduits(json);
  const demandes = lesDemandesReparees(acces.valeur);
  const liens = lesLiensRepares(demandes.valeur);
  const cycles = lesCyclesRepares(liens.valeur);
  const envois = lesEnvoisRepares(cycles.valeur);
  const ventes = lesLecturesReparees(envois.valeur), repare = [...acces.repare, ...demandes.repare, ...liens.repare, ...cycles.repare, ...envois.repare, ...ventes.repare];
  const r = Manifeste.safeParse(ventes.valeur);
  if (r.success) return { ok: true, manifeste: avecSesEtatsOuverts(r.data), repare };
  return { ok: false, erreurs: lesErreursLues(r.error.issues), repare };
}

/**
 * Ce que Claude envoie (`create_project`, `configure_backend`) : ses formes spontanées relues d'abord
 * (`les-formes-reparees.ts`), puis lu comme tout app.json. La console, elle, garde ses refus (une police inconnue
 * choisie par la personne n'est pas remplacée). PURE.
 */
export function lireCeQueClaudeEnvoie(json: unknown): ReturnType<typeof lireLeManifeste> {
  const formes = lesFormesReparees(json);
  const r = lireLeManifeste(formes.valeur);
  return { ...r, repare: [...formes.repare, ...r.repare] };
}
