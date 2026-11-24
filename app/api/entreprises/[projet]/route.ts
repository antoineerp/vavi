/** POST /api/entreprises/<projet> — `capacites.prospects.chercher` : le registre public des entreprises, chacune avec sa source (`lib/capacites/les-entreprises.ts`). */
import { laPorte, leCorpsJson, reponse } from '@/app/_partage/les-capacites-reelles';
import { chercherDesEntreprises, type Criteres } from '@/lib/capacites/les-entreprises';

export const dynamic = 'force-dynamic';

export async function POST(requete: Request, { params }: { params: Promise<{ projet: string }> }) {
  const { projet } = await params;
  const porte = await laPorte(requete, projet, 'prospects', { fenetreS: 300, parProjet: 300, parCompte: 60 });
  if (!porte.ouverte) return reponse(porte.statut, porte.corps);
  const r = await chercherDesEntreprises(await leCorpsJson(requete) as Criteres);
  return r.lu ? reponse(200, { ...r.valeur, repare: r.repare }) : reponse(r.pourquoi.includes('ne répond pas') ? 502 : 400, { error: r.pourquoi });
}
