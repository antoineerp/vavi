/**
 * POST /api/pieces/<projet> — LA PIÈCE JOINTE D'UNE LIGNE, depuis son app (`lib/capacites/les-pieces-jointes.ts`).
 *   multipart { fichier, table, id, colonne }   → joindre (remplace la pièce d'avant) ;
 *   json { geste: 'ouvrir', table, id, colonne }  → les octets de la pièce d'une ligne que le compte voit ;
 *   json { geste: 'retirer', table, id, colonne } → la colonne vidée, le fichier effacé.
 * L'aperçu 3D (`apercu`) ouvre le fichier sur le serveur : il attend le bac à sable de la vague 0 (501).
 */
import { laPorte, leCorpsJson, reponse } from '@/app/_partage/les-capacites-reelles';
import { lesOrphelinesReelles, lesPiecesReelles, unFichier } from '@/app/_partage/les-fichiers-reels';
import { joindreUnePiece, lireLaCible, ouvrirUnePiece, retirerUnePiece, OCTETS_D_UNE_PIECE } from '@/lib/capacites/les-pieces-jointes';
import { effacerLesPiecesOrphelinesSiDu } from '@/lib/capacites/les-pieces-orphelines';

export const dynamic = 'force-dynamic';

export async function POST(requete: Request, { params }: { params: Promise<{ projet: string }> }) {
  const { projet } = await params;
  const porte = await laPorte(requete, projet, 'pieces', { fenetreS: 600, parProjet: 2000, parCompte: 120 });
  if (!porte.ouverte) return reponse(porte.statut, porte.corps);
  const compte = porte.compte!;
  const d = lesPiecesReelles();
  // Ce que plus aucune ligne ne cite part du seau, au plus toutes les 30 min : jamais sur le chemin de la réponse.
  void effacerLesPiecesOrphelinesSiDu(lesOrphelinesReelles());

  if ((requete.headers.get('content-type') ?? '').includes('multipart/form-data')) {
    const forme = await requete.formData().catch(() => null);
    const f = forme?.get('fichier');
    if (!forme || !f || typeof f === 'string') return reponse(400, { error: 'le formulaire porte le fichier dans « fichier »' });
    const cible = lireLaCible({ table: forme.get('table'), id: forme.get('id'), colonne: forme.get('colonne') });
    if (!cible.lu) return reponse(400, { error: cible.pourquoi });
    if (f.size > OCTETS_D_UNE_PIECE) return reponse(413, { error: `« ${f.name} » pèse plus de ${OCTETS_D_UNE_PIECE / 1024 / 1024} Mo` });
    const r = await joindreUnePiece(projet, compte, cible.valeur, { nom: f.name || 'pièce', octets: new Uint8Array(await f.arrayBuffer()), type: f.type || null }, d);
    return r.lu ? reponse(200, r.valeur) : reponse(409, { error: r.pourquoi });
  }

  const corps = await leCorpsJson(requete);
  const cible = lireLaCible(corps);
  if (!cible.lu) return reponse(400, { error: cible.pourquoi });
  if (corps.geste === 'ouvrir') {
    const r = await ouvrirUnePiece(projet, compte, cible.valeur, d);
    return r.lu ? unFichier(r.valeur) : reponse(404, { error: r.pourquoi });
  }
  if (corps.geste === 'retirer') {
    const r = await retirerUnePiece(projet, compte, cible.valeur, d);
    return r.lu ? reponse(200, { ok: true }) : reponse(409, { error: r.pourquoi });
  }
  if (corps.geste === 'apercu') return reponse(501, { error: 'l’aperçu en 3D n’est pas encore servi par vavi', detail: 'la pièce s’ouvre par le geste « ouvrir »' });
  return reponse(400, { error: '« geste » est ouvrir ou retirer (joindre : un formulaire avec « fichier »)' });
}
