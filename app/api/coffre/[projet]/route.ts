/**
 * POST /api/coffre/<projet> — `capacites.coffre` : le coffre de l'organisation, depuis son app (`lib/capacites/le-coffre.ts`).
 *   multipart { fichier }              → déposer ;
 *   json { geste: 'ouvrir', id }       → les octets d'un fichier de SON organisation ;
 *   json { geste: 'retirer', id }      → retiré de la base, effacé du seau ;
 *   json { geste: 'vider', confirmer } → tout le coffre de l'organisation (un rôle qui gère l'équipe).
 * Lister et l'état passent par le relais (lecture, sous la RLS).
 */
import { laPorte, leCorpsJson, reponse } from '@/app/_partage/les-capacites-reelles';
import { leCoffreReel, unFichier } from '@/app/_partage/les-fichiers-reels';
import { deposerAuCoffre, ouvrirDuCoffre, retirerDuCoffre, viderLeCoffre, OCTETS_D_UN_DOCUMENT } from '@/lib/capacites/le-coffre';

export const dynamic = 'force-dynamic';

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(requete: Request, { params }: { params: Promise<{ projet: string }> }) {
  const { projet } = await params;
  const porte = await laPorte(requete, projet, 'coffre', { fenetreS: 600, parProjet: 2000, parCompte: 120 });
  if (!porte.ouverte) return reponse(porte.statut, porte.corps);
  const compte = porte.compte!;
  const d = leCoffreReel();

  if ((requete.headers.get('content-type') ?? '').includes('multipart/form-data')) {
    const f = (await requete.formData().catch(() => null))?.get('fichier');
    if (!f || typeof f === 'string') return reponse(400, { error: 'le formulaire porte le fichier dans « fichier »' });
    if (f.size > OCTETS_D_UN_DOCUMENT) return reponse(413, { error: `« ${f.name} » pèse plus de ${OCTETS_D_UN_DOCUMENT / 1024 / 1024} Mo` });
    const r = await deposerAuCoffre(projet, compte, { nom: f.name || 'document', octets: new Uint8Array(await f.arrayBuffer()), type: f.type || null }, d);
    return r.lu ? reponse(200, r.valeur) : reponse(409, { error: r.pourquoi });
  }

  const corps = await leCorpsJson(requete);
  if (corps.geste === 'vider') {
    if (corps.confirmer !== true) return reponse(400, { error: 'vider le coffre est définitif : l’écran le fait confirmer (« confirmer »: true)' });
    const r = await viderLeCoffre(projet, compte, d);
    return r.lu ? reponse(200, r.valeur) : reponse(409, { error: r.pourquoi });
  }
  const id = typeof corps.id === 'string' && ID.test(corps.id) ? corps.id : null;
  if (!id) return reponse(400, { error: '« id » est l’identifiant d’un fichier du coffre (rendu par la liste)' });
  if (corps.geste === 'ouvrir') {
    const r = await ouvrirDuCoffre(projet, compte, id, d);
    return r.lu ? unFichier(r.valeur) : reponse(404, { error: r.pourquoi });
  }
  if (corps.geste === 'retirer') {
    const r = await retirerDuCoffre(projet, compte, id, d);
    return r.lu ? reponse(200, { ok: true }) : reponse(409, { error: r.pourquoi });
  }
  return reponse(400, { error: '« geste » est ouvrir, retirer ou vider (déposer : un formulaire avec « fichier »)' });
}
