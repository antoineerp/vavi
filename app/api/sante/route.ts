/** GET /api/sante — la plateforme répond, et dit sa version et si sa configuration est complète. */
import { NextResponse } from 'next/server';
import { configurationPublique, cleDeService } from '@/lib/supabase/configuration';

export const dynamic = 'force-dynamic';

export function GET() {
  const publique = configurationPublique(process.env);
  const service = cleDeService(process.env);
  const manque = [...(publique.lue ? [] : publique.manque), ...(service.lue ? [] : service.manque)];
  return NextResponse.json({
    ok: manque.length === 0,
    version: process.env.VAVI_VERSION ?? 'inconnue',
    manque,
  }, { status: manque.length === 0 ? 200 : 503 });
}
