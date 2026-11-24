// Repris de constructor-v13@5bb786e : lib/auth/marques-d-origine.ts
/**
 * LES MARQUES D'INSCRIPTION (12/10) — ce qu'une inscription déclare de son origine (`user_metadata`), lu par la base
 * (`lib/bascule/l-origine-des-comptes.ts`) pour décider qui peut rejoindre une app. Une marque ne donne aucun droit :
 * elle ne fait que RESTREINDRE où le compte entre sans invitation.
 */
/** Posée par l'inscription d'une app de la voie neuve : le schéma de l'app où le compte naît. */
export const MARQUE_DE_L_APP = 'constructor_app';
/** Posée par l'inscription à la plateforme : un compte qui ne naît dans aucune app. */
export const MARQUE_DE_LA_PLATEFORME = 'constructor_plateforme';
