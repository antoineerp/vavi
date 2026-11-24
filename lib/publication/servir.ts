/**
 * Servir une app depuis le magasin : l'aperçu sous `/p/<id>/`, qui sert le build que le projet DÉSIGNE (`publish`), ou
 * un brouillon (`build_preview`) que la personne regarde par son adresse `?brouillon=<empreinte>`. Un chemin sans extension est une page de l'app : on
 * sert son `index.html` (le routeur de l'app décide) ; un fichier absent rend 404, jamais la page à sa place.
 *
 * `index.html` reçoit, au service et jamais au build, ce que l'app lit au démarrage (`squelette/gabarit/src/lib/env.ts`) :
 * l'adresse et la clé PUBLIQUE de la base, le schéma du projet, sa base de montage. Aucune clé secrète : le type n'en
 * porte pas.
 */
import type { Magasin } from './le-magasin';
import { cachePour, typeDe } from './publier';

export interface EnvDeLApp {
  readonly supabaseUrl: string;
  readonly cleAnonyme: string;
  readonly schema: string;
  /** `/p/<id>/` pour l'aperçu. */
  readonly base: string;
}

export interface Reponse { readonly statut: number; readonly type: string; readonly cache: string; readonly corps: Buffer }

const texte = (statut: number, t: string): Reponse =>
  ({ statut, type: 'text/plain; charset=utf-8', cache: 'no-store', corps: Buffer.from(t, 'utf8') });

/** Une valeur dans un `<script>` : du JSON dont aucun `<` ne peut fermer la balise. PURE. */
const enScript = (v: string): string => JSON.stringify(v).replace(/</g, '\\u003c');

/**
 * `index.html` avec l'environnement de l'app, posé avant tout script, et l'adresse où elle est servie (`<base>`). Un
 * build se fait UNE fois, avec des chemins relatifs (`vite build --base ./`) : le même dist sert l'aperçu, le brouillon
 * et le site public, chacun à son adresse ; c'est ce qui permet de publier sans reconstruire. PURE.
 */
export function poserLEnvironnement(html: string, env: EnvDeLApp): string {
  const script = `<base href="${env.base.replace(/[^\w/.-]/g, '')}">` + `<script>window.__SUPABASE_URL__=${enScript(env.supabaseUrl)};window.__SUPABASE_ANON_KEY__=${enScript(env.cleAnonyme)};`
    + `window.__DATABASE_SCHEMA__=${enScript(env.schema)};window.__VAVI_BASENAME__=${enScript(env.base)};</script>`;
  const tete = /<head[^>]*>/i.exec(html);
  return tete ? html.replace(tete[0], `${tete[0]}${script}`) : `${script}${html}`;
}

/** Le chemin demandé, net, dans le dist ; `null` s'il sort du dist. PURE. */
export function cheminDansLeDist(segments: readonly string[]): string | null {
  const parts = segments.flatMap((s) => s.split('/')).filter((s) => s !== '' && s !== '.');
  if (parts.some((s) => s === '..' || s.includes('\\') || s.includes('\0'))) return null;
  const chemin = parts.join('/');
  return chemin === '' || !/\.[a-z0-9]+$/i.test(parts[parts.length - 1] ?? '') ? 'index.html' : chemin;
}

/** Une empreinte d'arbre : 64 caractères hexadécimaux. Rien d'autre n'entre dans une clé du magasin. */
export const estUneEmpreinte = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{64}$/.test(v);

export const COOKIE_DU_BROUILLON = 'vavi_brouillon';

/**
 * Quel build servir, PURE. Une page (`index.html`) décide : `?brouillon=<e>` montre ce brouillon et le retient par un
 * cookie limité à `/p/<id>/` (les fichiers de l'app, demandés sans la requête, le suivent) ; une page sans brouillon
 * revient à l'aperçu et efface le cookie. Un fichier suit le cookie.
 */
export function leBuildAServir(o: { readonly page: boolean; readonly demande: string | null; readonly cookie: string | null; readonly designe: string | null }):
  { readonly empreinte: string | null; readonly cookie: 'poser' | 'effacer' | 'garder' } {
  if (o.page) {
    if (estUneEmpreinte(o.demande)) return { empreinte: o.demande, cookie: 'poser' };
    return { empreinte: o.designe, cookie: o.cookie ? 'effacer' : 'garder' };
  }
  return { empreinte: estUneEmpreinte(o.cookie) ? o.cookie : o.designe, cookie: 'garder' };
}

/** `racine` : la clé du build dans le magasin (`racineDuBuild`). */
export async function servirUnDist(magasin: Magasin, racine: string | null, segments: readonly string[], env: EnvDeLApp): Promise<Reponse> {
  const chemin = cheminDansLeDist(segments);
  if (chemin === null) return texte(400, 'chemin refusé');
  if (racine === null) return texte(404, 'cette app n’a pas encore d’aperçu : lancez un build');
  let objet;
  try {
    objet = await magasin.lire(`${racine}/${chemin}`);
  } catch {
    return texte(503, 'le magasin des builds n’a pas répondu');
  }
  if (objet === 'absent') return texte(404, chemin === 'index.html' ? 'ce build n’existe pas' : 'fichier introuvable');
  const corps = chemin === 'index.html' ? Buffer.from(poserLEnvironnement(objet.octets.toString('utf8'), env), 'utf8') : objet.octets;
  return { statut: 200, type: typeDe(chemin), cache: cachePour(chemin), corps };
}
