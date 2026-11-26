/**
 * Un menu d'UNE entrée ne mène qu'à la page où l'on est : il n'en est pas un (Antoine, 25/11 : « une page hello, et un menu
 * créé pour une seule page »). Il est vide, et le chrome n'affiche que la marque. L'accueil de la VITRINE n'y est jamais :
 * la marque y mène (Antoine, 25/11 : « pas besoin du lien Accueil si on clique sur le logo »). Un écran de TRAVAIL à « / »
 * reste au menu : c'est un écran comme un autre, nommé par son titre (INCIDENT 25/11, « Cap Équipage » : la liste des
 * séjours, écran principal, avait disparu du menu de l'app). PURE.
 */
export const unMenuSeulementSIlChoisit = <T extends { readonly vers: string; readonly surface?: 'public' | 'travail' },>(entrees: readonly T[]): readonly T[] =>
  (entrees.length < 2 ? [] : entrees.filter((e) => e.vers !== '/' || e.surface === 'travail'));

/**
 * Le site offre-t-il d'entrer par un compte ? Seulement si une page demande un compte, ou si une personne peut obtenir un
 * rôle seule (en s'inscrivant, en l'achetant) : un site vitrine dont seul le propriétaire a un rôle (il reçoit les envois
 * de ses visiteurs, et gère tout depuis la console vavi) n'affiche pas « Se connecter » (Antoine, 26/11). La page de
 * connexion reste servie à son adresse. PURE.
 */
export const onEntreParUnCompte = (pages: readonly { readonly acces: { readonly nature: string } }[], roles: readonly { readonly obtenu: string }[]): boolean =>
  roles.length > 0 && (pages.some((p) => p.acces.nature !== 'public') || roles.some((r) => r.obtenu === 'inscription' || r.obtenu === 'paiement'));
