/** POST /api/ephemeride/<projet> — `capacites.ephemeride.ciel` : le ciel réel d'une date, d'une heure et d'un lieu (`lib/capacites/le-ciel-d-une-naissance.ts`). */
import { laPorte, leCorpsJson, reponse } from '@/app/_partage/les-capacites-reelles';
import { leCielDUneNaissance, lireLEntreeDuCiel } from '@/lib/capacites/le-ciel-d-une-naissance';

export const dynamic = 'force-dynamic';

export async function POST(requete: Request, { params }: { params: Promise<{ projet: string }> }) {
  const { projet } = await params;
  const porte = await laPorte(requete, projet, 'ephemeride', { fenetreS: 300, parProjet: 600, parCompte: 120 });
  if (!porte.ouverte) return reponse(porte.statut, porte.corps);
  const e = lireLEntreeDuCiel(await leCorpsJson(requete));
  if (!e.ok) return reponse(400, { error: e.raison, detail: 'cherchez d’abord le lieu (capacites.lieu.chercher) : il rend latitude, longitude et fuseau' });
  const r = await leCielDUneNaissance(e.entree);
  return r.ok ? reponse(200, r.ciel) : reponse(400, { error: `le ciel ne peut pas être calculé : ${r.raison}` });
}
