# vavi platform files: their API (declarations only). Read a whole file with `read_files` only if you need its code.
Template versions (write the conventions of these exact versions): react 19.3.0, react-router 7.18.4, vite 7.3.6, typescript 5.9.3, tailwindcss 4.3.3, @tanstack/react-query 5.103.2, framer-motion 13.4.1, zod 4.6.5.

## src/lib/acces.ts
/**
 * Ce qu'une page déclare, par ses exports. La page est la seule source de son accès, de son titre au menu et de son
 * icône : le routeur, le menu, la garde et la vérification les lisent tous dans les faits que le build en tire.
 * La garde n'est pas la frontière de sécurité : la sécurité des lignes de la base l'est.
 */
export type Acces = {
  readonly nature: 'public';
} | {
  readonly nature: 'compte';
} | {
  readonly nature: 'role';
  readonly roles: readonly [string, ...string[]];
};
export declare const PUBLIC: Acces;
export declare const COMPTE: Acces;
export declare const reserveA: (roles_0: string, ...roles: string[]) => Acces;
export interface ModuleDePage {
  readonly default: ComponentType;
  /** Absent : publique. */
  readonly acces?: Acces;
  /** Le libellé au menu. Absent : la page est servie mais pas au menu (une fiche sous `$id`). */
  readonly titre?: string;
  /** Un nom d'icône de lucide-react, en PascalCase. */
  readonly icone?: string;
  /** Son rang au menu, croissant. */
  readonly ordre?: number;
}
/** Un compte qui porte ces rôles peut-il ouvrir une page de cet accès ? La garde et le menu lisent cette seule règle. */
/** Le rôle que le compte porte, autre que celui sous lequel l'onglet voit l'app, qui ouvre cet écran ; `null` sans essai ou sans tel rôle. */
export declare function unAutreRoleQuiOuvre(acces: Acces, portes: readonly string[], essaye: string | null): string | null;
export declare function peutOuvrir(acces: Acces, compte: boolean, roles: readonly string[]): boolean;

## src/lib/donnees.tsx
/**
 * Lire et écrire les données de l'app, typées par ses tables.
 *
 * - Une table et ses colonnes sont celles d'app.json (`src/donnees/types.ts`, généré) : une colonne inventée ne compile pas.
 * - Une lecture a trois états, et `<Lignes>` exige de dire chacun : l'attente, la panne, le vide.
 * - Une écriture rend ce que la base a répondu : la ligne écrite, ou un refus qui dit pourquoi.
 * - L'état d'une ligne à cycle ne s'écrit pas : il avance par une transition déclarée, que la base vérifie.
 */
export type Json = string | number | boolean | null | {
  readonly [cle: string]: Json;
} | readonly Json[];
/**
 * Les tables de l'app. Celles de la plateforme sont ici, lues seulement (`membres`, `membres_invitations`) ;
 * `src/donnees/types.ts`, généré depuis app.json, y ajoute les siennes.
 */
