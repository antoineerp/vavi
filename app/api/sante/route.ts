/** GET /api/sante — la plateforme répond, et dit sa version et si sa configuration est complète (Supabase et le magasin des builds) ;
 * `?navigateur=oui` essaie en plus le navigateur du serveur (pré-rendu, captures). */
import { NextResponse, type NextRequest } from 'next/server';
import { configurationPublique, cleDeService } from '@/lib/supabase/configuration';
import { lesReglagesDuMagasin } from '@/lib/publication/les-reglages-du-magasin';
import { leDomaineDesApps } from '@/lib/publication/les-adresses-des-apps';
import { lEtatDeLaCle, laRaisonDeLaCle } from '@/lib/comptes/les-jetons';
import { essayerLeNavigateur } from '@/lib/seo/le-pre-rendu';

export const dynamic = 'force-dynamic';

/** Un essai du navigateur au plus par minute : la route est publique, un Chromium par appel se paierait cher. */
let dernierEssai: { readonly a: number; readonly r: Awaited<ReturnType<typeof essayerLeNavigateur>> } | null = null;
async function leNavigateur() {
  if (dernierEssai && Date.now() - dernierEssai.a < 60_000) return { ...dernierEssai.r, essaye_il_y_a_s: Math.round((Date.now() - dernierEssai.a) / 1000) };
  dernierEssai = { a: Date.now(), r: await essayerLeNavigateur() };
  return dernierEssai.r;
}

export async function GET(req: NextRequest) {
  const publique = configurationPublique(process.env);
  const service = cleDeService(process.env);
  const magasin = lesReglagesDuMagasin(process.env);
  const vital = [...(publique.lue ? [] : publique.manque), ...(service.lue ? [] : service.manque)];
  const manque = [...vital, ...(magasin.lu ? [] : magasin.manque)];
  // Sans Supabase le serveur ne sert rien (503, la vérification de santé de l'hébergeur le voit) ; sans magasin il
  // sert la console mais ni aperçu ni publication : dit dans `manque`, sans arrêter la machine.
  // Le navigateur (pré-rendu, captures, mesure de l'accueil) n'est essayé que sur demande : la vérification de santé de
  // l'hébergeur appelle cette route toutes les quelques secondes, et un Chromium par appel la ralentirait.
  const navigateur = req.nextUrl.searchParams.get('navigateur') === 'oui' ? await leNavigateur() : undefined;
  const etatDeLaCle = await lEtatDeLaCle(process.env, publique.lue ? publique.valeur.url : null);
  return NextResponse.json({
    ok: manque.length === 0,
    version: process.env.VAVI_VERSION ?? 'inconnue',
    manque,
    // Où les apps sont servies : à leur hôte (le domaine des apps), ou encore sous /p/ et /s/ de la console (à éviter).
    apps: leDomaineDesApps(process.env) ? 'a_leur_hote' : 'sous_la_console',
    // La clé qui signe les connexions des comptes d'app (`lib/comptes`) : `publiee` quand Supabase la reconnaît.
    cle_des_comptes: etatDeLaCle,
    // Illisible : la forme vue et ce qui manque, jamais la clé.
    ...(etatDeLaCle === 'illisible' ? { cle_des_comptes_pourquoi: laRaisonDeLaCle(process.env.VAVI_CLE_DES_COMPTES) } : {}),
    ...(navigateur ? { navigateur } : {}),
  }, { status: vital.length === 0 ? 200 : 503 });
}
