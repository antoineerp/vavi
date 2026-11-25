/**
 * Une photo fournie par la personne dans « Gérer le contenu » : `/photos/<projet>/<empreinte>.<jpg|png|webp>`, lue au
 * magasin, servie à toute app (son nom est son empreinte : elle ne change jamais, gardée en cache un an). Rien d'autre
 * que ces noms n'est lu, et la réponse ne s'interprète jamais comme une page.
 */
import { magasinS3 } from '@/lib/publication/le-magasin';
import { FICHIER_D_UNE_PHOTO, TYPES_DES_PHOTOS, laCleDeLaPhoto } from '@/lib/images/la-photo-fournie';

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export async function GET(_r: Request, { params }: { params: Promise<{ projet: string; fichier: string }> }) {
  const { projet, fichier } = await params;
  if (!ID.test(projet) || !FICHIER_D_UNE_PHOTO.test(fichier)) return new Response('introuvable', { status: 404 });
  const magasin = magasinS3();
  if (!magasin.lu) return new Response('indisponible', { status: 503 });
  const o = await magasin.magasin.lire(laCleDeLaPhoto(projet, fichier)).catch(() => null);
  if (o === null) return new Response('indisponible', { status: 503 });
  if (o === 'absent') return new Response('introuvable', { status: 404 });
  return new Response(new Uint8Array(o.octets), { headers: {
    'content-type': TYPES_DES_PHOTOS[fichier.split('.')[1]!]!, 'cache-control': 'public, max-age=31536000, immutable',
    'content-security-policy': "default-src 'none'; sandbox", 'cross-origin-resource-policy': 'cross-origin',
  } });
}
