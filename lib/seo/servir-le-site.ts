/**
 * SERVIR UN SITE, LISIBLE SANS JAVASCRIPT — au-dessus de `servirUnDist` (lib/publication) :
 *   · le site en ligne sert à chaque page publique sa version pré-rendue, avec son adresse canonique et ses données
 *     structurées ; `robots.txt`, `sitemap.xml`, `llms.txt` et `llms-full.txt` sont écrits à la requête depuis
 *     `decouverte.json` ; une adresse qui n'est aucune page de l'app rend 404 (la coquille, qui dit « introuvable ») ;
 *   · l'aperçu sert toujours la coquille, et ne se référence jamais (`robots.txt` fermé, `noindex`).
 * Neuf dans vavi. Ce qu'il remplace : dans constructor-v13, le pré-rendu écrasait `index.html`, et l'aperçu servait la page
 * de l'accueil figée à toutes ses adresses de repli.
 */
import type { Magasin } from '@/lib/publication/le-magasin';
import { cheminDansLeDist, poserLEnvironnement, servirUnDist, type EnvDeLApp, type Reponse } from '@/lib/publication/servir';
import { estUneAdresseDeLApp, FICHIER_DE_DECOUVERTE, FICHIERS_DE_DECOUVERTE, fichierDeDecouverte, laPageServie, lireLaDecouverte, ROBOTS_DE_L_APERCU, type Decouverte } from './la-decouverte';
import { BASE_DU_PRE_RENDU, fichierDuPreRendu } from './le-pre-rendu';
import { avecLaVerificationGoogle } from './la-note';

export type ReponseDuSite = Reponse & { readonly entetes: Readonly<Record<string, string>> };
const avec = (r: Reponse, entetes: Record<string, string> = {}): ReponseDuSite => ({ ...r, entetes });
const enTexte = (statut: number, type: string, t: string): Reponse => ({ statut, type, cache: 'public, max-age=300', corps: Buffer.from(t, 'utf8') });

async function lire(magasin: Magasin, cle: string): Promise<Buffer | null> {
  try { const o = await magasin.lire(cle); return o === 'absent' ? null : o.octets; } catch { return null; }
}

/**
 * `racinePublique` : l'adresse absolue du site en ligne, sans `/` final (`https://<vavi>/s/<id>`). `racine` : la clé du
 * build dans le magasin, `null` sans build. `verificationGoogle` : le jeton Search Console du propriétaire, posé sur les
 * pages du site en ligne (jamais sur l'aperçu).
 */
export async function servirLeSite(magasin: Magasin, racine: string | null, segments: readonly string[], env: EnvDeLApp,
  lequel: 'apercu' | 'en_ligne', racinePublique: string, verificationGoogle: string | null = null): Promise<ReponseDuSite> {
  const nom = segments.join('/');
  if (lequel === 'apercu') {
    if (nom === 'robots.txt') return avec(enTexte(200, 'text/plain; charset=utf-8', ROBOTS_DE_L_APERCU), { 'x-robots-tag': 'noindex' });
    return avec(await servirUnDist(magasin, racine, segments, env), { 'x-robots-tag': 'noindex' });
  }
  if (racine === null) return avec(await servirUnDist(magasin, racine, segments, env));
  const chemin = cheminDansLeDist(segments);
  const page = chemin === 'index.html';
  if (!page && !FICHIERS_DE_DECOUVERTE.has(nom)) return avec(await servirUnDist(magasin, racine, segments, env));
  const brut = await lire(magasin, `${racine}/${FICHIER_DE_DECOUVERTE}`);
  const d: Decouverte | null = brut ? lireLaDecouverte(brut.toString('utf8')) : null;
  if (!page) {
    const f = d ? fichierDeDecouverte(nom, racinePublique, d) : null;
    return avec(f ? enTexte(200, f.type, f.corps) : await servirUnDist(magasin, racine, segments, env));
  }
  const adresse = `/${segments.flatMap((s) => s.split('/')).filter(Boolean).join('/')}`;
  const pre = d ? await lire(magasin, `${racine}/${fichierDuPreRendu(adresse)}`) : null;
  if (pre && d) {
    const html = avecLaVerificationGoogle(laPageServie(poserLEnvironnement(pre.toString('utf8').split(BASE_DU_PRE_RENDU).join(env.base), env), racinePublique, adresse, d), verificationGoogle);
    return avec({ statut: 200, type: 'text/html; charset=utf-8', cache: 'no-store', corps: Buffer.from(html, 'utf8') });
  }
  const servi = await servirUnDist(magasin, racine, segments, env);
  const r = verificationGoogle && servi.statut === 200 && servi.type.startsWith('text/html')
    ? { ...servi, corps: Buffer.from(avecLaVerificationGoogle(servi.corps.toString('utf8'), verificationGoogle), 'utf8') } : servi;
  // Une adresse qui n'est aucune page de l'app : la coquille la dit introuvable, et le code le dit aux robots.
  return avec(d && d.routes.length > 0 && r.statut === 200 && !estUneAdresseDeLApp(adresse, d.routes) ? { ...r, statut: 404 } : r);
}
