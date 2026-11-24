/** POST /api/geocode/<projet> — `capacites.lieu.chercher` : une adresse, ses lieux, leurs coordonnées et leur fuseau (`lib/capacites/les-lieux.ts`). */
import { laPorte, leCorpsJson, reponse } from '@/app/_partage/les-capacites-reelles';
import { chercherUnLieu, laQuestion } from '@/lib/capacites/les-lieux';

export const dynamic = 'force-dynamic';

export async function POST(requete: Request, { params }: { params: Promise<{ projet: string }> }) {
  const { projet } = await params;
  const porte = await laPorte(requete, projet, 'lieu', { fenetreS: 60, parProjet: 60, parCompte: 30 });
  if (!porte.ouverte) return reponse(porte.statut, porte.corps);
  const q = laQuestion(await leCorpsJson(requete));
  if (!q.lu) return reponse(400, { error: q.pourquoi });
  const r = await chercherUnLieu(q.valeur);
  return r.lu ? reponse(200, { results: r.valeur }) : reponse(r.sature ? 429 : 502, { error: r.pourquoi });
}
