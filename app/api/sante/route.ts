/** GET /api/sante — la plateforme répond, et dit sa version et si sa configuration est complète (Supabase et le magasin des builds). */
import { NextResponse } from 'next/server';
import { configurationPublique, cleDeService } from '@/lib/supabase/configuration';
import { lesReglagesDuMagasin } from '@/lib/publication/les-reglages-du-magasin';
import { leDomaineDesApps } from '@/lib/publication/les-adresses-des-apps';

export const dynamic = 'force-dynamic';

export function GET() {
  const publique = configurationPublique(process.env);
  const service = cleDeService(process.env);
  const magasin = lesReglagesDuMagasin(process.env);
  const vital = [...(publique.lue ? [] : publique.manque), ...(service.lue ? [] : service.manque)];
  const manque = [...vital, ...(magasin.lu ? [] : magasin.manque)];
  // Sans Supabase le serveur ne sert rien (503, la vérification de santé de l'hébergeur le voit) ; sans magasin il
  // sert la console mais ni aperçu ni publication : dit dans `manque`, sans arrêter la machine.
  return NextResponse.json({
    ok: manque.length === 0,
    version: process.env.VAVI_VERSION ?? 'inconnue',
    manque,
    // Où les apps sont servies : à leur hôte (le domaine des apps), ou encore sous /p/ et /s/ de la console (à éviter).
    apps: leDomaineDesApps(process.env) ? 'a_leur_hote' : 'sous_la_console',
  }, { status: vital.length === 0 ? 200 : 503 });
}