export interface TablesDeLApp {
  membres: {
    ligne: {
      readonly compte_id: string;
      readonly email: string | null;
      readonly role: string;
      readonly organisation_id: string;
      readonly responsable_id: string | null;
      readonly created_at: string;
    };
    nouvelle: never;
    modification: never;
  };
  membres_invitations: {
    ligne: {
      readonly email: string;
      readonly role: string;
      readonly organisation_id: string;
      readonly responsable_id: string | null;
      readonly created_at: string;
    };
    nouvelle: never;
    modification: never;
  };
}
export type NomDeTable = Extract<keyof TablesDeLApp, string>;
export type Ligne<T extends NomDeTable> = TablesDeLApp[T]['ligne'];
export type Nouvelle<T extends NomDeTable> = TablesDeLApp[T]['nouvelle'];
export type Modification<T extends NomDeTable> = TablesDeLApp[T]['modification'];
/** Ce que la base rend au plus en une lecture. Au-delà, une lecture entière est refusée, jamais coupée en silence. */
export declare const LIMITE_DE_LECTURE = 1000;
export interface DemandeDeLecture<T extends NomDeTable> {
  readonly egal?: {
    readonly [C in keyof Ligne<T>]?: Ligne<T>[C];
  };
  readonly ordre?: {
    readonly colonne: Extract<keyof Ligne<T>, string>;
    readonly sens?: 'croissant' | 'decroissant';
  };
  /** Les premières lignes seulement, selon `ordre`. Sans limite : toutes, ou un refus. */
  readonly limite?: number;
}
export interface LignesLues<L> {
  readonly lignes: readonly L[];
  readonly total: number | null;
}
export type EtatDeLecture<L> = {
  readonly forme: 'attente';
} | Resultat<LignesLues<L>>;
/** Lire des lignes : `attente`, puis une donnée ou un refus. Relue d'elle-même après une écriture sur la même table. */
export declare function useLecture<T extends NomDeTable>(table: T, demande?: DemandeDeLecture<T>): EtatDeLecture<Ligne<T>>;
/** Le geste qui lance, sous un état vide : une adresse, ou une action. */
export type GesteDuVide = {
  readonly libelle: string;
  readonly vers: string;
} | {
  readonly libelle: string;
  readonly action: () => void;
};
export interface LectureProps<L> {
  readonly lecture: EtatDeLecture<L>;
  /** Ce qu'on attend, dit à la personne. */
  readonly attente: string;
  /** Ce qui n'a pas pu se lire. La raison s'ajoute seule. */
  readonly panne: string;
  /** Ce qui manque, et le geste qui lance quand quelqu'un ici peut créer. */
  readonly vide: {
    readonly quoi: string;
    readonly geste?: GesteDuVide;
  };
  readonly children: (lignes: readonly L[]) => ReactNode;
}
export declare function Lecture<L>({ lecture, attente, panne, vide, children }: LectureProps<L>): any;
export type LignesProps<T extends NomDeTable> = Omit<LectureProps<Ligne<T>>, 'lecture'> & {
  readonly table: T;
  readonly demande?: DemandeDeLecture<T>;
};
/** Lire une table et rendre ses lignes : les lignes n'existent que dans les enfants. */
export declare function Lignes<T extends NomDeTable>({ table, demande, ...rendu }: LignesProps<T>): any;
export interface Ecriture<T extends NomDeTable> {
  readonly creer: (valeurs: Nouvelle<T>) => Promise<Resultat<Ligne<T>>>;
  readonly modifier: (id: string, valeurs: Modification<T>) => Promise<Resultat<Ligne<T>>>;
  readonly supprimer: (id: string) => Promise<Resultat<null>>;
  /** Vrai pendant une écriture, pour que le geste ne parte pas deux fois. */
  readonly enCours: boolean;
}
/**
 * Après une écriture réussie, TOUT ce qui est affiché se relit : la base recalcule ailleurs ce qu'elle touche (un cumul, un
 * calcul, un indicateur, une transition entraînée). Ce qu'il remplace : la relecture de la seule table écrite ; un
 * règlement saisi laissait le reste dû, le total du client et le tableau de bord à leur valeur d'avant.
 */
export declare const relireLaBase: (client: Pick<ReturnType<typeof useQueryClient>, "invalidateQueries">) => Promise<void>;
export declare function useEcriture<T extends NomDeTable>(table: T): Ecriture<T>;
export type TableAvecCycle = {
  [T in NomDeTable]: TablesDeLApp[T] extends {
    transitions: string;
  } ? T : never;
}[NomDeTable];
export type TransitionDe<T extends TableAvecCycle> = TablesDeLApp[T] extends {
  transitions: infer X extends string;
} ? X : never;
/** Les tables dont une colonne porte une pièce jointe, et ces colonnes : elles s'écrivent par `<PieceJointe>`, jamais par `useEcriture`. */
export type TableAvecPiece = {
  [T in NomDeTable]: TablesDeLApp[T] extends {
    pieces: string;
  } ? T : never;
}[NomDeTable];
export type PieceDe<T extends TableAvecPiece> = TablesDeLApp[T] extends {
  pieces: infer X extends string;
} ? X : never;
/** Les tables où l'IA propose des lignes (`propositions` dans app.json) : `<ProposerParLIA>` y écrit, par la plateforme. */
export type TableAvecPropositions = {
  [T in NomDeTable]: TablesDeLApp[T] extends {
    propositions: true;
  } ? T : never;
}[NomDeTable];
/** Faire avancer une ligne : la base vérifie l'état de départ et le rôle, puis écrit l'état atteint et le journal. */
export declare function useTransiter<T extends TableAvecCycle>(table: T): {
  transiter: (id: string, transition: TransitionDe<T>, motif?: string) => Promise<Resultat<string>>;
  enCours: boolean;
};
/** Les transitions que ce compte peut faire sur cette ligne, calculées par la base avec la même règle que la transition. */
export declare function useTransitionsPossibles<T extends TableAvecCycle>(table: T, id: string): {
  readonly forme: 'attente';
} | Resultat<readonly TransitionDe<T>[]>;
/** Le client des lectures, vidé quand la session change : les lignes d'une personne ne restent pas à l'écran de la suivante. */
export declare const clientDesLectures: any;

