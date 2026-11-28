/**
 * POST /api/external/<projet>/call — `capacites.connecteur.appeler(nom, { chemin, methode, corps })` : le logiciel que le
 * propriétaire a branché dans la console, appelé par son NOM avec sa clé ou son compte relié (`lib/connecteurs`), derrière
 * un compte membre de l'app, plafonné en base. L'app ne passe jamais d'adresse ; la clé ne revient jamais.
 */
import { laPorte, leCorpsJson, reponse } from '@/app/_partage/les-capacites-reelles';
import { clientDeService } from '@/lib/supabase/service';
import { appelerUnConnecteur } from '@/lib/connecteurs/les-connecteurs';
import { lesConnecteursDuProjet } from '@/lib/connecteurs/les-connecteurs-du-projet';
import { ouvrirUnSecret, scellerUnSecret } from '@/lib/mcp/les-jetons';

export const dynamic = 'force-dynamic';

export async function POST(requete: Request, { params }: { params: Promise<{ projet: string }> }) {
  const { projet } = await params;
  const porte = await laPorte(requete, projet, 'connecteur', { fenetreS: 300, parProjet: 600, parCompte: 120 });
  if (!porte.ouverte) return reponse(porte.statut, porte.corps);
  const corps = await leCorpsJson(requete);
  const r = await appelerUnConnecteur(corps.cible, { chemin: corps.chemin, methode: corps.methode, requete: corps.requete },
    lesConnecteursDuProjet(clientDeService(), projet, { ouvrir: ouvrirUnSecret, sceller: scellerUnSecret }));
  if (!r.ok) {
    console.warn(`[connecteur] ${projet.slice(0, 8)} ${r.erreur} : ${r.detail.slice(0, 160)}`);
    return reponse(r.statut, { error: r.erreur, detail: r.detail, ...(r.connus ? { connus: r.connus } : {}) });
  }
  console.log(`[connecteur] ${projet.slice(0, 8)} ${r.hote} → ${r.statut}`);
  return reponse(200, { ok: r.repondu, statut: r.statut, hote: r.hote, ...(r.donnees !== undefined ? { donnees: r.donnees } : {}), corps: r.corps });
}
