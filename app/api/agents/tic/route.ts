/**
 * POST /api/agents/tic — la base appelle vavi (`vavi_le_tic`, chaque minute par pg_cron) quand une course d'agent attend :
 * une heure due, une ligne arrivée. Sans secret : l'appel ne fait que ce que la file contient déjà, et un serveur ne
 * fait qu'une tournée à la fois. Chaque agent tourne pour le PROPRIÉTAIRE de l'app (la RLS décide), sur le build de la
 * dernière version publiée (l'aperçu), comme son bouton dans l'aperçu.
 */
import { reponse } from '@/app/_partage/les-capacites-reelles';
import { clientDeService } from '@/lib/supabase/service';
import { magasinS3 } from '@/lib/publication/le-magasin';
import { schemaDuProjet } from '@/lib/relais/le-schema-d-une-app';
import { ouvrirUnSecret } from '@/lib/mcp/les-jetons';
import { faireTournerUnAgent } from '@/lib/agents/l-agent-reel';
import { faireLesCourses, lirePrise } from '@/lib/agents/les-courses';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

let enTournee = false;

export async function POST() {
  if (enTournee) return reponse(202, { deja: true });
  enTournee = true;
  try {
    const base = clientDeService();
    const r = await faireLesCourses({
      budgetMs: 200_000,
      async prendre() {
        const p = await base.rpc('vavi_prendre_une_course');
        return p.error ? { lu: false, pourquoi: p.error.message } : { lu: true, valeur: lirePrise(p.data) };
      },
      async courir(p) {
        const schema = schemaDuProjet(p.projet);
        if (!schema) return { raison: 'unknown project' };
        const projet = await base.from('vavi_projets').select('proprietaire, apercu_empreinte').eq('id', p.projet)
          .maybeSingle<{ proprietaire: string; apercu_empreinte: string | null }>();
        if (projet.error) return { raison: `the database did not answer (${projet.error.message})` };
        if (!projet.data?.apercu_empreinte) return { raison: 'the app has no published version' };
        const magasin = magasinS3();
        if (!magasin.lu) return { raison: 'the storage of the builds is not configured' };
        return faireTournerUnAgent({ base, magasin: magasin.magasin, ouvrir: ouvrirUnSecret, projet: p.projet, empreinte: projet.data.apercu_empreinte,
          agent: { nom: p.agent, ia_par_jour: p.iaParJour }, schema, compte: projet.data.proprietaire, declencheur: p.declencheur });
      },
      async finir(id, issue) {
        const f = await base.rpc('vavi_finir_une_course', { p_id: id, p_issue: issue });
        return f.error ? { lu: false, pourquoi: f.error.message } : { lu: true, valeur: f.data === true };
      },
    });
    if (r.panne) console.error(`[agent] tournée arrêtée : ${r.panne}`);
    return reponse(r.panne ? 503 : 200, { faites: r.faites });
  } finally {
    enTournee = false;
  }
}
