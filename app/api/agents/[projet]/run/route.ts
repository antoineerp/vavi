/**
 * POST /api/agents/<projet>/run — le bouton d'un agent (`<Agent nom>`, réveil `bouton`) : la personne connectée, qui a
 * l'un des rôles de `reveil.par`, lance son code avec SES droits (la RLS de l'app décide), sur le build qu'elle regarde
 * (l'aperçu ou le site en ligne). Plafonné en base par personne.
 */
import { leCorpsJson, reponse } from '@/app/_partage/les-capacites-reelles';
import { laPersonneConnectee } from '@/app/_partage/la-vente-reelle';
import { clientDeService } from '@/lib/supabase/service';
import { magasinS3 } from '@/lib/publication/le-magasin';
import { leManifesteStocke } from '@/lib/projets/l-arbre-d-un-projet';
import { schemaDuProjet } from '@/lib/relais/le-schema-d-une-app';
import { agirPourUnCompte } from '@/lib/relais/agir-pour-un-compte';
import { ouvrirUnSecret, scellerUnSecret } from '@/lib/mcp/les-jetons';
import { faireTournerUnAgent } from '@/lib/agents/l-agent-reel';
import { leBuildDuBouton } from '@/lib/agents/le-build-du-bouton';

export const dynamic = 'force-dynamic';
export const maxDuration = 150;

export async function POST(requete: Request, { params }: { params: Promise<{ projet: string }> }) {
  const { projet } = await params;
  const schema = schemaDuProjet(projet);
  if (!schema) return reponse(404, { error: 'projet inconnu' });
  const corps = await leCorpsJson(requete);
  const nom = typeof corps.agent === 'string' ? corps.agent : '';
  const entree = typeof corps.entree === 'string' ? corps.entree.slice(0, 4000) : '';
  const personne = await laPersonneConnectee(requete);
  if (!personne) return reponse(401, { error: 'connectez-vous d’abord' });
  const base = clientDeService();
  const p = await base.from('vavi_projets').select('apercu_empreinte, en_ligne_empreinte').eq('id', projet).maybeSingle<{ apercu_empreinte: string | null; en_ligne_empreinte: string | null }>();
  if (p.error) return reponse(503, { error: 'base indisponible' });
  if (!p.data) return reponse(404, { error: 'projet inconnu' });
  const f = await base.from('vavi_fichiers').select('contenu').eq('projet', projet).eq('chemin', 'app.json').maybeSingle<{ contenu: string }>();
  const m = leManifesteStocke(f.data?.contenu);
  if (f.error || !m.lu) return reponse(503, { error: 'app.json illisible' });
  const agent = m.manifeste.agents.find((a) => a.nom === nom);
  if (!agent || agent.reveil.type !== 'bouton') return reponse(404, { error: `aucun agent « ${nom} » ne se lance d’un bouton dans cette app` });
  // Ses rôles, lus COMME elle : la RLS de l'app décide de ce qu'elle voit de `membres`.
  const r = await agirPourUnCompte(base, personne.compte, 'voie_neuve_lire', { p_schema: schema, p_table: 'membres', p_egal: { compte_id: personne.compte }, p_limite: 50 });
  const roles = r.lu ? ((r.valeur as { lignes?: { role?: unknown }[] } | null)?.lignes ?? []).map((x) => String(x.role)) : [];
  if (!agent.reveil.par.some((x) => roles.includes(x))) return reponse(403, { error: 'votre rôle ne lance pas cet agent' });
  const ok = await base.rpc('vavi_plafond', { p_cle: `agent:${projet}:${nom}:${personne.compte}`, p_fenetre_s: 3600, p_max: 30 });
  if (ok.error) return reponse(503, { error: 'base indisponible' });
  if (ok.data !== true) return reponse(429, { error: 'trop de lancements', detail: 'réessayez dans une heure' });
  const empreinte = leBuildDuBouton(requete.headers.get('referer'), projet, { apercu: p.data.apercu_empreinte, enLigne: p.data.en_ligne_empreinte });
  if (!empreinte) return reponse(409, { error: 'cette app n’a pas encore de build' });
  const magasin = magasinS3();
  if (!magasin.lu) return reponse(503, { error: 'magasin indisponible' });
  const c = await faireTournerUnAgent({ base, magasin: magasin.magasin, ouvrir: ouvrirUnSecret, sceller: scellerUnSecret, projet, empreinte, agent, schema, compte: personne.compte,
    declencheur: { type: 'bouton', entree } });
  if ('raison' in c) return reponse(503, { error: 'l’agent n’a pas pu tourner', detail: c.raison });
  console.log(`[agent] ${projet.slice(0, 8)} ${nom} bouton ${c.ok ? 'fini' : c.etape} en ${c.duree} ms, ${c.ia} appel(s) à l'IA`);
  if (!c.ok) return reponse(422, { error: 'l’agent s’est arrêté', detail: c.erreur, journal: c.journal });
  return reponse(200, { resultat: c.resultat, journal: c.journal });
}
