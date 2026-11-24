// Repris de constructor-v13@5bb786e : types/astronomia.d.ts
/**
 * `astronomia` (VSOP87) ne publie pas de types. Les données planétaires sont de
 * gros tableaux de coefficients dont la forme n'apporte rien au typage — seul
 * l'objet `Planet` qui les consomme compte, et il est déjà manipulé en `any`
 * dans le moteur. On déclare donc les modules de données pour que
 * `tsc --noEmit` reste vert sans inventer une API qu'on ne contrôle pas.
 */
declare module 'astronomia';
declare module 'astronomia/data/vsop87Bearth';
declare module 'astronomia/data/vsop87Bmercury';
declare module 'astronomia/data/vsop87Bvenus';
declare module 'astronomia/data/vsop87Bmars';
declare module 'astronomia/data/vsop87Bjupiter';
declare module 'astronomia/data/vsop87Bsaturn';
declare module 'astronomia/data/vsop87Buranus';
declare module 'astronomia/data/vsop87Bneptune';
