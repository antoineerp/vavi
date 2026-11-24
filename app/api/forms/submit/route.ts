/** POST /api/forms/submit — un formulaire de visiteur d'une app (`lib/formulaires`) : jugé, gardé, transmis au propriétaire. */
import { recevoirUnEnvoi } from '@/lib/formulaires/les-messages';
import { laVisiteAttendue, nomDeLaPreuve } from '@/lib/formulaires/le-jugement';
import { laReceptionReelle, lEmpreinteDeLAdresse, secretDeLaPreuve } from '@/app/_partage/les-formulaires-reels';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const PROJET = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const leCookie = (requete: Request, nom: string): string | null =>
  (requete.headers.get('cookie') ?? '').split(';').map((x) => x.trim()).find((x) => x.startsWith(`${nom}=`))?.slice(nom.length + 1) ?? null;

export async function POST(requete: Request) {
  const corps = await requete.json().catch(() => null) as { projectId?: unknown; formKey?: unknown; data?: unknown; page?: unknown } | null;
  const projet = typeof corps?.projectId === 'string' ? corps.projectId.toLowerCase() : '';
  if (!PROJET.test(projet)) return Response.json({ error: 'projet inconnu' }, { status: 404 });
  const secret = secretDeLaPreuve();
  const maintenant = Date.now();
  const visite = secret ? await laVisiteAttendue({ hote: requete.headers.get('host'), origine: requete.headers.get('origin'), referer: requete.headers.get('referer'),
    preuve: leCookie(requete, nomDeLaPreuve(projet)) }, projet, maintenant, secret) : null;
  const r = await recevoirUnEnvoi({ ...laReceptionReelle(), maintenant }, { projet, formulaire: corps?.formKey, data: corps?.data, page: corps?.page, adresse: lEmpreinteDeLAdresse(requete), visite });
  if (r.statut !== 200) return Response.json({ error: r.pourquoi }, { status: r.statut, headers: { 'cache-control': 'no-store' } });
  if (r.verdict.spam) console.log(`[formulaires] ${projet.slice(0, 8)} gardé en spam : ${r.verdict.motif}`);
  // La même réponse au visiteur, qu'il soit jugé humain ou non : un robot n'apprend rien.
  return Response.json({ ok: true }, { headers: { 'cache-control': 'no-store' } });
}
