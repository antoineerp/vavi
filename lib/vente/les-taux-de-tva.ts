// Repris de constructor-v13@5bb786e : lib/referentiels/les-taux-de-tva.ts
/**
 * LES TAUX DE TVA DES PAYS OÙ UNE BOUTIQUE VAVI VEND — un référentiel légal, DATÉ et SOURCÉ : la seule donnée de métier
 * de la vente (un taux par pays, que la loi fixe ; aucune app ne le choisit).
 *
 * Il ne couvre que les pays dont le taux est national. Le Canada et les États-Unis n'y sont pas : leur taxe dépend de la
 * province, de l'État ou du produit, et la vente dit alors « non calculable » (`null`), jamais 0. Un taux vieillit : la
 * version et la source sont dites.
 */

export const VERSION_DES_TAUX = '2026-01';
export const SOURCE_DES_TAUX = 'Commission européenne, « VAT rates applied in the Member States » (janvier 2026) ; '
  + 'HMRC (Royaume-Uni) ; Administration fédérale des contributions (Suisse, taux 2024)';

export interface TauxDUnPays {
  /** Le taux normal, en % : celui d'un article qui ne dit pas le sien. */
  readonly normal: number;
  /** Les taux réduits que la loi du pays connaît, en %. */
  readonly reduits: readonly number[];
  /** La mention légale d'un vendeur en franchise, quand le pays la nomme (sinon le libellé générique suffit). */
  readonly franchise: string | null;
}

export const TAUX_DE_TVA: Readonly<Record<string, TauxDUnPays>> = {
  FR: { normal: 20, reduits: [10, 5.5, 2.1], franchise: 'TVA non applicable, art. 293 B du CGI' },
  BE: { normal: 21, reduits: [12, 6], franchise: 'Régime particulier de franchise des petites entreprises' },
  LU: { normal: 17, reduits: [14, 8, 3], franchise: null },
  CH: { normal: 8.1, reduits: [3.8, 2.6], franchise: null },
  GB: { normal: 20, reduits: [5], franchise: null },
  IE: { normal: 23, reduits: [13.5, 9, 4.8], franchise: null },
  DE: { normal: 19, reduits: [7], franchise: 'Gemäß § 19 UStG wird keine Umsatzsteuer berechnet' },
  AT: { normal: 20, reduits: [13, 10], franchise: null },
  ES: { normal: 21, reduits: [10, 4], franchise: null },
  IT: { normal: 22, reduits: [10, 5, 4], franchise: null },
  NL: { normal: 21, reduits: [9], franchise: null },
  PT: { normal: 23, reduits: [13, 6], franchise: null },
};

/** Les taux d'un pays ; `null` : ce référentiel ne le porte pas (non calculable, jamais 0). PUR. */
export const lesTauxDuPays = (pays: string | null): TauxDUnPays | null => (pays ? TAUX_DE_TVA[pays] ?? null : null);
