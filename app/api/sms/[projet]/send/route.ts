/** POST /api/sms/<projet>/send — `capacites.sms.envoyer` : par le compte Twilio du propriétaire (`lib/capacites/le-sms.ts`). */
import { laPorte, leCorpsJson, lesSecretsDuProjet, reponse } from '@/app/_partage/les-capacites-reelles';
import { envoyerLeSms, lireLeSms, lOperateur, SECRETS_DU_SMS } from '@/lib/capacites/le-sms';

export const dynamic = 'force-dynamic';

export async function POST(requete: Request, { params }: { params: Promise<{ projet: string }> }) {
  const { projet } = await params;
  const porte = await laPorte(requete, projet, 'sms', { fenetreS: 300, parProjet: 100, parCompte: 30 });
  if (!porte.ouverte) return reponse(porte.statut, porte.corps);
  const s = lireLeSms(await leCorpsJson(requete));
  if (!s.lu) return reponse(400, { error: s.pourquoi });
  const o = await lOperateur(lesSecretsDuProjet(projet));
  if (!o.lu) return reponse(503, { error: 'compte d’opérateur illisible', detail: o.pourquoi });
  if (!o.valeur) return reponse(503, { error: 'les SMS ne sont pas branchés pour cette app', detail: `le propriétaire pose ${SECRETS_DU_SMS.join(', ')}` });
  const r = await envoyerLeSms((u, i) => fetch(u, i), o.valeur, s.valeur);
  return r.lu ? reponse(200, { sid: r.valeur.sid }) : reponse(502, { error: 'le SMS n’est pas parti', detail: r.pourquoi });
}
