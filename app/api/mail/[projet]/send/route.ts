/** POST /api/mail/<projet>/send — `capacites.courriel.envoyer` : par le fournisseur du propriétaire, à sa clé (`lib/capacites/le-courriel.ts`). */
import { laPorte, leCorpsJson, lesSecretsDuProjet, reponse } from '@/app/_partage/les-capacites-reelles';
import { EXPEDITEUR, envoyer, leFournisseur, lireLEnvoi } from '@/lib/capacites/le-courriel';

export const dynamic = 'force-dynamic';

export async function POST(requete: Request, { params }: { params: Promise<{ projet: string }> }) {
  const { projet } = await params;
  const porte = await laPorte(requete, projet, 'courriel', { fenetreS: 300, parProjet: 200, parCompte: 60 });
  if (!porte.ouverte) return reponse(porte.statut, porte.corps);
  const e = lireLEnvoi(await leCorpsJson(requete));
  if (!e.lu) return reponse(400, { error: e.pourquoi });
  const f = await leFournisseur(lesSecretsDuProjet(projet));
  if (!f.lu) return reponse(503, { error: 'secrets illisibles' });
  if (!f.valeur) return reponse(503, { error: 'envoi de courriel non configuré',
    detail: `le propriétaire pose la clé de son fournisseur (BREVO_API_KEY, MAILJET_API_KEY et MAILJET_SECRET_KEY, RESEND_API_KEY ou SENDGRID_API_KEY) et ${EXPEDITEUR}, l’adresse vérifiée qui envoie` });
  const r = await envoyer((u, i) => fetch(u, i), f.valeur, e.valeur);
  return r.lu ? reponse(200, { id: r.valeur.id, fournisseur: r.valeur.fournisseur, envoyes: e.valeur.a.length }) : reponse(502, { error: 'le courriel n’est pas parti', detail: r.pourquoi });
}
