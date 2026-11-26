/**
 * SERVIR UN SITE, LISIBLE SANS JAVASCRIPT — au-dessus de `servirUnDist` (lib/publication) :
 *   · le site en ligne sert à chaque page publique sa version pré-rendue, avec son adresse canonique et ses données
 *     structurées ; `robots.txt`, `sitemap.xml`, `llms.txt` et `llms-full.txt` sont écrits à la requête depuis
 *     `decouverte.json` ; une adresse qui n'est aucune page de l'app rend 404 (la coquille, qui dit « introuvable ») ;
 *   · l'aperçu sert toujours la coquille, et ne se référence jamais (`robots.txt` fermé, `noindex`).
 * Neuf dans vavi. Ce qu'il remplace : dans constructor-v13, le pré-rendu écrasait `index.html`, et l'aperçu servait la page
 * de l'accueil figée à toutes ses adresses de repli. Une page que le propriétaire cache de Google est servie `noindex` ;
 * une ancienne adresse qu'il redirige rend 301 (« Référencement »).
 */
import type { Magasin } from '@/lib/publication/le-magasin';
import { cheminDansLeDist, poserLEnvironnement, servirUnDist, type EnvDeLApp, type Reponse } from '@/lib/publication/servir';
import { estCachee, estUneAdresseDeLApp, laRedirection, FICHIER_DE_DECOUVERTE, FICHIERS_DE_DECOUVERTE, fichierDeDecouverte, laPageServie, lireLaDecouverte, ROBOTS_DE_L_APERCU, type Decouverte } from './la-decouverte';
import { BASE_DU_PRE_RENDU, fichierDuPreRendu } from './le-pre-rendu';
import { avecLaVerificationGoogle } from './la-note';

export type ReponseDuSite = Reponse & { readonly entetes: Readonly<Record<string, string>> };
const avec = (r: Reponse, entetes: Record<string, string> = {}): ReponseDuSite => ({ ...r, entetes });
const enTexte = (statut: number, type: string, t: string): Reponse => ({ statut, type, cache: 'public, max-age=300', corps: Buffer.from(t, 'utf8') });

const redirige = (vers: string): ReponseDuSite =>
  avec({ statut: 301, type: 'text/plain; charset=utf-8', cache: 'public, max-age=300', corps: Buffer.from(vers, 'utf8') }, { location: vers });

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
  const laDecouverte = async (): Promise<Decouverte | null> => { const brut = await lire(magasin, `${racine}/${FICHIER_DE_DECOUVERTE}`); return brut ? lireLaDecouverte(brut.toString('utf8')) : null; };
  if (!page && !FICHIERS_DE_DECOUVERTE.has(nom)) {
    const servi = await servirUnDist(magasin, racine, segments, env);
    if (servi.statut !== 404) return avec(servi);
    // Un fichier absent (`/ancien.html`, `/page.php` d'un ancien site) : peut-être une adresse que le propriétaire redirige.
    const dd = await laDecouverte();
    const vers = dd ? laRedirection(`/${nom}`, racinePublique, dd) : null;
    return vers ? redirige(vers) : avec(servi);
  }
  const d = await laDecouverte();
  if (!page) {
    const f = d ? fichierDeDecouverte(nom, racinePublique, d) : null;
    return avec(f ? enTexte(200, f.type, f.corps) : await servirUnDist(magasin, racine, segments, env));
  }
  const adresse = `/${segments.flatMap((s) => s.split('/')).filter(Boolean).join('/')}`;
  // Une ancienne adresse que le propriétaire envoie ailleurs : pour toujours (301), les moteurs suivent.
  const vers = d ? laRedirection(adresse, racinePublique, d) : null;
  if (vers) return redirige(vers);
  const cachee: Record<string, string> = d !== null && estCachee(adresse, d) ? { 'x-robots-tag': 'noindex' } : {};
  const pre = d ? await lire(magasin, `${racine}/${fichierDuPreRendu(adresse)}`) : null;
  if (pre && d) {
    const html = avecLaVerificationGoogle(laPageServie(poserLEnvironnement(pre.toString('utf8').split(BASE_DU_PRE_RENDU).join(env.base), env), racinePublique, adresse, d), verificationGoogle);
    return avec({ statut: 200, type: 'text/html; charset=utf-8', cache: 'no-store', corps: Buffer.from(html, 'utf8') }, cachee);
  }
  const servi = await servirUnDist(magasin, racine, segments, env);
  const r = verificationGoogle && servi.statut === 200 && servi.type.startsWith('text/html')
    ? { ...servi, corps: Buffer.from(avecLaVerificationGoogle(servi.corps.toString('utf8'), verificationGoogle), 'utf8') } : servi;
  // Une adresse qui n'est aucune page de l'app : la coquille la dit introuvable, et le code le dit aux robots.
  return avec(d && d.routes.length > 0 && r.statut === 200 && !estUneAdresseDeLApp(adresse, d.routes) ? { ...r, statut: 404 } : r);
}
