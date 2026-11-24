/**
 * Servir un projet depuis le magasin des builds : l'aperçu (`/p/<id>/`, le build désigné par `publish`, ou le brouillon
 * `?brouillon=<empreinte>` retenu par un cookie limité à l'aperçu) ou le site public (`/s/<id>/`, le build que la
 * personne a mis en ligne avec « Publier » ; jamais un brouillon). Le même dist sert les deux (`poserLEnvironnement`).
 * Chaque page servie porte la preuve de sa visite (`lib/formulaires`), que l'envoi d'un formulaire présente.
 */
import { configurationPublique } from '@/lib/supabase/configuration';
import { clientDeService } from '@/lib/supabase/service';
import { magasinS3 } from '@/lib/publication/le-magasin';
import { racineDuBuild } from '@/lib/publication/publier';
import { cheminDansLeDist, COOKIE_DU_BROUILLON, leBuildAServir } from '@/lib/publication/servir';
import { servirLeSite } from '@/lib/seo/servir-le-site';
import { adresseDeLaPlateforme } from '@/lib/mcp/l-adresse';
import { schemaDuProjet } from '@/lib/relais/le-schema-d-une-app';
import { leBuildDesigne } from '@/lib/projets/les-projets';
import { CHEMIN_DE_LA_PREUVE, DUREE_DE_LA_PREUVE_S, emettreLaPreuve, nomDeLaPreuve } from '@/lib/formulaires/le-jugement';
import { secretDeLaPreuve } from './les-formulaires-reels';
import { leSiteDuProprietaireEstServi } from './les-abonnements-reels';

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
  // LE SITE EN LIGNE SE MET EN PAUSE quand l'abonnement de son propriétaire a fini sa grâce (rien n'est effacé ; l'aperçu reste).
  if (lequel === 'en_ligne' && designe.valeur) {
    const p = await clientDeService().from('vavi_projets').select('proprietaire').eq('id', id).maybeSingle<{ proprietaire: string }>();
    if (p.data && !(await leSiteDuProprietaireEstServi(p.data.proprietaire))) return enPause();
  }
  const base = `/${lequel === 'apercu' ? 'p' : 's'}/${id}/`;
  const choix = lequel === 'apercu'
    ? leBuildAServir({ page: cheminDansLeDist(chemin) === 'index.html', demande: new URL(requete.url).searchParams.get('brouillon'), cookie: leCookie(requete), designe: designe.valeur })
    : { empreinte: designe.valeur, cookie: 'garder' as const };
  const r = await servirLeSite(magasin.magasin, choix.empreinte ? racineDuBuild(id, choix.empreinte) : null, chemin,
    { supabaseUrl: publique.valeur.url, cleAnonyme: publique.valeur.cleAnonyme, schema, base, projet: id }, lequel, `${adresseDeLaPlateforme()}${base.replace(/\/$/, '')}`);
  const entetes = new Headers({ 'content-type': r.type, 'cache-control': r.cache, 'x-content-type-options': 'nosniff', vary: 'cookie', ...r.entetes });
  if (choix.cookie === 'poser') entetes.append('set-cookie', `${COOKIE_DU_BROUILLON}=${choix.empreinte}; Path=${base}; HttpOnly; Secure; SameSite=Lax`);
  if (choix.cookie === 'effacer') entetes.append('set-cookie', `${COOKIE_DU_BROUILLON}=; Path=${base}; Max-Age=0; HttpOnly; Secure; SameSite=Lax`);
  // Chaque page servie porte la preuve de sa visite (l'heure, signée), que seul l'envoi d'un formulaire reçoit.
  const secret = secretDeLaPreuve();
  if (secret && r.statut === 200 && r.type.startsWith('text/html')) {
    entetes.append('set-cookie', `${nomDeLaPreuve(id)}=${await emettreLaPreuve(id, Date.now(), secret)}; Path=${CHEMIN_DE_LA_PREUVE}; Max-Age=${DUREE_DE_LA_PREUVE_S}; HttpOnly; Secure; SameSite=Lax`);
  }
  return new Response(new Uint8Array(r.corps), { status: r.statut, headers: entetes });
}

/** La page d'un site en pause : dite au visiteur sans rien de l'abonnement de son propriétaire. */
function enPause(): Response {
  const html = '<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">'
    + '<title>Site en pause</title><style>body{font:16px/1.5 system-ui,sans-serif;margin:0;display:grid;place-items:center;min-height:100vh;background:#fafafa;color:#222}main{max-width:32rem;padding:2rem}</style></head>'
    + '<body><main><h1>Ce site est momentanément en pause</h1><p>Il revient dès que son éditeur l’a remis en ligne.</p><p lang="en">This site is paused for now. It will be back once its publisher brings it online again.</p></main></body></html>';
  return new Response(html, { status: 503, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'retry-after': '3600', 'x-content-type-options': 'nosniff' } });
}
