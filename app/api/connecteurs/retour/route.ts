/**
 * GET /api/connecteurs/retour?code&state — le retour de la page d'accord d'un fournisseur (Google…) quand le propriétaire
 * relie un compte dans la console (`relierUnCompte`). L'état scellé dit quel projet, quel modèle, quel compte vavi : le
 * compte connecté doit être celui-là, et le projet le sien. Le code s'échange (PKCE) par le client du propriétaire ; l'autorisation est gardée dans le
 * secret scellé du connecteur, jamais montrée. Puis retour à l'écran Connecteurs, qui dit ce qui s'est passé.
 */
import { NextResponse } from 'next/server';
import { compteConnecte } from '@/lib/supabase/serveur';
import { clientDeService } from '@/lib/supabase/service';
import { projetsSurSupabase } from '@/lib/projets/les-projets';
import { echangerLeCode, FOURNISSEURS, MODELES_OAUTH, RETOUR_DE_LA_LIAISON } from '@/lib/connecteurs/l-autorisation';
import { leClientDuProjet } from '@/lib/connecteurs/les-connecteurs-du-projet';
import { fetchSortant } from '@/lib/connecteurs/la-sortie';
import { enSecret, lireUnConnecteur, secretDuConnecteur } from '@/lib/connecteurs/les-connecteurs';
import { lireUneLiaison, ouvrirUnSecret, scellerUnSecret } from '@/lib/mcp/les-jetons';
import { adresseDeLaPlateforme } from '@/lib/mcp/l-adresse';

export const dynamic = 'force-dynamic';

export async function GET(requete: Request) {
  const base = adresseDeLaPlateforme();
  const q = new URL(requete.url).searchParams;
  const liaison = lireUneLiaison(q.get('state'));
  if (!liaison.lu) return NextResponse.redirect(`${base}/projets`);
  const { projet, modele: idDuModele, compte, verificateur } = liaison.valeur;
  const ecran = (p: Record<string, string>) => NextResponse.redirect(`${base}/projets/${projet}/connecteurs?${new URLSearchParams(p)}`);
  const m = MODELES_OAUTH.find((x) => x.id === idDuModele);
  if (!m) return ecran({ erreur: 'liaison_refusee', detail: 'modèle inconnu' });
  // La personne a refusé sur la page du fournisseur (access_denied) : rien n'est gardé.
  const refus = q.get('error');
  if (refus) return ecran({ erreur: 'liaison_refusee', detail: refus === 'access_denied' ? `vous avez refusé l’accès sur la page de ${FOURNISSEURS[m.fournisseur].libelle}.` : refus.slice(0, 80) });
  const c = await compteConnecte();
  if (!c.connecte) return NextResponse.redirect(`${base}/connexion?suite=${encodeURIComponent(`/projets/${projet}/connecteurs`)}`);
  if (c.utilisateur.id !== compte) return ecran({ erreur: 'liaison_refusee', detail: 'la liaison a été commencée par un autre compte vavi.' });
  const client = await leClientDuProjet(clientDeService(), projet, m.fournisseur, { ouvrir: ouvrirUnSecret, sceller: scellerUnSecret });
  if (!client) return ecran({ erreur: 'liaison_indisponible' });
  const code = q.get('code');
  if (!code || code.length > 2000) return ecran({ erreur: 'liaison_refusee', detail: 'aucun code reçu.' });
  const a = await echangerLeCode({ modele: m, client, code, redirection: `${base}${RETOUR_DE_LA_LIAISON}`, verificateur, sortir: fetchSortant });
  if (!a.ok) return ecran({ erreur: 'liaison_refusee', detail: a.raison });
  const connecteur = lireUnConnecteur({ nom: m.nomDansLApp, libelle: m.nom, baseUrl: m.baseUrl, cle: '', oauth: a.valeur });
  if (!connecteur.ok) return ecran({ erreur: 'liaison_refusee', detail: connecteur.raison });
  const nom = secretDuConnecteur(m.nomDansLApp);
  // `poserUnSecret` vérifie que le projet est à ce compte.
  const r = await projetsSurSupabase(clientDeService()).poserUnSecret(compte, projet, nom, scellerUnSecret(projet, nom, enSecret(connecteur.valeur)));
  if (!r.lu) return ecran({ erreur: 'panne' });
  console.log(`[connecteur] ${projet.slice(0, 8)} ${m.nomDansLApp} relié (${m.fournisseur})`);
  return ecran({ fait: 'relie', nom: m.nomDansLApp });
}
