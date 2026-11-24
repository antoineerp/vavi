/** /api/oauth/jeton — l'échange du code (PKCE S256) et le renouvellement (OAuth 2.1). */
import { delivrer, DUREE_DU_CODE_MS, echangerUnCode, lireUnClient, renouveler } from '@/lib/mcp/les-jetons';
import { empreinteDuCode, estRevoque } from '@/lib/mcp/l-etat-de-l-acces';
import { etatDeLAccesReel } from '@/lib/mcp/le-contexte-reel';
import { lAdresseDuClient, LIMITES, tropDAppels, uneFenetre } from '@/lib/mcp/les-limites';

const FENETRE = uneFenetre(LIMITES.jeton);

const ENTETES = { 'cache-control': 'no-store', 'access-control-allow-origin': '*' };
const refus = (error: string, description: string, statut = 400) => Response.json({ error, error_description: description }, { status: statut, headers: ENTETES });

export async function POST(requete: Request) {
  const limite = FENETRE.passe(lAdresseDuClient(requete.headers));
  if (!limite.passe) return tropDAppels(limite.apres, { error: 'slow_down', error_description: `réessayez dans ${limite.apres} s` });
  const brut = await requete.text().catch(() => '');
  let p: URLSearchParams;
  if ((requete.headers.get('content-type') ?? '').includes('application/json')) {
    let o: Record<string, unknown> = {};
    try { o = JSON.parse(brut) as Record<string, unknown>; } catch { /* corps illisible : refusé plus bas */ }
    p = new URLSearchParams(Object.entries(o).filter(([, v]) => typeof v === 'string') as [string, string][]);
  } else p = new URLSearchParams(brut);
  const client = p.get('client_id');
  if (!lireUnClient(client).lu) return refus('invalid_client', 'client_id inconnu', 401);
  const grant = p.get('grant_type');
  const r = grant === 'authorization_code' ? echangerUnCode(p.get('code'), client, p.get('redirect_uri'), p.get('code_verifier'))
    : grant === 'refresh_token' ? renouveler(p.get('refresh_token'), client) : null;
  if (r === null) return refus('unsupported_grant_type', 'authorization_code ou refresh_token');
  if (!r.lu) return refus('invalid_grant', r.pourquoi);
  const etat = etatDeLAccesReel();
  // Un code ne sert qu'une fois (vague 0) : rejoué, même dans ses 5 minutes, il est refusé.
  if (grant === 'authorization_code') {
    const m = await etat.marquerLeCode(empreinteDuCode(p.get('code')!), Date.now() + DUREE_DU_CODE_MS);
    if (typeof m === 'object') return refus('server_error', 'vavi n’a pas pu noter ce code ; réessayez', 503);
    if (m === 'deja') return refus('invalid_grant', 'ce code a déjà servi');
  }
  // Claude déconnecté par la personne : un renouvellement émis avant tombe.
  if (grant === 'refresh_token') {
    const depuis = await etat.revoqueDepuis(r.valeur.compte);
    if (typeof depuis === 'object' && depuis !== null) return refus('server_error', 'vavi n’a pas pu vérifier cet accès ; réessayez', 503);
    if (estRevoque(r.valeur, depuis)) return refus('invalid_grant', 'accès retiré par la personne');
  }
  return Response.json(delivrer(r.valeur), { headers: ENTETES });
}
