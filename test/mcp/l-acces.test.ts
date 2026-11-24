/**
 * L'accès de Claude à un compte vavi, de bout en bout : inscription dynamique, autorisation par la personne connectée,
 * code échangé avec PKCE S256, jeton d'accès qui passe la porte. Et ce qui ne passe JAMAIS : une pièce forgée à la main
 * (l'incident de constructor-v13 du 24/11 : `decryptSecret` rendait tel quel un texte non chiffré), une pièce d'un type
 * relue comme une autre, un vérificateur qui ne répond pas au défi, un jeton expiré, un secret relu sous un autre nom.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { defiDe, delivrer, echangerUnCode, inscrireUnClient, lireUnAcces, ouvrirUnSecret, renouveler, scellerUnSecret } from '@/lib/mcp/les-jetons';
import { autoriser } from '@/lib/mcp/l-autorisation';
import { passerLaPorte } from '@/lib/mcp/la-porte';

const BASE = 'https://vavi.test';
const MOI = 'aaaaaaaa-0000-4000-8000-00000000000a';
const RETOUR = 'https://claude.ai/api/mcp/auth_callback';
const VERIFICATEUR = 'v'.repeat(50);

beforeAll(() => { process.env.VAVI_CLE_DES_JETONS = randomBytes(32).toString('base64'); });

const unAcces = async () => {
  const client = inscrireUnClient({ redirect_uris: [RETOUR], client_name: 'Claude' });
  if (!client.lu) throw new Error(client.pourquoi);
  const a = await autoriser({ client_id: client.valeur.client_id, redirect_uri: RETOUR, code_challenge: defiDe(VERIFICATEUR), code_challenge_method: 'S256',
    resource: `${BASE}/api/mcp`, state: 'etat', jeton: 'session' }, { compteDeLaSession: async (j) => (j === 'session' ? MOI : null) }, Date.now(), BASE);
  if (!a.lu) throw new Error(a.pourquoi);
  const code = new URL(a.valeur.redirection).searchParams.get('code')!;
  return { client: client.valeur.client_id, code, redirection: a.valeur.redirection };
};

describe('l’accès de Claude, de bout en bout', () => {
  it('l’inscription, l’autorisation, l’échange PKCE et la porte donnent le compte de la personne', async () => {
    const { client, code, redirection } = await unAcces();
    expect(new URL(redirection).searchParams.get('state')).toBe('etat');
    const acces = echangerUnCode(code, client, RETOUR, VERIFICATEUR);
    if (!acces.lu) throw new Error(acces.pourquoi);
    const jetons = delivrer(acces.valeur);
    expect(passerLaPorte(`Bearer ${jetons.access_token}`)).toEqual({ passe: true, compte: MOI });
    expect(renouveler(jetons.refresh_token, client)).toMatchObject({ lu: true });
  });
  it('sans session, vers une autre ressource, ou sans défi S256 : aucun code', async () => {
    const client = inscrireUnClient({ redirect_uris: [RETOUR] });
    if (!client.lu) throw new Error(client.pourquoi);
    const base = { client_id: client.valeur.client_id, redirect_uri: RETOUR, code_challenge: defiDe(VERIFICATEUR), code_challenge_method: 'S256', jeton: 'session' };
    const d = { compteDeLaSession: async (j: string) => (j === 'session' ? MOI : null) };
    expect((await autoriser({ ...base, jeton: 'autre' }, d, Date.now(), BASE)).lu).toBe(false);
    expect((await autoriser({ ...base, resource: 'https://ailleurs.test/api/mcp' }, d, Date.now(), BASE)).lu).toBe(false);
    expect((await autoriser({ ...base, code_challenge_method: 'plain' }, d, Date.now(), BASE)).lu).toBe(false);
    expect((await autoriser({ ...base, redirect_uri: 'https://pirate.test/cb' }, d, Date.now(), BASE)).lu).toBe(false);
  });
  it('un vérificateur faux, un autre client, une autre adresse de retour : refusés', async () => {
    const { client, code } = await unAcces();
    expect(echangerUnCode(code, client, RETOUR, 'w'.repeat(50)).lu).toBe(false);
    expect(echangerUnCode(code, 'un-autre', RETOUR, VERIFICATEUR).lu).toBe(false);
    expect(echangerUnCode(code, client, 'https://claude.ai/autre', VERIFICATEUR).lu).toBe(false);
  });
});

describe('aucune pièce ne se forge', () => {
  it('INCIDENT — un jeton écrit à la main, en clair, avec le préfixe, ne passe pas la porte', () => {
    const forge = `vavi.${Buffer.from(JSON.stringify({ contenu: { compte: MOI, client: 'x' }, expire: null })).toString('base64url')}`;
    expect(passerLaPorte(`Bearer ${forge}`)).toMatchObject({ passe: false, statut: 401 });
    expect(passerLaPorte(`Bearer ${JSON.stringify({ compte: MOI, client: 'x' })}`)).toMatchObject({ passe: false });
  });
  it('une pièce d’un type ne se relit pas comme une autre : un renouvellement n’ouvre pas la porte, un code non plus', async () => {
    const { client, code } = await unAcces();
    expect(lireUnAcces(code).lu).toBe(false);
    const a = echangerUnCode(code, client, RETOUR, VERIFICATEUR);
    if (!a.lu) throw new Error(a.pourquoi);
    expect(passerLaPorte(`Bearer ${delivrer(a.valeur).refresh_token}`).passe).toBe(false);
  });
  it('un jeton expiré est refusé, et la réponse dit où s’autoriser', () => {
    const j = delivrer({ compte: MOI, client: 'c' }, Date.now() - 2 * 60 * 60_000);
    const p = passerLaPorte(`Bearer ${j.access_token}`);
    expect(p).toMatchObject({ passe: false, entete: expect.stringContaining('resource_metadata=') });
  });
  it('un secret ne se relit que sous son projet et son nom', () => {
    const s = scellerUnSecret('p1', 'STRIPE_SECRET_KEY', 'valeur');
    expect(s).not.toContain('valeur');
    expect(ouvrirUnSecret('p1', 'STRIPE_SECRET_KEY', s)).toEqual({ lu: true, valeur: 'valeur' });
    expect(ouvrirUnSecret('p2', 'STRIPE_SECRET_KEY', s).lu).toBe(false);
    expect(ouvrirUnSecret('p1', 'AUTRE_CLE', s).lu).toBe(false);
  });
});
