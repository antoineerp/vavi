/**
 * POST /api/compte/<projet>/quitter — la personne connectée à une app demande l'effacement de son compte : un lien de
 * confirmation part à son adresse confirmée (`lib/conformite/l-effacement.ts`). Rien ne s'efface ici.
 */
import { NextResponse } from 'next/server';
import { demanderLEffacement } from '@/lib/conformite/l-effacement';
import { lEffacementReel } from '@/app/_partage/la-conformite-reelle';

export const dynamic = 'force-dynamic';

export async function POST(requete: Request, { params }: { params: Promise<{ projet: string }> }) {
  const { projet } = await params;
  const jeton = /^Bearer\s+(\S+)$/i.exec(requete.headers.get('authorization') ?? '')?.[1] ?? null;
  const corps = (await requete.json().catch(() => null)) as { langue?: unknown } | null;
  const r = await demanderLEffacement(lEffacementReel(), projet, jeton, typeof corps?.langue === 'string' ? corps.langue : 'en');
  return NextResponse.json(r.corps, { status: r.statut });
}
