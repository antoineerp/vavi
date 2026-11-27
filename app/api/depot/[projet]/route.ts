/**
 * POST /api/depot/<projet> — ce qu'un visiteur envoie SANS COMPTE dans une table que app.json lui ouvre (`envoyerSansCompte`
 * du gabarit, `lib/relais/l-envoi-sans-compte.ts`).
 *   multipart : `depot` = JSON `{ table, ligne }` ; chaque fichier sous le nom de sa colonne.
 *   réponse : 201 `{ id, ligne }` (la ligne gardée, ce que la base a calculé) ; 400 forme, 404 projet, 413 fichier trop lourd,
 *   409 la période est déjà prise (`periode.exclusive`), 422 refusé (table fermée au visiteur, champ inconnu, envoi jugé machinal), 429 débit, 503.
 * La porte d'un visiteur : débit borné par projet et par adresse, envoi jugé comme un formulaire (le leurre, le texte tiré
 * au hasard, la visite servie) ; la plateforme écrit au nom du propriétaire, sous la sécurité des lignes de l'app.
 *
 * Ce qu'il remplace : rien (essai d'Antoine du 26/11 : la route manquait, tout envoi d'un visiteur dans une table échouait).
 * L'envoi gardé arrive aussi dans « Messages » et par courriel (`transmettreUneLigne`).
 */
import { clientDeService } from '@/lib/supabase/service';
import { leProjetServi } from '@/lib/projets/les-projets';
import { leManifesteStocke } from '@/lib/projets/l-arbre-d-un-projet';
import { schemaDuProjet } from '@/lib/relais/le-schema-d-une-app';
import { agirPourUnCompte } from '@/lib/relais/agir-pour-un-compte';
import { envoyerSansCompte, type PieceEnvoyee } from '@/lib/relais/l-envoi-sans-compte';
import { joindreUnePiece, OCTETS_D_UNE_PIECE } from '@/lib/capacites/les-pieces-jointes';
import { laVisiteAttendue, nomDeLaPreuve, premierSpam, sansLesChampsDuJugement, verdictDeLaVisite, verdictDesChamps, verdictDuContenu } from '@/lib/formulaires/le-jugement';
import { uneFenetre } from '@/lib/mcp/les-limites';
import { lesPiecesReelles } from '@/app/_partage/les-fichiers-reels';
import { laReceptionReelle, lEmpreinteDeLAdresse, secretDeLaPreuve } from '@/app/_partage/les-formulaires-reels';
import { transmettreUneLigne } from '@/lib/formulaires/les-messages';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const PROJET = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const OCTETS_DE_LA_LIGNE = 64 * 1024;
const PAR_PROJET = uneFenetre({ nombre: 300, fenetreMs: 3_600_000 });
const PAR_ADRESSE = uneFenetre({ nombre: 20, fenetreMs: 3_600_000 });
const non = (statut: number, error: string) => Response.json({ error }, { status: statut, headers: { 'cache-control': 'no-store' } });
const leCookie = (requete: Request, nom: string): string | null =>
  (requete.headers.get('cookie') ?? '').split(';').map((x) => x.trim()).find((x) => x.startsWith(`${nom}=`))?.slice(nom.length + 1) ?? null;