## src/lib/session.tsx
/**
 * La session : le compte connecté, ses rôles, et où il arrive après être entré.
 *
 * Les rôles viennent de la base, par la fonction `rejoindre` du schéma de l'app (qui pose d'abord ceux que l'inscription
 * donne). « Pas de rôle » et « rôles illisibles » ne se confondent pas : une panne réseau n'enferme personne dehors.
 *
 * Dans l'aperçu, la plateforme fait entrer le propriétaire avec son compte : un jeton à usage unique après `#entree=`,
 * échangé contre une session quand l'onglet n'en a pas, et effacé de l'adresse dès la lecture.
 */
export interface Compte {
  readonly id: string;
  readonly email: string;
}
export interface Session {
  readonly compte: Compte | null;
  readonly roles: readonly string[];
  readonly rolesLus: boolean;
  readonly rolesIllisibles: boolean;
  readonly enChargement: boolean;
  seConnecter(email: string, motDePasse: string): Promise<{
    erreur: string | null;
  }>;
  /** `aConfirmer` : le compte est créé et attend la confirmation de son courriel. */
  sInscrire(email: string, motDePasse: string, resterIci?: boolean): Promise<{
    erreur: string | null;
    aConfirmer?: boolean;
  }>;
  seDeconnecter(): Promise<void>;
  relireLesRoles(): Promise<void>;
  reinitialiserLeMotDePasse(email: string): Promise<{
    erreur: string | null;
  }>;
  changerLeMotDePasse(motDePasse: string): Promise<{
    erreur: string | null;
  }>;
}
/** L'adresse de la porte, servie par le cadre. */
export declare const PORTE = "/connexion";
export declare const MON_COMPTE = "/mon-compte";
export declare function useSession(): Session;
export declare function FournisseurDeSession({ children }: {
  children: ReactNode;
}): any;

## src/briques/chrome.tsx
/**
 * Ce que le cadre tend au chrome de l'agent (`src/Chrome.tsx`) : le menu de la personne et la commande du compte.
 * Le chrome est à l'agent : en-tête, menu, pied. Il monte `<CommandeDuCompte />` et rend chaque entrée de `menu` ;
 * une app qui vend monte aussi `<LienDuPanier />` ; une app à plusieurs langues, `<ChoixDeLaLangue />` ; la vitrine
 * ferme sur `<PiedDePage />`.
 *
 * Ce qu'il remplace : le compte et le panier écrits en texte (« Se connecter », « Panier ») ; un pied laissé à l'écriture
 * de chaque app, réduit à une ligne ; et, sur la vitrine, les écrans de travail d'une personne connectée listés au menu.
 */
export interface ChromeProps {
  /** Les entrées de cette surface que cette personne peut ouvrir, dans l'ordre déclaré par les pages : sur la vitrine, ses
   * pages publiques ; derrière un compte, ses écrans de travail. Son espace s'ouvre par `<CommandeDuCompte />`. */
  readonly menu: readonly EntreeDuMenu[];
  /** `public` sur une page de la vitrine, `travail` derrière un compte. */
  readonly surface: 'public' | 'travail';
  readonly children: ReactNode;
}
/**
 * Entrer, ou le compte connecté : son icône ouvre son espace, son compte et la sortie. À monter dans l'en-tête, une seule
 * fois. Une app sans rôle n'a pas de compte à ouvrir : la commande n'y rend rien.
 */
export declare function CommandeDuCompte({ className, legende }: {
  readonly className?: string;
  readonly legende?: boolean;
}): any;
/** Le sac du panier et la pastille de son nombre d'articles, à monter dans l'en-tête d'une app qui vend. Ailleurs, rien. */
export declare function LienDuPanier({ className, legende }: {
  readonly className?: string;
  readonly legende?: boolean;
}): any;
/**
 * La même page dans chaque langue de l'app, à monter dans l'en-tête d'une app à plusieurs langues. Ailleurs, il ne rend
 * rien. Changer de langue recharge la page : la langue est dans l'adresse.
 */
