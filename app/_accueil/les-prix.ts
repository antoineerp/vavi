/**
 * PURE — les prix de la page d'accueil, écrits depuis la grille et la réduction en vigueur (`app/_partage/les-prix-en-vigueur.ts`) :
 * le prix de chaque offre, barré et remplacé pendant une réduction ouverte à tous, et la phrase qui la dit, sa durée et
 * sa date de fin comprises. Sans réduction, la page dit les prix de la grille, comme avant.
 */
import { GRILLE_DU_CODE, type Grille, type Reduction } from '@/lib/abonnements/les-offres';
import type { LangueDeLAccueil } from './la-page';

const euros = (centimes: number, langue: LangueDeLAccueil): string =>
  `${new Intl.NumberFormat(langue === 'fr' ? 'fr-FR' : 'en-GB', { minimumFractionDigits: centimes % 100 ? 2 : 0, maximumFractionDigits: 2 }).format(centimes / 100)} €`;

const echappe = (t: string): string => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Les morceaux posés dans le gabarit, par repère. */
export function lesPrixDeLAccueil(grille: Grille = GRILLE_DU_CODE, reduction: Reduction | null = null, langue: LangueDeLAccueil = 'fr'): Readonly<Record<string, string>> {
  const fr = langue === 'fr';
  const remise = reduction && reduction.pourcent >= 1 && reduction.pourcent <= 100 ? reduction : null;
  const prix = (c: number): string => (remise
    ? `<s>${euros(c, langue)}</s> <span class="promo-prix">${euros(Math.round(c * (100 - remise.pourcent) / 100), langue)}</span>`
    : euros(c, langue));
  const duree = remise ? (fr ? (remise.mois === 1 ? 'le premier mois' : `les ${remise.mois} premiers mois`) : (remise.mois === 1 ? 'for the first month' : `for the first ${remise.mois} months`)) : '';
  const fin = remise ? new Date(remise.valableJusquAu).toLocaleDateString(fr ? 'fr-FR' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' }) : '';
  const etiquette = remise ? `<p class="promo">−${remise.pourcent} % ${echappe(duree)}</p>` : '';
  const bandeau = remise
    ? `<p class="bandeau-promo"><b>${fr ? 'Offre en cours' : 'Current offer'}</b> : −${remise.pourcent} % ${echappe(duree)} ${fr ? 'sur toutes les offres, pour un abonnement pris avant le' : 'on every plan, for a subscription taken before'} ${echappe(fin)}.</p>`
    : '';
  return {
    __PRIX_SITE__: prix(grille.site), __PRIX_BOUTIQUE__: prix(grille.boutique), __PRIX_PRO__: prix(grille.pro),
    __PROMO_OFFRE__: etiquette, __BANDEAU_PROMO__: bandeau,
    __PRIX_BOUTIQUE_SEUL__: euros(grille.boutique, langue), __PRIX_EN_PLUS__: euros(grille.enPlus, langue),
  };
}
