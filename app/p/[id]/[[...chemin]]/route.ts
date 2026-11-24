/**
 * L'aperçu d'une app : `/p/<id>/…`, servi depuis le magasin des builds (`lib/publication/servir.ts`). Il sert le build que
 * le projet désigne (`publish`), ou le brouillon demandé par `?brouillon=<empreinte>` (`build_preview`), retenu par un
 * cookie limité à cette adresse pour les fichiers que la page demande ensuite.
 */
import { configurationPublique } from '@/lib/supabase/configuration';
import { clientDeService } from '@/lib/supabase/service';
import { magasinS3 } from '@/lib/publication/le-magasin';
import { racineDuBuild } from '@/lib/publication/publier';
import { cheminDansLeDist, COOKIE_DU_BROUILLON, leBuildAServir, servirUnDist } from '@/lib/publication/servir';
import { schemaDuProjet } from '@/lib/relais/le-schema-d-une-app';
import { lApercuDesigne } from '@/lib/projets/les-projets';

export const dynamic = 'force-dynamic';

const leCookie = (requete: Request): string | null =>
  (requete.headers.get('cookie') ?? '').split(';').map((x) => x.trim()).find((x) => x.startsWith(`${COOKIE_DU_BROUILLON}=`))?.slice(COOKIE_DU_BROUILLON.length + 1) ?? null;

export async function GET(requete: Request, { params }: { params: Promise<{ id: string; chemin?: string[] }> }) {
  const { id: brut, chemin = [] } = await params;
  const id = brut.toLowerCase();
  const schema = schemaDuProjet(id);
  if (!schema) return new Response('projet inconnu', { status: 404 });
  const publique = configurationPublique(process.env);
  const magasin = magasinS3();
  if (!publique.lue || !magasin.lu) {
    const manque = [...(publique.lue ? [] : publique.manque), ...(magasin.lu ? [] : magasin.manque)];
    return new Response(`vavi n’est pas configuré : ${manque.join(', ')}`, { status: 503 });
  }
  const designe = await lApercuDesigne(clientDeService(), id);
  if (!designe.lu) return new Response('la base de vavi n’a pas répondu', { status: 503 });
  if (designe.valeur === 'inconnu') return new Response('projet inconnu', { status: 404 });
  const base = `/p/${id}/`;
  const choix = leBuildAServir({
    page: cheminDansLeDist(chemin) === 'index.html', demande: new URL(requete.url).searchParams.get('brouillon'),
    cookie: leCookie(requete), designe: designe.valeur,
  });
  const r = await servirUnDist(magasin.magasin, choix.empreinte ? racineDuBuild(id, choix.empreinte) : null, chemin,
    { supabaseUrl: publique.valeur.url, cleAnonyme: publique.valeur.cleAnonyme, schema, base });
  const entetes = new Headers({ 'content-type': r.type, 'cache-control': r.cache, 'x-content-type-options': 'nosniff', vary: 'cookie' });
  if (choix.cookie === 'poser') entetes.append('set-cookie', `${COOKIE_DU_BROUILLON}=${choix.empreinte}; Path=${base}; HttpOnly; Secure; SameSite=Lax`);
  if (choix.cookie === 'effacer') entetes.append('set-cookie', `${COOKIE_DU_BROUILLON}=; Path=${base}; Max-Age=0; HttpOnly; Secure; SameSite=Lax`);
  return new Response(new Uint8Array(r.corps), { status: r.statut, headers: entetes });
}