export declare function ChoixDeLaLangue({ className }: {
  readonly className?: string;
}): any;
/** Une colonne du pied : son intitulé, écrit par l'app, et ses liens. */
export interface ColonneDuPied {
  readonly titre: string;
  readonly liens: readonly {
    readonly libelle: string;
    readonly vers: string;
  }[];
}
/**
 * Le pied de la vitrine, sur la bande sombre de la direction : la marque et la phrase de l'app, ses colonnes de liens
 * (sans `colonnes` : les pages de `menu`), les coordonnées de son éditeur (`editeur` d'app.json, chacune seulement si elle
 * est connue), puis le © et les pages que le cadre sert : mentions légales, confidentialité, conditions de vente, crédits.
 * Le pied tient son espace au-dessus de lui, au fond de la page : le dernier bloc d'une page ne le touche jamais. Ce qu'il
 * remplace : une mesure qui disait à l'agent un bloc collé au pied, une fois, sans le tenir.
 */
export declare function PiedDePage({ menu, marque, phrase, colonnes }: {
  readonly menu: readonly EntreeDuMenu[];
  readonly marque?: ReactNode;
  readonly phrase?: string;
  readonly colonnes?: readonly ColonneDuPied[];
}): any;

## src/briques/vitrine.tsx
/**
 * Les pièces de la vitrine, habillées par la direction de l'app (ses jetons) : l'ouverture de l'accueil, ses sections
 * illustrées et son appel final, l'en-tête d'une page publique, la carte et la fiche d'une ligne montrée, leur grille, la
 * recherche en pilule et la barre de promesses de l'en-tête, l'entrée du menu marquée quand sa page est ouverte, la liste
 * à filets. L'agent les monte et écrit leurs textes ; leur forme est la même d'une app à l'autre, seule la direction la change.
 */
export interface Geste {
  readonly libelle: string;
  readonly vers: string;
}
/** Pleine largeur, quelle que soit la colonne où le chrome la pose. */
export declare const PLEINE_LARGEUR = "relative left-1/2 w-screen max-w-[100vw] -translate-x-1/2";
/**
 * L'ouverture de l'accueil : un fond uni, un titre très grand en deux lignes au plus, une phrase, deux gestes en pilule
 * (le premier plein), les promesses d'app.json (chacune tenue par ce qu'il déclare), et à droite ce que l'on vient chercher
 * (`visuel` : la photo du sujet, ou l'app elle-même par `<ApercuDuProduit />`). Sans visuel, tout se centre.
 */
export declare function Ouverture({ surtitre, titre, chapeau, gestes, visuel }: {
  readonly surtitre?: string;
  readonly titre: string;
  readonly chapeau: string;
  readonly gestes: readonly [Geste, Geste?];
  readonly visuel?: ReactNode;
}): any;
/**
 * Une section de l'accueil : un texte (surtitre, titre, phrase, quelques points, un geste) à côté de ce qu'il montre
 * (`visuel` : une `<Photo>`, `<ApercuDuProduit table="…" />`, `<ExempleDuResultat />`, `<Dessin>`). `inverse` passe le visuel à
 * gauche : d'une section à la suivante, on alterne. Elle remplace la page d'accueil en paragraphes sans image.
 */
export declare function SectionIllustree({ surtitre, titre, texte, points, geste, visuel, inverse }: {
  readonly surtitre?: string;
  readonly titre: string;
  readonly texte: string;
  readonly points?: readonly string[];
  readonly geste?: Geste;
  readonly visuel: ReactNode;
  readonly inverse?: boolean;
}): any;
/** La dernière section de l'accueil : une bande pleine de l'accent, une phrase qui décide et le geste principal. */
export declare function AppelFinal({ titre, chapeau, geste }: {
  readonly titre: string;
  readonly chapeau?: string;
  readonly geste: Geste;
}): any;
/** Le haut d'une page publique autre que l'accueil : son titre, une phrase, et ce qui s'y range à droite (`children`). */
export declare function EnTeteDePage({ surtitre, titre, chapeau, children }: {
  readonly surtitre?: string;
  readonly titre: string;
  readonly chapeau?: string;
  readonly children?: ReactNode;
}): any;
/** La grille des cartes : deux colonnes au téléphone, jusqu'à quatre au bureau, toutes de la même taille. */
export declare function GrilleDObjets({ children, colonnes }: {
  readonly children: ReactNode;
  readonly colonnes?: 3 | 4;
}): any;
/** Une ligne montrée : sa photo d'abord (`photo`, la chose elle-même), son nom, une précision, son prix. */
export declare function CarteDObjet({ vers, photo, titre, detail, prix, etiquette }: {
  readonly vers: string;
  readonly photo: ReactNode;
  readonly titre: string;
  readonly detail?: string;
  readonly prix?: string;
  readonly etiquette?: string;
}): any;
/**
 * La page d'une ligne : la photo en grand à gauche (et, avec `galerie`, ses autres vues en vignettes qui la remplacent),
 * et à droite, qui reste à l'écran, son nom, son prix, sa description, les gestes (`children` : l'ajout au panier, la
 * réservation…), ses `caracteristiques` en tableau et les promesses qui rassurent.
 */