export async function POST(requete: Request, { params }: { params: Promise<{ projet: string }> }) {
  const projet = (await params).projet.toLowerCase();
  if (!PROJET.test(projet)) return non(404, 'projet inconnu');
  const adresse = lEmpreinteDeLAdresse(requete) ?? 'inconnue';
  if (!PAR_PROJET.passe(projet).passe || !PAR_ADRESSE.passe(`${projet}:${adresse}`).passe) return non(429, 'Trop d’envois depuis cette adresse pour l’instant.');

  const forme = await requete.formData().catch(() => null);
  const brut = forme?.get('depot');
  if (!forme || typeof brut !== 'string' || brut.length > OCTETS_DE_LA_LIGNE) return non(400, 'L’envoi porte « depot » : { table, ligne } en JSON.');
  let depot: { table?: unknown; ligne?: unknown };
  try { depot = JSON.parse(brut) as typeof depot; } catch { return non(400, 'JSON invalide'); }
  const pieces: PieceEnvoyee[] = [];
  for (const [colonne, f] of forme.entries()) {
    if (colonne === 'depot' || typeof f === 'string') continue;
    if (f.size > OCTETS_D_UNE_PIECE) return non(413, `« ${f.name} » pèse plus de ${OCTETS_D_UNE_PIECE / 1024 / 1024} Mo.`);
    pieces.push({ colonne, nom: f.name || 'pièce', octets: new Uint8Array(await f.arrayBuffer()), type: f.type || null });
  }

  // Jugé comme un formulaire : une machine n'écrit rien dans l'app.
  const ligne = (depot.ligne && typeof depot.ligne === 'object' && !Array.isArray(depot.ligne) ? depot.ligne : {}) as Record<string, unknown>;
  const secret = secretDeLaPreuve();
  const maintenant = Date.now();
  const visite = secret ? await laVisiteAttendue({ hote: requete.headers.get('host'), origine: requete.headers.get('origin'), referer: requete.headers.get('referer'),
    preuve: leCookie(requete, nomDeLaPreuve(projet)) }, projet, maintenant, secret) : null;
  const verdict = premierSpam(verdictDesChamps(ligne, maintenant), verdictDuContenu(ligne), verdictDeLaVisite(ligne, visite));
  if (verdict.spam) {
    console.warn(`[depot] ${projet.slice(0, 8)} refusé (${verdict.motif}) : ${verdict.detail}`);
    return non(422, 'L’envoi n’a pas été reconnu comme venant d’une personne : il repart après un rechargement de la page.');
  }

  const base = clientDeService();
  const p = await leProjetServi(base, projet);
  if (!p.lu) return non(503, 'L’envoi n’a pas pu être reçu.');
  if (!p.valeur) return non(404, 'projet inconnu');
  const m = leManifesteStocke(p.valeur.appJson);
  const schema = schemaDuProjet(projet);
  if (!m.lu || !schema) return non(503, 'L’envoi n’a pas pu être reçu.');
  const proprietaire = p.valeur.proprietaire;
  const pj = lesPiecesReelles();
  const r = await envoyerSansCompte(m.manifeste, schema, { table: depot.table, ligne: sansLesChampsDuJugement(ligne) }, pieces, {
    relais: (fonction, args) => agirPourUnCompte(base, proprietaire, fonction, args),
    joindre: (cible, piece) => joindreUnePiece(projet, proprietaire, cible, piece, pj),
  });
  if (r.statut === 201) {
    console.info(`[depot] ${projet.slice(0, 8)} ${String(depot.table)} reçu${pieces.length ? ` · ${pieces.length} fichier(s)` : ''}`);
    // Aussi dans « Messages » et par courriel, chaque champ sous son libellé : le propriétaire sait qu'on lui a écrit.
    // Un échec ici ne défait pas l'envoi : la ligne est gardée dans l'app.
    const table = m.manifeste.tables.find((t) => t.nom === depot.table);
    if (table) {
      const envoye = sansLesChampsDuJugement(ligne);
      const lisible = Object.fromEntries([
        ...table.champs.filter((c) => envoye[c.nom] !== undefined && envoye[c.nom] !== null && envoye[c.nom] !== '').map((c) => [c.libelle, envoye[c.nom]]),
        ...pieces.map((x) => [table.champs.find((c) => c.nom === x.colonne)?.libelle ?? x.colonne, `fichier joint : ${x.nom}`]),
      ]);
      const page = typeof forme.get('page') === 'string' ? String(forme.get('page')) : null;
      const t = await transmettreUneLigne(laReceptionReelle(), { projet, table: table.nom, ligne: lisible, page, adresse: adresse === 'inconnue' ? null : adresse }).catch((e) => ({ lu: false as const, pourquoi: String(e) }));
      if (!t.lu) console.warn(`[depot] ${projet.slice(0, 8)} non transmis à la boîte : ${t.pourquoi}`);
    }
  }
  return Response.json(r.corps, { status: r.statut, headers: { 'cache-control': 'no-store' } });
}
