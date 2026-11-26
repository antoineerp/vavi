/**
 * Servir une app depuis le magasin : l'aperçu sous `/p/<id>/`, qui sert le build que le projet DÉSIGNE (`publish`), ou
 * un brouillon (`build_preview`) que la personne regarde par son adresse `?brouillon=<empreinte>`. Un chemin sans extension est une page de l'app : on
 * sert son `index.html` (le routeur de l'app décide) ; un fichier absent rend 404, jamais la page à sa place.
 *
 * `index.html` reçoit, au service et jamais au build, ce que l'app lit au démarrage (`squelette/gabarit/src/lib/env.ts`) :
 * l'adresse et la clé PUBLIQUE de la base, le schéma du projet, sa base de montage, le projet (ses appels à la plateforme
 * partent de la même adresse : `/api/…`). Aucune clé secrète : le type n'en
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
  /** Le projet servi : l'app le nomme dans ses appels à la plateforme (`/api/pay/<projet>/…`), servis à la même adresse. */
  readonly projet: string;
  /** L'origine de la console : la seule qui puisse demander l'édition dans l'aperçu (l'app est à un autre hôte). */
  readonly console?: string;
  /** L'origine des routes `/api/` de l'app quand la page n'est pas servie à son adresse (la vue de Claude l'écrit dans
   * son propre cadre : un appel relatif y partait vers l'hôte de Claude, INCIDENT 25/11 « la connexion n'a pas abouti »).
   * Absente : à la même adresse que la page. */
  readonly api?: string;
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
    + `window.__DATABASE_SCHEMA__=${enScript(env.schema)};window.__VAVI_BASENAME__=${enScript(env.base)};`
    + `window.__PROJECT_ID__=${enScript(env.projet)};window.__VAVI_API_URL__=${enScript(env.api ?? '')};`
    // L'ancien nom, que lisent les apps bâties avant le 26/11 (leur dist ne se rebâtit pas pour un nom).
    + `window.__CONSTRUCTOR_API_URL__=${enScript(env.api ?? '')};`
    + `${env.console ? `window.__VAVI_CONSOLE__=${enScript(env.console)};` : ''}</script>`;
  const tete = /<head[^>]*>/i.exec(html);
  return tete ? html.replace(tete[0], `${tete[0]}${script}`) : `${script}${html}`;
}

/** Le dossier du dist où le build pose le code des agents. */
export const DOSSIER_DES_AGENTS = '_agents';

/** Le chemin demandé, net, dans le dist ; `null` s'il sort du dist ou nomme le code des agents. PURE. */
export function cheminDansLeDist(segments: readonly string[]): string | null {
  const parts = segments.flatMap((s) => s.split('/')).filter((s) => s !== '' && s !== '.');
  if (parts.some((s) => s === '..' || s.includes('\\') || s.includes('\0'))) return null;
  // Le code des agents (`_agents/`) tourne sur le serveur ; il est dans le dist pour être celui du build vert, jamais servi.
  if (parts[0] === DOSSIER_DES_AGENTS) return null;
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
