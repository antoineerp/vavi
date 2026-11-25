/**
 * POST /api/comptes/<projet>/<geste> — les comptes d'une app (`lib/comptes`) : `inscrire`, `entrer`, `lien` (se connecter
 * par un lien), `oublie` (un nouveau mot de passe), `echanger` (le code d'un lien reçu), `rafraichir`, `sortir`, `changer`
 * (le mot de passe, connecté). Le lien d'un courriel ramène toujours dans l'app servie (son adresse, jamais une adresse
 * donnée par l'appelant), au chemin dit. Aucun cookie : la session voyage dans le corps, d'où `*` en CORS.
 */
import { clientDeService } from '@/lib/supabase/service';
import { adresseDeLApp } from '@/app/_partage/l-adresse-des-apps';
import { lesComptesReels, laPersonneDuJeton } from '@/app/_partage/les-comptes-reels';
import { schemaDuProjet } from '@/lib/relais/le-schema-d-une-app';
import { changerLeMotDePasse, echangerUnCode, entrer, envoyerUnLien, rafraichir, sInscrire, sortir, type Issue, type Refus } from '@/lib/comptes/les-comptes';
import { lAdresseDuClient, tropDAppels, uneFenetre } from '@/lib/mcp/les-limites';

export const dynamic = 'force-dynamic';

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'content-type, authorization', 'cache-control': 'no-store' };
const FENETRE = uneFenetre({ nombre: 20, fenetreMs: 60_000 });
const STATUTS: Record<Refus, number> = { adresse_invalide: 400, mot_de_passe_faible: 400, compte_existant: 409, identifiants_invalides: 401, courriel_non_confirme: 403,
  code_invalide: 400, session_echue: 401, courrier_absent: 503, panne: 503 };

const repondre = (corps: unknown, statut = 200): Response => Response.json(corps, { status: statut, headers: CORS });
const rendre = <T,>(r: Issue<T>): Response => (r.ok ? repondre(r.valeur) : repondre({ error: r.refus }, STATUTS[r.refus]));
const texte = (x: unknown, max = 300): string => (typeof x === 'string' ? x.slice(0, max) : '');

export function OPTIONS(): Response { return new Response(null, { status: 204, headers: CORS }); }

export async function POST(requete: Request, { params }: { params: Promise<{ projet: string; geste: string }> }): Promise<Response> {
  const { projet, geste } = await params;
  const app = schemaDuProjet(projet);
  if (!app) return repondre({ error: 'projet_inconnu' }, 404);
  const passe = FENETRE.passe(`${lAdresseDuClient(requete.headers)}:${projet}`);
  if (!passe.passe) return new Response(tropDAppels(passe.apres, { error: 'trop_d_appels' }).body, { status: 429, headers: { ...CORS, 'retry-after': String(passe.apres) } });
  const d = lesComptesReels();
  if (!d) return repondre({ error: 'comptes_indisponibles', detail: 'VAVI_CLE_DES_COMPTES' }, 503);
  const p = await clientDeService().from('vavi_projets').select('*').eq('id', projet).maybeSingle<{ nom: string; inscription_sans_validation?: boolean }>();
  if (p.error) return repondre({ error: 'panne' }, 503);
  if (!p.data) return repondre({ error: 'projet_inconnu' }, 404);
  const c = (await requete.json().catch(() => ({}))) as Record<string, unknown>;
  const chemin = /^\/[\w\-./]{0,200}$/.test(texte(c.chemin)) ? texte(c.chemin) : '/';
  const ctx = { app, nomDeLApp: p.data.nom, langue: texte(c.langue, 8) || 'en',
    retour: `${adresseDeLApp(projet, c.ou === 'apercu' ? 'apercu' : 'en_ligne').replace(/\/$/, '')}${chemin}` };
  const sansValidation = p.data.inscription_sans_validation === true;
  try {
    switch (geste) {
      case 'inscrire': return rendre(await sInscrire(d, { ...ctx, email: texte(c.email), motDePasse: texte(c.motDePasse, 200), sansValidation }));
      case 'entrer': return rendre(await entrer(d, { app, email: texte(c.email), motDePasse: texte(c.motDePasse, 200), sansValidation }));
      case 'lien': return rendre(await envoyerUnLien(d, { ...ctx, email: texte(c.email), nature: 'entrer' }));
      case 'oublie': return rendre(await envoyerUnLien(d, { ...ctx, email: texte(c.email), nature: 'mot_de_passe' }));
      case 'echanger': return rendre(await echangerUnCode(d, { app, code: texte(c.code, 200) }));
      case 'rafraichir': return rendre(await rafraichir(d, { app, rafraichir: texte(c.rafraichir, 200) }));
      case 'sortir': return rendre(await sortir(d, { rafraichir: texte(c.rafraichir, 200) }));
      case 'changer': {
        const jeton = /^Bearer\s+(\S+)$/i.exec(requete.headers.get('authorization') ?? '')?.[1] ?? null;
        const qui = await laPersonneDuJeton(jeton, projet);
        if (!qui) return repondre({ error: 'session_echue' }, 401);
        return rendre(await changerLeMotDePasse(d, { compte: qui.compte, motDePasse: texte(c.motDePasse, 200) }));
      }
      default: return repondre({ error: 'geste_inconnu' }, 404);
    }
  } catch (e) {
    console.error(`[comptes] ${projet.slice(0, 8)} ${geste} : ${(e as Error).message}`);
    return repondre({ error: 'panne' }, 503);
  }
}
