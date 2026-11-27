/**
 * GET /api/occupations/<projet>?table=&du=&au=[&ressource=] — ce qu'une période `exclusive` tient entre deux instants :
 * les périodes prises (début, fin, ressource) et la capacité, sans rien d'autre (ni qui, ni quoi). Une page la lit pour
 * montrer les créneaux libres, même à un visiteur sans compte (`lesOccupations` du gabarit). La base reste seule juge :
 * une réservation prise entre-temps est refusée à l'écriture (23P01).
 *   réponse : 200 `{ capacite, occupations: [{ debut, fin, ressource? }] }` ; 400 forme, 404 projet ou table, 429 débit, 503.
 *
 * Ce qu'il remplace : rien ; un visiteur ne voyait pas les réservations des autres, donc pas les places prises.
 */
import { clientDeService } from '@/lib/supabase/service';
import { leProjetServi } from '@/lib/projets/les-projets';
import { leManifesteStocke } from '@/lib/projets/l-arbre-d-un-projet';
import { schemaDuProjet } from '@/lib/relais/le-schema-d-une-app';
import { plateformePour } from '@/lib/relais/agir-pour-un-compte';
import { uneFenetre } from '@/lib/mcp/les-limites';
import { lEmpreinteDeLAdresse } from '@/app/_partage/les-formulaires-reels';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const PROJET = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const PAR_ADRESSE = uneFenetre({ nombre: 600, fenetreMs: 3_600_000 });
const ENTETES = { 'cache-control': 'no-store', 'access-control-allow-origin': '*' };
const non = (statut: number, error: string) => Response.json({ error }, { status: statut, headers: ENTETES });
const instant = (v: string | null): string | null => (v && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : null);

export async function GET(requete: Request, { params }: { params: Promise<{ projet: string }> }) {
  const projet = (await params).projet.toLowerCase();
  if (!PROJET.test(projet)) return non(404, 'projet inconnu');
  const adresse = lEmpreinteDeLAdresse(requete) ?? 'inconnue';
  if (!PAR_ADRESSE.passe(`${projet}:${adresse}`).passe) return non(429, 'Trop de demandes depuis cette adresse pour l’instant.');
  const q = new URL(requete.url).searchParams;
  const du = instant(q.get('du'));
  const au = instant(q.get('au'));
  const ressource = q.get('ressource');
  if (!du || !au || (ressource !== null && ressource.length > 200)) return non(400, 'La demande porte `table`, `du` et `au` (dates ISO), et `ressource` au besoin.');

  const base = clientDeService();
  const p = await leProjetServi(base, projet);
  if (!p.lu) return non(503, 'Les occupations n’ont pas pu être lues.');
  if (!p.valeur) return non(404, 'projet inconnu');
  const m = leManifesteStocke(p.valeur.appJson);
  const schema = schemaDuProjet(projet);
  if (!m.lu || !schema) return non(503, 'Les occupations n’ont pas pu être lues.');
  const table = m.manifeste.tables.find((t) => t.nom === q.get('table') && t.periode?.exclusive);
  if (!table) return non(404, 'Cette table ne tient pas de période exclusive.');
  const r = await plateformePour(base, p.valeur.proprietaire, schema, `${table.nom}_occupations`, { p_du: du, p_au: au, p_ressource: ressource || null });
  if (!r.lu) {
    console.warn(`[occupations] ${projet.slice(0, 8)} ${table.nom} : ${r.pourquoi}`);
    return r.code === '22023' ? non(400, 'Une fenêtre de 400 jours au plus, du avant au.') : non(503, 'Les occupations n’ont pas pu être lues.');
  }
  return Response.json(r.valeur, { status: 200, headers: ENTETES });
}
