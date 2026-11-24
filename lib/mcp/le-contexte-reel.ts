/**
 * LE CONTEXTE RÉEL DU SERVEUR MCP — les dépendances des gestes branchées sur la plateforme : la base sous la clé de
 * service (projets, pose de la base), le magasin des builds, l'atelier, les paquets du gabarit. Serveur seulement.
 */
import 'server-only';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { clientDeService } from '@/lib/supabase/service';
import { projetsSurSupabase } from '@/lib/projets/les-projets';
import { magasinS3 } from '@/lib/publication/le-magasin';
import { construireLApp } from '@/lib/atelier/construire';
import { DOSSIER_DU_GABARIT } from '@/squelette/registre';
import { lesPaquetsDuGabarit, type Refus } from '@/lib/consignes';
import { adresseDeLaPlateforme } from './l-adresse';
import { scellerUnSecret } from './les-jetons';
import type { ContexteDuServeur } from './le-serveur';

const REFUS_PRECEDENTS = new Map<string, Refus>();
const LANGUES_DES_COMPTES = new Map<string, string>();
let gabarit: string | null = null;
const leGabarit = (): string => (gabarit ??= readFileSync(join(DOSSIER_DU_GABARIT, 'package.json'), 'utf8'));

/** La langue du compte (`user_metadata.langue`), lue une fois par processus ; `en` par défaut. */
async function laLangue(base: ReturnType<typeof clientDeService>, compte: string): Promise<string> {
  const connue = LANGUES_DES_COMPTES.get(compte);
  if (connue) return connue;
  const u = await base.auth.admin.getUserById(compte);
  const l = typeof u.data.user?.user_metadata?.langue === 'string' ? u.data.user.user_metadata.langue : 'en';
  if (!u.error) LANGUES_DES_COMPTES.set(compte, l);
  return l;
}

export async function leContexteReel(compte: string): Promise<ContexteDuServeur> {
  const base = clientDeService();
  const projets = projetsSurSupabase(base);
  const magasin = magasinS3();
  return {
    langue: await laLangue(base, compte),
    gabaritPackageJson: leGabarit(),
    async noteDuChantier(id) {
      const p = await projets.lire(compte, id);
      const ch = p.lu ? p.valeur?.chantier : null;
      if (!ch) return null;
      return [`# ${ch.intention}`, '', `Opened ${ch.ouvertLe}, ${ch.gestes} change(s), last at ${ch.dernierGesteLe}.`, '',
        '## Done', ...(ch.fait.length ? ch.fait.map((f) => `- ${f}`) : ['- nothing yet']), '', '## Still to do', ch.reste ?? 'not noted'].join('\n');
    },
    outils: {
      compte, projets, base, magasin: magasin.lu ? magasin.magasin : null,
      construire: (arbre, b) => construireLApp(arbre, b),
      permis: lesPaquetsDuGabarit(leGabarit()),
      adresse: adresseDeLaPlateforme(),
      scellerUnSecret,
      refusPrecedents: REFUS_PRECEDENTS,
    },
  };
}

/** Le compte d'une session vavi (le jeton d'accès Supabase de la page « Autoriser ») ; `null` sinon. */
export async function compteDeLaSession(jeton: string): Promise<string | null> {
  const u = await clientDeService().auth.getUser(jeton);
  return u.error || !u.data.user ? null : u.data.user.id;
}