export declare function FicheDObjet({ photo, galerie, surtitre, titre, prix, description, caracteristiques, promesses, children }: {
  readonly photo: ReactNode;
  readonly galerie?: readonly ReactNode[];
  readonly surtitre?: string;
  readonly titre: string;
  readonly prix?: string;
  readonly description?: ReactNode;
  readonly caracteristiques?: readonly (readonly [string, string])[];
  readonly promesses?: readonly string[];
  readonly children?: ReactNode;
}): any;
/** La recherche de l'en-tête, en pilule : elle ouvre `vers` avec ce qui est cherché (`?q=`), que la page lit par `useRecherche`. */
export declare function Recherche({ vers, libelle, className }: {
  readonly vers: string;
  readonly libelle: string;
  readonly className?: string;
}): any;
/** Ce que la recherche de l'en-tête a demandé, en minuscules ; vide quand rien n'est cherché. */
export declare function useRecherche(): string;
/** La barre fine au-dessus de l'en-tête : les promesses de l'app, deux à quatre, très courtes. */
export declare function BarreDePromesse({ promesses }: {
  readonly promesses: readonly string[];
}): any;
/** Une entrée du menu ; celle de la page ouverte est marquée (soulignée de l'accent, `aria-current`). */
export declare function LienDuMenu({ entree, className }: {
  readonly entree: EntreeDuMenu;
  readonly className?: string;
}): any;
/**
 * RETIRÉE de toutes les générations par le propriétaire : aucune règle ne la propose plus, et la mesure des pages
 * (`controles/pages.ts`, les listes à filets) la rend à l'agent là où une page la monte. Elle reste seulement pour
 * qu'une app livrée qui la montait encore se construise ; une page la remplace par des photos ou une autre composition.
 */
export declare function ListeAFilets({ elements }: {
  readonly elements: readonly {
    readonly titre: string;
    readonly texte: string;
    readonly vers?: string;
    readonly libelle?: string;
  }[];
}): any;

## src/briques/vitrine-des-exemples.tsx
/**
 * Les mises en page des exemples de design (`generateur-v2/pipeline/les-exemples-de-design.ts`), offertes aux pages
 * publiques : la grande photo pleine largeur qui porte le titre, la mosaïque de photos de tailles différentes, le
 * carrousel de photos qui défile au geste. Habillées par la direction de l'app (ses jetons) ; l'agent les monte là où
 * l'exemple qu'il suit a cette forme, et écrit leurs textes.
 *
 * Ce qu'elles remplacent : une vitrine qui n'avait qu'une forme d'accueil (le texte à côté d'un visuel, sur un fond
 * uni), si bien que les exemples montrés au modèle restaient hors de sa portée.
 */
/**
 * Le haut d'une page en grande photo : la photo occupe toute la largeur et presque tout l'écran, le titre très grand, une
 * phrase, deux gestes et les promesses d'app.json posés dessus, en bas à gauche ou au centre (`place`).
 */
export declare function GrandePhoto({ photo, surtitre, titre, chapeau, gestes, place }: {
  /** Une `<Photo nom="…" prioritaire />`. */
  readonly photo: ReactNode;
  readonly surtitre?: string;
  readonly titre: string;
  readonly chapeau?: string;
  readonly gestes?: readonly [Geste, Geste?];
  readonly place?: 'gauche' | 'centre';
}): any;
/**
 * La mosaïque : des tuiles de photos sur quatre colonnes au bureau, deux au téléphone ; une tuile `grande` en prend
 * quatre. Pour que chaque rangée se remplisse : une grande et quatre petites, ou quatre petites par rangée.
 */
export declare function Mosaique({ children }: {
  readonly children: ReactNode;
}): any;
/** Une tuile de la mosaïque : sa photo la remplit, son nom (et son prix) posés en bas sur un voile. */
export declare function TuileDeMosaique({ vers, photo, titre, detail, prix, grande }: {
  readonly vers: string;
  readonly photo: ReactNode;
  readonly titre: string;
  readonly detail?: string;
  readonly prix?: string;
  readonly grande?: boolean;
}): any;
export interface Diapo {
  readonly photo: ReactNode;
  readonly titre: string;
  readonly chapeau?: string;
  readonly geste?: Geste;
}
/**
 * Le carrousel : une photo large à la fois, son titre et son geste posés dessus, les flèches et les points pour passer
 * à la suivante. Il ne défile jamais seul. Toutes les diapos sont dans la page (pré-rendue) ; une seule se montre.
 */
