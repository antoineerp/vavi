/**
 * POST /api/ai/<projet>/complete — `<ProposerParLIA>` et toute page qui appelle l'IA : sur la clé Anthropic du
 * propriétaire (`lib/capacites/l-ia.ts`), derrière un compte membre de l'app, plafonnée en base.
 */
import { laPorte, leCorpsJson, lesSecretsDuProjet, reponse } from '@/app/_partage/les-capacites-reelles';
import { clientDeService } from '@/lib/supabase/service';
import { plateformePour } from '@/lib/relais/agir-pour-un-compte';
import { schemaDuProjet } from '@/lib/relais/le-schema-d-une-app';
import {
  appelerLeModele, enregistrerLaProposition, laReponseHttp, laRequete, lireLaDemande, lireLaReponse, MODELE_PAR_DEFAUT, SECRET_DE_L_IA,
} from '@/lib/capacites/l-ia';

export const dynamic = 'force-dynamic';

export async function POST(requete: Request, { params }: { params: Promise<{ projet: string }> }) {
  const { projet } = await params;
  const porte = await laPorte(requete, projet, 'ia', { fenetreS: 600, parProjet: 600, parCompte: 60 });
  if (!porte.ouverte) return reponse(porte.statut, porte.corps);
  const d = lireLaDemande(await leCorpsJson(requete));
  if (!d.lu) return reponse(400, { error: d.pourquoi });
  const cle = await lesSecretsDuProjet(projet)(SECRET_DE_L_IA);
  if (!cle.lu) return reponse(503, { error: 'clé du propriétaire illisible', detail: cle.pourquoi });
  if (!cle.valeur) return reponse(503, { error: 'l’IA n’est pas branchée pour cette app', detail: `le propriétaire pose sa clé ${SECRET_DE_L_IA} dans la console (Secrets)` });

  const r = await appelerLeModele((u, i) => fetch(u, i), cle.valeur, laRequete(d.valeur, process.env.VAVI_MODELE_DES_APPS || MODELE_PAR_DEFAUT), requete.signal);
  if (!r.lu) return reponse(502, { error: r.pourquoi });
  const verdict = lireLaReponse(r.valeur, d.valeur.outil !== null);
  if (verdict.etat === 'sans-decision') console.warn(`[ia] ${projet.slice(0, 8)} : forme non rendue (empreinte ${verdict.empreinte})`);
  const { statut, corps } = laReponseHttp(verdict);
  const u = r.valeur.usage;
  const usage = u ? { promptTokens: u.input_tokens ?? 0, completionTokens: u.output_tokens ?? 0 } : null;

  if (d.valeur.proposer && verdict.etat === 'decide') {
    const schema = schemaDuProjet(projet);
    if (!schema) return reponse(404, { error: 'projet inconnu' });
    const base = clientDeService();
    const p = await enregistrerLaProposition(schema, porte.compte!, d.valeur.proposer, verdict.donnee, (c, s, f, a) => plateformePour(base, c, s, f, a));
    return reponse(200, { ...corps, proposition: p.lu ? { id: p.valeur } : { refus: p.pourquoi }, usage });
  }
  return reponse(statut, { ...corps, usage });
}
