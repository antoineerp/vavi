/**
 * Les comptes reliés (28/11, Antoine : « un agent ne peut pas aller lire Gmail tout seul ») :
 *  - la page d'accord demande l'accès durable (offline), PKCE S256, les portées du modèle et l'identité ;
 *  - le code s'échange ; sans jeton de renouvellement, ou une portée décochée, rien n'est relié ;
 *  - l'appel renouvelle un jeton expiré AVANT de sortir, et le garde ; un 401 renouvelle une fois et rejoue une fois ;
 *  - un accord retiré (invalid_grant) se dit « à reconnecter » et se garde comme tel ;
 *  - un connecteur relié se relit de son secret ; une page ne peut pas glisser une autorisation par « autre logiciel ».
 * Chaque échange sort par la porte, simulée au transport et au DNS seuls.
 */
import { describe, expect, it } from 'vitest';
import { adresseDAccord, echangerLeCode, leDefi, MODELES_OAUTH, renouvelerLAutorisation, type AutorisationOAuth } from '@/lib/connecteurs/l-autorisation';
import { fetchSortant, type OptionsSortie } from '@/lib/connecteurs/la-sortie';
import { appelerUnConnecteur, duSecret, enSecret, lireUnConnecteur, type Connecteur } from '@/lib/connecteurs/les-connecteurs';

const GMAIL = MODELES_OAUTH.find((m) => m.id === 'gmail')!;
const CLIENT = { id: 'cid.apps.googleusercontent.com', secret: 'csecret' };
const PUBLIC = async () => ['142.250.0.1'];
const idToken = (email: string) => `x.${Buffer.from(JSON.stringify({ email })).toString('base64url')}.y`;

type Vu = { url: string; o: OptionsSortie };
function sortie(repondre: (url: string, o: OptionsSortie) => Response) {
  const vus: Vu[] = [];
  const sortir = (url: string, o: OptionsSortie) => {
    vus.push({ url, o });
    return fetchSortant(url, { ...o, resolveur: PUBLIC, transport: (async () => repondre(url, o)) as unknown as typeof fetch });
  };
  return { vus, sortir };
}

