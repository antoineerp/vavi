/**
 * Servir un projet depuis le magasin des builds : l'aperçu (`/p/<id>/`, le build désigné par `publish`, ou le brouillon
 * `?brouillon=<empreinte>` retenu par un cookie limité à l'aperçu) ou le site public (`/s/<id>/`, le build que la
 * personne a mis en ligne avec « Publier » ; jamais un brouillon). Le même dist sert les deux (`poserLEnvironnement`).
 */
import { configurationPublique } from '@/lib/supabase/configuration';
import { clientDeService } from '@/lib/supabase/service';
import { magasinS3 } from '@/lib/publication/le-magasin';
import { racineDuBuild } from '@/lib/publication/publier';
import { cheminDansLeDist, COOKIE_DU_BROUILLON, leBuildAServir, servirUnDist } from '@/lib/publication/servir';
import { schemaDuProjet } from '@/lib/relais/le-schema-d-une-app';
import { leBuildDesigne } from '@/lib/projets/les-projets';

const leCookie = (requete: Request): string | null =>
  (requete.headers.get('cookie') ?? '').split(';').map((x) => x.trim()).find((x) => x.startsWith(`${COOKIE_DU_BROUILLON}=`))?.slice(COOKIE_DU_BROUILLON.length + 1) ?? null;

export async function servirUnProjet(requete: Request, brut: string, chemin: readonly string[], lequel: 'apercu' | 'en_ligne'): Promise<Response> {
  const id = brut.toLowerCase();
  const schema = schemaDuProjet(id);
  if (!schema) return new Response('projet inconnu', { status: 404 });
  const publique = configurationPublique(process.env);
  const magasin = magasinS3();
  if (!publique.lue || !magasin.lu) {
    const manque = [...(publique.lue ? [] : publique.manque), ...(magasin.lu ? [] : magasin.manque)];
    return new Response(`vavi n’est pas configuré : ${manque.join(', ')}`, { status: 503 });
  }
  const designe = await leBuildDesigne(clientDeService(), id, lequel);
  if (!designe.lu) return new Response('la base de vavi n’a pas répondu', { status: 503 });
  if (designe.valeur === 'inconnu') return new Response('projet inconnu', { status: 404 });
  const base = `/${lequel === 'apercu' ? 'p' : 's'}/${id}/`;
  const choix = lequel === 'apercu'
    ? leBuildAServir({ page: cheminDansLeDist(chemin) === 'index.html', demande: new URL(requete.url).searchParams.get('brouillon'), cookie: leCookie(requete), designe: designe.valeur })
    : { empreinte: designe.valeur, cookie: 'garder' as const };
  const r = await servirUnDist(magasin.magasin, choix.empreinte ? racineDuBuild(id, choix.empreinte) : null, chemin,
    { supabaseUrl: publique.valeur.url, cleAnonyme: publique.valeur.cleAnonyme, schema, base, projet: id });
  const entetes = new Headers({ 'content-type': r.type, 'cache-control': r.cache, 'x-content-type-options': 'nosniff', vary: 'cookie' });
  if (choix.cookie === 'poser') entetes.append('set-cookie', `${COOKIE_DU_BROUILLON}=${choix.empreinte}; Path=${base}; HttpOnly; Secure; SameSite=Lax`);
  if (choix.cookie === 'effacer') entetes.append('set-cookie', `${COOKIE_DU_BROUILLON}=; Path=${base}; Max-Age=0; HttpOnly; Secure; SameSite=Lax`);
  return new Response(new Uint8Array(r.corps), { status: r.statut, headers: entetes });
}
