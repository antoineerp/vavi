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
import { lAppDeLHote, leDomaineDesApps } from '@/lib/publication/les-adresses-des-apps';
import { schemaDuProjet } from '@/lib/relais/le-schema-d-une-app';
import { leBuildDesigne } from '@/lib/projets/les-projets';
import { CHEMIN_DE_LA_PREUVE, DUREE_DE_LA_PREUVE_S, emettreLaPreuve, nomDeLaPreuve } from '@/lib/formulaires/le-jugement';
import { secretDeLaPreuve } from './les-formulaires-reels';
import { leSiteDuProprietaireEstServi } from './les-abonnements-reels';
import { laCarteDesDomainesReelle } from './les-domaines-reels';

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
  // La balise Google Search Console du propriétaire va sur le site en ligne ; tant que la migration des réglages n'est pas
  // posée, la colonne manque : on relit sans elle.
  let verificationGoogle: string | null = null;
  if (lequel === 'en_ligne' && designe.valeur) {
    let p = await clientDeService().from('vavi_projets').select('proprietaire, verification_google').eq('id', id).maybeSingle<{ proprietaire: string; verification_google?: string | null }>();
    if (p.error && /verification_google/.test(p.error.message)) p = await clientDeService().from('vavi_projets').select('proprietaire').eq('id', id).maybeSingle<{ proprietaire: string }>();
    if (p.data && !(await leSiteDuProprietaireEstServi(p.data.proprietaire))) return enPause();
    verificationGoogle = p.data?.verification_google ?? null;
  }
  // À son hôte (vague 0), l'app est servie à la racine ; sans domaine des apps, sous `/p/` ou `/s/` de la console.
  const hote = requete.headers.get('host');
  const lesDomaines = await laCarteDesDomainesReelle();
  const ici = lAppDeLHote(hote, leDomaineDesApps(process.env), lesDomaines.parNom);
  // Ou à son domaine à soi, branché (`lib/domaines`) : le site en ligne seul.
  const sonDomaine = lequel === 'en_ligne' && lesDomaines.parHote.get((hote ?? '').toLowerCase().split(':')[0]!) === id;
  const asonHote = (ici?.projet === id && ici.lequel === lequel) || sonDomaine;
  const base = asonHote ? '/' : `/${lequel === 'apercu' ? 'p' : 's'}/${id}/`;
  const racinePublique = asonHote ? `https://${hote!.toLowerCase().split(':')[0]}` : `${adresseDeLaPlateforme()}${base.replace(/\/$/, '')}`;
  const choix = lequel === 'apercu'
    ? leBuildAServir({ page: cheminDansLeDist(chemin) === 'index.html', demande: new URL(requete.url).searchParams.get('brouillon'), cookie: leCookie(requete), designe: designe.valeur })
    : { empreinte: designe.valeur, cookie: 'garder' as const };
  const r = await servirLeSite(magasin.magasin, choix.empreinte ? racineDuBuild(id, choix.empreinte) : null, chemin,
    { supabaseUrl: publique.valeur.url, cleAnonyme: publique.valeur.cleAnonyme, schema, base, projet: id, console: adresseDeLaPlateforme() }, lequel, racinePublique, verificationGoogle);
  const entetes = new Headers({ 'content-type': r.type, 'cache-control': r.cache, 'x-content-type-options': 'nosniff', vary: 'cookie', ...r.entetes });
  // Les fichiers de l'app (code, styles, images), publics, se chargent d'une autre origine : la vue de vavi dans Claude
  // exécute l'aperçu (essai du 24/11). Jamais une page : elle porte la preuve de visite et le cookie du brouillon.
  if (lequel === 'apercu' && !r.type.startsWith('text/html')) entetes.set('access-control-allow-origin', '*');
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
