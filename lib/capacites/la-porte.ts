/**
 * LA PORTE DES CAPACITÉS — qui peut faire faire quelque chose à la plateforme pour une app, et combien de fois.
 *
 * Trois questions, dans cet ordre, pour toutes les capacités :
 *  1. l'app DÉCLARE-t-elle cette capacité dans app.json (`fonctions`) ? Sinon, elle n'existe pas pour elle (404) ;
 *  2. une capacité qui dépense pour le propriétaire ou lit ses documents (`CAPACITES_DERRIERE_UN_COMPTE`) exige une
 *     session d'un MEMBRE de cette app — un compte connecté ailleurs n'y suffit pas ; les autres (un lieu, le ciel)
 *     ne rendent rien de personnel et s'ouvrent au visiteur ;
 *  3. le plafond, tenu EN BASE (`vavi_plafond`), par projet et par compte : il vaut pour toutes les instances, et
 *     une page qui appelle en boucle ne vide ni le quota du propriétaire chez son fournisseur, ni le service public.
 *
 * Neuf dans vavi (lot 7). Remplace, pour vavi, `resolveActorStrictForProject`, `lAppDuProjetAppelle` et le
 * `rateLimit` en mémoire de constructor-v13, qui se répétaient route par route.
 */
import { CAPACITES_DERRIERE_UN_COMPTE, type Capacite, type Manifeste } from '@/lib/backend/app/manifeste';

export type Issue<T> = { readonly lu: true; readonly valeur: T } | { readonly lu: false; readonly pourquoi: string };

export interface DependancesDeLaPorte {
  /** app.json du projet, lu ; `null` : le projet n'existe pas. */
  leManifeste(projet: string): Promise<Issue<Manifeste | null>>;
  /** Le compte d'une session d'app, relu auprès de Supabase ; `null` : pas de session valide. */
  laPersonne(jeton: string): Promise<string | null>;
  estMembre(projet: string, compte: string): Promise<Issue<boolean>>;
  /** Compte un passage sous la clé ; `false` : le plafond de la fenêtre est atteint. */
  plafond(cle: string, fenetreS: number, max: number): Promise<Issue<boolean>>;
}

export interface Plafonds { readonly fenetreS: number; readonly parProjet: number; readonly parCompte: number }

export type Refus = { readonly ouverte: false; readonly statut: 400 | 401 | 403 | 404 | 429 | 503; readonly corps: { readonly error: string; readonly detail?: string } };
export type Porte = { readonly ouverte: true; readonly compte: string | null; readonly manifeste: Manifeste } | Refus;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const refus = (statut: Refus['statut'], error: string, detail?: string): Refus => ({ ouverte: false, statut, corps: detail ? { error, detail } : { error } });

/**
 * Ce que la porte garde : une capacité déclarée, ou les pièces jointes des lignes — pas une capacité (elles suivent
 * les colonnes `fichier` d'app.json, que la base tient), toujours derrière un compte membre ; l'IA (`fonctions.ia`), qui
 * dépense sur la clé du propriétaire, aussi.
 */
export type Service = Capacite | 'pieces' | 'ia';

export const derriereUnCompte = (c: Service): boolean => c === 'pieces' || c === 'ia' || CAPACITES_DERRIERE_UN_COMPTE.includes(c);

/** Le jeton d'une requête : `Authorization: Bearer …`. */
export const leJeton = (entete: string | null): string | null => /^Bearer\s+(\S+)$/i.exec(entete ?? '')?.[1] ?? null;

export async function ouvrirLaPorte(d: DependancesDeLaPorte, projet: string, capacite: Service, jeton: string | null, p: Plafonds): Promise<Porte> {
  if (!UUID.test(projet)) return refus(404, 'projet inconnu');
  const m = await d.leManifeste(projet);
  if (!m.lu) return refus(503, 'base indisponible');
  if (!m.valeur) return refus(404, 'projet inconnu');
  if (capacite !== 'pieces' && !m.valeur.fonctions[capacite]) return refus(404, `cette app ne déclare pas la fonction ${capacite}`, `déclarez \`fonctions.${capacite}\` dans app.json`);
  let compte: string | null = jeton ? await d.laPersonne(jeton) : null;
  if (derriereUnCompte(capacite)) {
    if (!compte) return refus(401, 'connectez-vous d’abord');
    const membre = await d.estMembre(projet, compte);
    if (!membre.lu) return refus(503, 'base indisponible');
    if (!membre.valeur) return refus(403, 'ce compte n’est pas membre de cette app');
  } else if (compte) {
    // Hors compte, une session ne sert qu'à compter : celle d'un non-membre compte comme un visiteur.
    const membre = await d.estMembre(projet, compte);
    if (!membre.lu || !membre.valeur) compte = null;
  }
  const cles = [`${capacite}:${projet}:${p.parProjet}`, ...(compte ? [`${capacite}:${projet}:${compte}:${p.parCompte}`] : [])];
  for (const [i, cle] of cles.entries()) {
    const ok = await d.plafond(cle, p.fenetreS, i === 0 ? p.parProjet : p.parCompte);
    if (!ok.lu) return refus(503, 'base indisponible');
    if (!ok.valeur) return refus(429, 'trop de demandes', `réessayez dans ${Math.ceil(p.fenetreS / 60)} minute(s)`);
  }
  return { ouverte: true, compte, manifeste: m.valeur };
}
