/** POST /api/file/<projet>/parse — `capacites.lecture.lire` : le texte réel d'un fichier choisi dans l'app (`lib/capacites/la-lecture-de-fichiers.ts`). Corps : multipart, champ `file`. */
import { laPorte, reponse } from '@/app/_partage/les-capacites-reelles';
import { lireUnFichier, TAILLE_MAX_A_LIRE } from '@/lib/capacites/la-lecture-de-fichiers';

export const dynamic = 'force-dynamic';

export async function POST(requete: Request, { params }: { params: Promise<{ projet: string }> }) {
  const { projet } = await params;
  const porte = await laPorte(requete, projet, 'lecture', { fenetreS: 600, parProjet: 300, parCompte: 60 });
  if (!porte.ouverte) return reponse(porte.statut, porte.corps);
  if (Number(requete.headers.get('content-length') ?? 0) > TAILLE_MAX_A_LIRE + 64 * 1024) return reponse(413, { error: 'le fichier dépasse 10 Mo' });
  const form = await requete.formData().catch(() => null);
  const f = form?.get('file');
  if (!f || typeof f === 'string') return reponse(400, { error: 'aucun fichier (champ `file`)' });
  const r = await lireUnFichier(new Uint8Array(await f.arrayBuffer()), f.name || 'fichier');
  return r.lu ? reponse(200, { text: r.valeur.texte, filename: f.name || 'fichier', type: r.valeur.nature, chars: r.valeur.texte.length }) : reponse(422, { error: r.pourquoi });
}
