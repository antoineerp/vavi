/**
 * Servir une app depuis le magasin : l'aperçu sous `/p/<id>/`. Un chemin sans extension est une page de l'app : on
 * sert son `index.html` (le routeur de l'app décide) ; un fichier absent rend 404, jamais la page à sa place.
 *
 * `index.html` reçoit, au service et jamais au build, ce que l'app lit au démarrage (`squelette/gabarit/src/lib/env.ts`) :
 * l'adresse et la clé PUBLIQUE de la base, le schéma du projet, sa base de montage. Aucune clé secrète : le type n'en
 * porte pas.
 */
import type { Magasin } from './le-magasin';
import { cachePour, PREFIXE_DE_L_APERCU, typeDe } from './publier';

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

/** `index.html` avec l'environnement de l'app, posé avant tout script. PURE. */
export function poserLEnvironnement(html: string, env: EnvDeLApp): string {
  const script = `<script>window.__SUPABASE_URL__=${enScript(env.supabaseUrl)};window.__SUPABASE_ANON_KEY__=${enScript(env.cleAnonyme)};`
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

export async function servirLApercu(magasin: Magasin, projet: string, segments: readonly string[], env: EnvDeLApp): Promise<Reponse> {
  const chemin = cheminDansLeDist(segments);
  if (chemin === null) return texte(400, 'chemin refusé');
  let objet;
  try {
    objet = await magasin.lire(`${PREFIXE_DE_L_APERCU}${projet}/${chemin}`);
  } catch {
    return texte(503, 'le magasin des builds n’a pas répondu');
  }
  if (objet === 'absent') return texte(404, chemin === 'index.html' ? 'cette app n’a pas encore été construite' : 'fichier introuvable');
  const corps = chemin === 'index.html' ? Buffer.from(poserLEnvironnement(objet.octets.toString('utf8'), env), 'utf8') : objet.octets;
  return { statut: 200, type: typeDe(chemin), cache: cachePour(chemin), corps };
}