export declare function Carrousel({ diapos, libelle }: {
  readonly diapos: readonly Diapo[];
  readonly libelle: string;
}): any;

## src/briques/travail.tsx
/**
 * Les pièces des écrans de travail, derrière un compte : la coquille (la marque et le menu dans une colonne, le fil
 * « marque / écran » en haut, la page à côté ; un tiroir au téléphone), le haut d'un écran (où suis-je, ce qui compte, que
 * faire ensuite) et la carte qui range un bloc. Le chrome de l'agent monte la coquille quand `surface` vaut `travail`.
 * Leur allure suit la direction (`direction.travail`, 10/11) : `affirme`, la colonne sombre et les grands titres ; `sobre`,
 * la colonne claire et des titres courants. Ce qu'elle remplace : une seule allure, sombre, qu'aucune app à colonne claire
 * (Qualite.cloud, jointe en ZIP) ne pouvait garder.
 *
 * Ce qu'il remplace (interdit 9, la même app faite à la main à côté) : une colonne claire où le nom de l'app
 * s'écrivait en texte courant, des titres maigres, et une page bornée à 72 rem où un tableau à côté d'un encadré défilait
 * dans sa carte, ses colonnes coupées.
 */
/**
 * La marque écrite : le nom en gras serré, son dernier mot dans une teinte claire de l'accent, lisible sur la colonne
 * sombre. Un logo donné (`marque` qui n'est pas un texte) se montre tel quel.
 */
export declare function Marque({ marque }: {
  readonly marque: ReactNode;
}): any;
/** La coquille des écrans de travail : `marque` (le nom de l'app, ou son logo), `menu` reçu du chrome, la page. */
export declare function CoquilleDeTravail({ marque, menu, children, outils }: {
  readonly marque: ReactNode;
  readonly menu: readonly EntreeDuMenu[];
  readonly children: ReactNode;
  /** Ce qui se range en haut à droite de chaque écran (le panier, la langue…), à côté du compte. */
  readonly outils?: ReactNode;
}): any;
/**
 * Le haut d'un écran de travail : le surtitre (la partie de l'app), le titre qui dit ce qui compte, une phrase, les
 * gestes de l'écran à droite (`children`), et une alerte quand quelque chose attend la personne.
 */
export declare function EnTeteDEcran({ surtitre, titre, chapeau, alerte, children }: {
  readonly surtitre?: string;
  readonly titre: ReactNode;
  readonly chapeau?: string;
  readonly alerte?: ReactNode;
  readonly children?: ReactNode;
}): any;
/** Un bloc d'écran : son surtitre, son titre, son contenu, et le lien qui en montre plus. */
export declare function Carte({ surtitre, titre, children, plus, className }: {
  readonly surtitre?: string;
  readonly titre?: string;
  readonly children: ReactNode;
  readonly plus?: {
    readonly libelle: string;
    readonly vers: string;
  };
  readonly className?: string;
}): any;

## src/lib/navigation.ts
export interface EntreeDuMenu {
  readonly vers: string;
  readonly libelle: string;
  readonly icone: string | null;
  /** `public` : une page de la vitrine ; `travail` : une page derrière un compte. */
  readonly surface: 'public' | 'travail';
}
/**
 * Les entrées du menu de `surface` que cette personne peut ouvrir, dans l'ordre déclaré : la vitrine ne liste que ses pages
 * publiques, même à qui est connecté (son espace s'ouvre par le compte) ; derrière un compte, ses écrans de travail.
 */
export declare function menuPour(compte: boolean, roles: readonly string[], surface: EntreeDuMenu['surface']): readonly EntreeDuMenu[];
/** Le titre d'une page dans la langue de la page (celle de l'app quand il n'y est pas traduit). */
export declare function titreDe(p: FaitDePage): string | null;
/**
 * Où arrive une personne qui vient d'entrer : l'écran qu'app.json lui destine (`arrivee.ts`), sinon la première page
 * réservée à l'un de ses rôles, sinon la première derrière un compte.
 */
export declare function arriveePour(roles: readonly string[]): string;
export declare const PAGES: any;