describe('relier un compte', () => {
  it('la page d’accord : accès durable, PKCE S256, portées du modèle et identité', () => {
    const u = new URL(adresseDAccord(GMAIL, CLIENT, 'https://www.vavi.dev/api/connecteurs/retour', 'ETAT', 'verif'));
    expect(u.origin + u.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(Object.fromEntries(u.searchParams)).toMatchObject({
      client_id: CLIENT.id, response_type: 'code', state: 'ETAT', access_type: 'offline', prompt: 'consent',
      code_challenge: leDefi('verif'), code_challenge_method: 'S256', scope: 'openid email https://www.googleapis.com/auth/gmail.modify',
    });
  });
  it('le code s’échange vers le seul hôte du fournisseur ; le compte relié est nommé', async () => {
    const s = sortie(() => Response.json({ access_token: 'at1', expires_in: 3600, refresh_token: 'rt1', scope: 'openid https://www.googleapis.com/auth/gmail.modify email', id_token: idToken('pme@exemple.fr') }));
    const r = await echangerLeCode({ modele: GMAIL, client: CLIENT, code: 'C', redirection: 'https://www.vavi.dev/api/connecteurs/retour', verificateur: 'verif', sortir: s.sortir, maintenant: 1000 });
    expect(r).toEqual({ ok: true, valeur: { fournisseur: 'google', portees: GMAIL.portees, renouvellement: 'rt1', jeton: 'at1', expire: 1000 + 3600_000, compte: 'pme@exemple.fr' } });
    expect(s.vus[0]!.o.hotesAutorises).toEqual(['oauth2.googleapis.com']);
    expect(Object.fromEntries(new URLSearchParams(s.vus[0]!.o.corps))).toMatchObject({ grant_type: 'authorization_code', code_verifier: 'verif', client_secret: 'csecret' });
  });
  it('sans accès durable, ou la portée décochée, rien n’est relié, et le motif est dit', async () => {
    const sansRt = sortie(() => Response.json({ access_token: 'at1', expires_in: 3600, scope: GMAIL.portees[0] }));
    expect(await echangerLeCode({ modele: GMAIL, client: CLIENT, code: 'C', redirection: 'r', verificateur: 'v', sortir: sansRt.sortir })).toMatchObject({ ok: false, raison: expect.stringContaining('durable') });
    const decoche = sortie(() => Response.json({ access_token: 'at1', expires_in: 3600, refresh_token: 'rt', scope: 'openid email' }));
    expect(await echangerLeCode({ modele: GMAIL, client: CLIENT, code: 'C', redirection: 'r', verificateur: 'v', sortir: decoche.sortir })).toMatchObject({ ok: false, raison: expect.stringContaining('coché') });
  });
  it('un accord retiré chez le fournisseur se dit perdu ; un jeton tourné remplace l’ancien', async () => {
    const a: AutorisationOAuth = { fournisseur: 'google', portees: GMAIL.portees, renouvellement: 'rt1', jeton: 'at1', expire: 0, compte: null };
    const perdu = sortie(() => Response.json({ error: 'invalid_grant', error_description: 'Token has been expired or revoked.' }, { status: 400 }));
    expect(await renouvelerLAutorisation(a, CLIENT, perdu.sortir)).toMatchObject({ ok: false, perdue: true });
    const tourne = sortie(() => Response.json({ access_token: 'at2', expires_in: 3600, refresh_token: 'rt2' }));
    expect(await renouvelerLAutorisation(a, CLIENT, tourne.sortir, 5)).toEqual({ ok: true, valeur: { ...a, jeton: 'at2', renouvellement: 'rt2', expire: 5 + 3600_000 } });
  });
});

describe('appeler un compte relié', () => {
  const relie = (oauth: Partial<AutorisationOAuth>): Connecteur => ({
    nom: 'gmail', libelle: 'Gmail', baseUrl: GMAIL.baseUrl, acces: { forme: 'bearer' }, cle: '',
    oauth: { fournisseur: 'google', portees: GMAIL.portees, renouvellement: 'rt1', jeton: 'at1', expire: 10_000_000, compte: 'pme@exemple.fr', ...oauth },
  });
  function deps(c: Connecteur, service: (jeton: string | undefined) => Response, renouvellement: { ok: true; jeton: string } | { ok: false; perdue: boolean }) {
    const gardes: Connecteur[] = [];
    const s = sortie((_u, o) => service(o.entetes?.authorization));
    return {
      gardes, vus: s.vus,
      d: {
        noms: async () => ({ ok: true as const, valeur: ['gmail'] }),
        lire: async () => ({ ok: true as const, valeur: c }),
        sortir: s.sortir,
        maintenant: () => 1_000_000,
        renouveler: async (x: Connecteur) => {
          if (!renouvellement.ok) return { ok: false as const, perdue: renouvellement.perdue, raison: 'Google: invalid_grant' };
          const neuf = { ...x, oauth: { ...x.oauth!, jeton: renouvellement.jeton, expire: 9_000_000 } };
          gardes.push(neuf);
          return { ok: true as const, valeur: neuf };
        },
      },
    };
  }
  it('un jeton valable part en Bearer, sans renouvellement', async () => {
    const t = deps(relie({}), () => Response.json({ messages: [] }), { ok: true, jeton: 'at2' });
    expect(await appelerUnConnecteur('gmail', { chemin: '/messages' }, t.d)).toMatchObject({ ok: true, statut: 200, repondu: true });
    expect(t.vus.map((v) => [v.url, v.o.entetes?.authorization])).toEqual([[`${GMAIL.baseUrl}/messages`, 'Bearer at1']]);
    expect(t.gardes).toEqual([]);
  });
  it('un jeton expiré se renouvelle AVANT de sortir, et se garde', async () => {
    const t = deps(relie({ expire: 1_000_000 + 30_000 }), () => Response.json({ messages: [] }), { ok: true, jeton: 'at2' });
    expect(await appelerUnConnecteur('gmail', { chemin: '/messages' }, t.d)).toMatchObject({ ok: true, statut: 200 });
    expect(t.vus.map((v) => v.o.entetes?.authorization)).toEqual(['Bearer at2']);
    expect(t.gardes).toHaveLength(1);
  });
  it('un 401 avant l’heure renouvelle une fois et rejoue une fois', async () => {
    const t = deps(relie({}), (j) => (j === 'Bearer at1' ? new Response('{}', { status: 401 }) : Response.json({ ok: 1 })), { ok: true, jeton: 'at2' });
    expect(await appelerUnConnecteur('gmail', { chemin: '/messages' }, t.d)).toMatchObject({ ok: true, statut: 200 });
    expect(t.vus.map((v) => v.o.entetes?.authorization)).toEqual(['Bearer at1', 'Bearer at2']);
    const encore = deps(relie({}), () => new Response('{}', { status: 401 }), { ok: true, jeton: 'at2' });
    expect(await appelerUnConnecteur('gmail', { chemin: '/messages' }, encore.d)).toMatchObject({ ok: true, statut: 401, repondu: false });
    expect(encore.vus).toHaveLength(2);
  });
  it('un accord retiré : « à reconnecter », dit avec le geste ; déjà perdu : rien ne sort', async () => {
    const t = deps(relie({ expire: 0 }), () => Response.json({}), { ok: false, perdue: true });
    expect(await appelerUnConnecteur('gmail', { chemin: '/messages' }, t.d)).toMatchObject({ ok: false, statut: 503, erreur: 'connecteur à reconnecter', detail: expect.stringContaining('Reconnect') });
    const p = deps(relie({ perdue: true }), () => Response.json({}), { ok: true, jeton: 'at2' });
    expect(await appelerUnConnecteur('gmail', { chemin: '/messages' }, p.d)).toMatchObject({ ok: false, erreur: 'connecteur à reconnecter' });
    expect([...t.vus, ...p.vus]).toEqual([]);
  });
  it('le connecteur relié se relit de son secret ; une autorisation mal formée est refusée', () => {
    const c = relie({});
    expect(duSecret(enSecret(c))).toEqual({ ok: true, valeur: c });
    expect(lireUnConnecteur({ nom: 'gmail', baseUrl: GMAIL.baseUrl, oauth: { fournisseur: 'autre', jeton: 'x' } }).ok).toBe(false);
  });
});

describe('un agent et ses connecteurs', () => {
  it('pendant un essai, seules les lectures sortent ; une écriture est dite simulée, au journal (une règle, dans le protocole)', async () => {
    const { lesBriquesReelles } = await import('@/lib/agents/les-briques');
    const { executer, nouveauxCompteurs } = await import('@/lib/agents/le-protocole');
    const sorties: string[] = [];
    const c: Connecteur = { nom: 'gmail', libelle: null, baseUrl: GMAIL.baseUrl, acces: { forme: 'bearer' }, cle: 'k' };
    const connecteurs = {
      noms: async () => ({ ok: true as const, valeur: ['gmail'] }), lire: async () => ({ ok: true as const, valeur: c }),
      sortir: (url: string, o: OptionsSortie) => { sorties.push(`${o.methode} ${url}`); return fetchSortant(url, { ...o, resolveur: PUBLIC, transport: (async () => Response.json({ a: 1 })) as unknown as typeof fetch }); },
    };
    const b = lesBriquesReelles({ base: {} as never, schema: 's', compte: 'c', cleIA: null, modele: 'm', plafondIA: async () => ({ lu: true, valeur: true }), connecteurs });
    const essai = nouveauxCompteurs(true);
    expect(await executer('connecteur', { nom: 'gmail', chemin: '/messages/1/modify', methode: 'POST', requete: {} }, b, essai)).toEqual({ lu: true, valeur: { ok: true, statut: 0, corps: '', simule: true } });
    expect(await executer('connecteur', { nom: 'gmail', chemin: '/messages' }, b, essai)).toMatchObject({ lu: true, valeur: { ok: true, statut: 200, donnees: { a: 1 } } });
    expect(essai.journal).toEqual(['connecteur gmail POST /messages/1/modify → not sent (try)', 'connecteur gmail GET /messages → 200']);
    expect(await executer('connecteur', { nom: 'gmail', chemin: '/messages/1/modify', methode: 'POST', requete: {} }, b, nouveauxCompteurs())).toMatchObject({ lu: true, valeur: { statut: 200 } });
    expect(sorties).toEqual([`GET ${GMAIL.baseUrl}/messages`, `POST ${GMAIL.baseUrl}/messages/1/modify`]);
  });
});

describe('le client OAuth du propriétaire (décision d’Antoine du 28/11)', () => {
  it('se colle, se relit, et une forme fausse est dite ; son secret est à part des autres', async () => {
    const { lireLeClient, enTexteDuClient, duTexteDuClient, secretDuClient } = await import('@/lib/connecteurs/l-autorisation');
    expect(lireLeClient({ id: ' 123-abc.apps.googleusercontent.com ', secret: 'GOCSPX-xyz12345' })).toEqual({ ok: true, valeur: { id: '123-abc.apps.googleusercontent.com', secret: 'GOCSPX-xyz12345' } });
    expect(lireLeClient({ id: 'a b', secret: 'GOCSPX-xyz12345' }).ok).toBe(false);
    expect(lireLeClient({ id: '123-abc.apps.googleusercontent.com', secret: '' }).ok).toBe(false);
    expect(duTexteDuClient(enTexteDuClient({ id: CLIENT.id, secret: 'GOCSPX-abc123' }))).toEqual({ id: CLIENT.id, secret: 'GOCSPX-abc123' });
    expect(duTexteDuClient('illisible')).toBeNull();
    expect(secretDuClient('google')).toBe('OAUTH_GOOGLE');
  });
});
