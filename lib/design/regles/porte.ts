// Repris de constructor-v13@5bb786e : generateur-v2/regles/porte.ts
/**
 * Ce qu'une app porte, lu d'app.json et de lui seul : ses fonctions déclarées, et ce que ses champs et ses langues
 * impliquent. Une règle qui ne concerne qu'une app qui porte quelque chose le nomme (`Regle.porte`) : le modèle ne lit
 * pas ce qui ne le concerne pas.
 */
import type { Fonctions, Manifeste } from '../../backend/app/manifeste';
import { estUnePiece } from '../../backend/pipeline/sql';

export type Porte = Readonly<Fonctions & {
  /** Un champ `fichier` ou `image` : la pièce jointe d'une ligne. */
  readonly fichiers: boolean;
  /** Un fichier que la plateforme mesure (une valeur lue `depuis` un champ `fichier`) : une pièce en relief. */
  readonly reliefs: boolean;
  /** Un champ `image` : la photo d'une ligne. */
  readonly photos: boolean;
  /** Plus d'une langue. */
  readonly langues: boolean;
  /** Un champ calculé par la base, ou un indicateur. */
  readonly moteur: boolean;
  /** Des rôles : des écrans de travail derrière un compte. */
  readonly comptes: boolean;
  /** Une table à photo qui se lit sans compte : des lignes montrées sur la vitrine. */
  readonly vitrine: boolean;
  /** Une table dont chaque ligne occupe une période : une frise. */
  readonly periodes: boolean;
  /** Une période `exclusive` : des places qui se réservent, que la base ne laisse pas prendre deux fois. */
  readonly reservations: boolean;
  /** Des écrans déclarés depuis la demande (`ecrans`). */
  readonly ecrans: boolean;
  /** Des agents déclarés. */
  readonly agents: boolean;
  /** Un rôle obtenu par `paiement`. */
  readonly acces: boolean;
  /** Une table `resultat` : ce que la personne servie obtient, montré sur la vitrine. */
  readonly resultat: boolean;
  /** Une table où un visiteur envoie sans compte (`visiteur` dans son `ecriture`). */
  readonly sansCompte: boolean;
  /** Un parcours principal déclaré : pour qui la création existe d'abord. */
  readonly parcours: boolean;
  /** Une app où personne n'arrive sans compte : ni inscription, ni achat, ni table lue sans compte. */
  readonly privee: boolean;
}>;

/** Une table dont les lignes se montrent sur la vitrine : elle se lit sans compte et porte une photo. */
export const estMontree = (t: Manifeste['tables'][number]): boolean =>
  t.appartenance === 'publique' && t.lecture.includes('visiteur') && t.champs.some((c) => c.type === 'image');

export function ceQueLAppPorte(m: Manifeste): Porte {
  return { ...m.fonctions, fichiers: m.tables.some((t) => t.champs.some(estUnePiece)),
    reliefs: m.tables.some((t) => t.champs.some((c) => c.depuis && t.champs.find((x) => x.nom === c.depuis!.champ)?.type === 'fichier')),
    photos: m.tables.some((t) => t.champs.some((c) => c.type === 'image')), langues: m.langues.autres.length > 0,
    moteur: m.indicateurs.length > 0 || m.tables.some((t) => t.champs.some((c) => c.calcul || c.cumul)),
    comptes: m.roles.length > 0, vitrine: m.tables.some(estMontree), periodes: m.tables.some((t) => t.periode), reservations: m.tables.some((t) => t.periode?.exclusive), agents: m.agents.length > 0, ecrans: m.ecrans.length > 0,
    acces: m.roles.some((r) => r.obtenu === 'paiement'), resultat: Boolean(m.resultat), sansCompte: m.tables.some((t) => t.ecriture.includes('visiteur')), parcours: Boolean(m.parcours),
    privee: m.nature === 'app' && m.roles.length > 0 && m.roles.every((r) => ['proprietaire', 'invitation', 'habilitation'].includes(r.obtenu))
      && !m.tables.some((t) => t.lecture.includes('visiteur') || t.ecriture.includes('visiteur')) };
}
