/**
 * Les comptes d'app (décision d'Antoine du 25/11) : une adresse a un compte par app, l'inscription se confirme ou non au
 * choix du propriétaire, un code sert une fois dans son app, une session se renouvelle une fois.
 */
import { describe, expect, it } from 'vitest';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { echangerUnCode, entrer, envoyerUnLien, rafraichir, sInscrire, unCodeDuProprietaire, type CompteDApp, type MagasinDesComptes, type Nature } from '@/lib/comptes/les-comptes';
import { laCleDesComptes, lireUnJeton } from '@/lib/comptes/les-jetons';

const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const cle = laCleDesComptes({ VAVI_CLE_DES_COMPTES: JSON.stringify({ ...privateKey.export({ format: 'jwk' }), kid: 'k1', alg: 'ES256' }) })!;

function enMemoire() {
  const comptes = new Map<string, CompteDApp>();
  const codes = new Map<string, { compte: string; nature: Nature; expire: string; servi: boolean }>();
  const sessions = new Map<string, { compte: string; expire: string }>();
  const m: MagasinDesComptes = {
    async trouver(app, email) { return [...comptes.values()].find((c) => c.app === app && c.email === email) ?? null; },
    async lire(id) { return comptes.get(id) ?? null; },
    async creer(app, email, motDePasse, confirme) {
      if ([...comptes.values()].some((c) => c.app === app && c.email === email)) return 'existe';
      const c = { id: randomUUID(), app, email, motDePasse, confirmeLe: confirme ? 'x' : null };
      comptes.set(c.id, c); return c;
    },
    async confirmer(id) { comptes.set(id, { ...comptes.get(id)!, confirmeLe: 'x' }); },
    async changerLeMotDePasse(id, e) { comptes.set(id, { ...comptes.get(id)!, motDePasse: e }); },
    async poserUnCode(e, compte, nature, expire) { codes.set(e, { compte, nature, expire, servi: false }); },
    async prendreUnCode(e, nature, maintenant) { const c = codes.get(e); if (!c || c.servi || c.nature !== nature || c.expire <= maintenant) return null; c.servi = true; return c.compte; },
    async poserUneSession(e, compte, expire) { sessions.set(e, { compte, expire }); },
    async prendreUneSession(e, maintenant) { const s = sessions.get(e); sessions.delete(e); return s && s.expire > maintenant ? s.compte : null; },
    async oublierLesSessions(compte) { for (const [k, s] of sessions) if (s.compte === compte) sessions.delete(k); },
  };
  return { m, comptes, sessions };
}

const lePremierLien = (envois: { texte: string }[]): string => /#vavi=([\w.-]+)/.exec(envois.at(-1)!.texte)![1]!;
const ctx = (app: string) => ({ app, nomDeLApp: 'Notes', retour: 'https://a.vavi.dev/connexion', langue: 'fr' });

describe('les comptes d’app', () => {
  it('une même adresse a un compte distinct dans deux apps ; l’un n’ouvre pas l’autre', async () => {
    const { m } = enMemoire();
    const d = { magasin: m, cle, courrier: null, maintenant: () => 1_000_000 };
    const a = await sInscrire(d, { ...ctx('app_a'), email: 'Ada@x.fr', motDePasse: 'cheval-batterie', sansValidation: true });
    const b = await sInscrire(d, { ...ctx('app_b'), email: 'ada@x.fr', motDePasse: 'autre-secret-9', sansValidation: true });
    expect(a.ok && b.ok).toBe(true);
    const ja = a.ok ? lireUnJeton(cle, a.valeur.session!.jeton, 1000) : null;
    const jb = b.ok ? lireUnJeton(cle, b.valeur.session!.jeton, 1000) : null;
    expect(ja?.app).toBe('app_a');
    expect(ja?.sub).not.toBe(jb?.sub);
    expect((await entrer(d, { app: 'app_b', email: 'ada@x.fr', motDePasse: 'cheval-batterie', sansValidation: true })).ok).toBe(false);
  });

  it('avec validation : rien ne s’ouvre avant le lien ; le lien sert une fois, dans son app', async () => {
    const { m } = enMemoire();
    const envois: { a: string; texte: string }[] = [];
    const d = { magasin: m, cle, courrier: async (x: { a: string; texte: string }) => { envois.push(x); return true; }, maintenant: () => 1_000_000 };
    const r = await sInscrire(d, { ...ctx('app_a'), email: 'bob@x.fr', motDePasse: 'cheval-batterie', sansValidation: false });
    expect(r).toEqual({ ok: true, valeur: { session: null, aConfirmer: true } });
    expect(await entrer(d, { app: 'app_a', email: 'bob@x.fr', motDePasse: 'cheval-batterie', sansValidation: false })).toEqual({ ok: false, refus: 'courriel_non_confirme' });
    const code = lePremierLien(envois);
    expect((await echangerUnCode(d, { app: 'app_b', code })).ok).toBe(false);
    const sInscrireAilleurs = await sInscrire(d, { ...ctx('app_a'), email: 'bob@x.fr', motDePasse: 'x-autre-mdp', sansValidation: false });
    expect(sInscrireAilleurs).toEqual({ ok: false, refus: 'compte_existant' });
    const r2 = await sInscrire(d, { ...ctx('app_a'), email: 'carl@x.fr', motDePasse: 'cheval-batterie', sansValidation: false });
    expect(r2.ok).toBe(true);
    const code2 = lePremierLien(envois);
    const e = await echangerUnCode(d, { app: 'app_a', code: code2 });
    expect(e.ok && e.valeur.compte.confirme).toBe(true);
    expect((await echangerUnCode(d, { app: 'app_a', code: code2 })).ok).toBe(false);
  });

  it('le propriétaire confirme toujours son adresse, même sans validation : c’est elle qui lui donne ses rôles (incident 25/11)', async () => {
    const { m } = enMemoire();
    const envois: { a: string; texte: string }[] = [];
    const d = { magasin: m, cle, courrier: async (x: { a: string; texte: string }) => { envois.push(x); return true; }, maintenant: () => 1_000_000 };
    const autre = await sInscrire(d, { ...ctx('app_a'), email: 'zoe@x.fr', motDePasse: 'cheval-batterie', sansValidation: true, adresseDuProprietaire: 'Antoine@x.fr' });
    expect(autre.ok && autre.valeur.session !== null).toBe(true);
    const moi = await sInscrire(d, { ...ctx('app_a'), email: 'antoine@x.fr', motDePasse: 'cheval-batterie', sansValidation: true, adresseDuProprietaire: 'Antoine@x.fr' });
    expect(moi).toEqual({ ok: true, valeur: { session: null, aConfirmer: true } });
    expect(envois.at(-1)!.a).toBe('antoine@x.fr');
    // Inscrit avant, sans confirmer : entrer renvoie le lien au lieu d'ouvrir une session sans rôle.
    const avant = envois.length;
    expect(await entrer(d, { app: 'app_a', email: 'antoine@x.fr', motDePasse: 'cheval-batterie', sansValidation: true, adresseDuProprietaire: 'antoine@x.fr', lien: ctx('app_a') }))
      .toEqual({ ok: false, refus: 'courriel_non_confirme' });
    expect(envois.length).toBe(avant + 1);
    const ouvert = await echangerUnCode(d, { app: 'app_a', code: lePremierLien(envois) });
    expect(ouvert.ok && ouvert.valeur.compte.confirme).toBe(true);
    // Sans courrier, rien ne prouve l'adresse : l'app entre comme avant.
    expect((await sInscrire({ ...d, courrier: null }, { ...ctx('app_b'), email: 'antoine@x.fr', motDePasse: 'cheval-batterie', sansValidation: true, adresseDuProprietaire: 'antoine@x.fr' })).ok).toBe(true);
  });

  it('sans courrier, une app qui demande la validation refuse l’inscription en le disant', async () => {
    const { m } = enMemoire();
    expect(await sInscrire({ magasin: m, cle, courrier: null, maintenant: () => 0 }, { ...ctx('app_a'), email: 'a@x.fr', motDePasse: 'cheval-batterie', sansValidation: false }))
      .toEqual({ ok: false, refus: 'courrier_absent' });
  });

  it('qui prouve sa boîte reprend un compte inscrit à son nom sans validation : les sessions d’avant se ferment', async () => {
    const { m, sessions } = enMemoire();
    const envois: { a: string; texte: string }[] = [];
    const d = { magasin: m, cle, courrier: async (x: { a: string; texte: string }) => { envois.push(x); return true; }, maintenant: () => 1_000_000 };
    const usurpe = await sInscrire(d, { ...ctx('app_a'), email: 'eve@x.fr', motDePasse: 'mot-de-l-usurpateur', sansValidation: true });
    expect(sessions.size).toBe(1);
    await envoyerUnLien(d, { ...ctx('app_a'), email: 'eve@x.fr', nature: 'mot_de_passe' });
    const repris = await echangerUnCode(d, { app: 'app_a', code: lePremierLien(envois) });
    expect(repris.ok).toBe(true);
    expect(usurpe.ok && (await rafraichir(d, { app: 'app_a', rafraichir: usurpe.valeur.session!.rafraichir })).ok).toBe(false);
  });

  it('une session se renouvelle une fois ; un jeton d’une autre clé ou échu ne se lit pas', async () => {
    const { m } = enMemoire();
    const d = { magasin: m, cle, courrier: null, maintenant: () => 1_000_000 };
    const r = await sInscrire(d, { ...ctx('app_a'), email: 'dan@x.fr', motDePasse: 'cheval-batterie', sansValidation: true });
    const s = r.ok ? r.valeur.session! : null;
    expect((await rafraichir(d, { app: 'app_a', rafraichir: s!.rafraichir })).ok).toBe(true);
    expect((await rafraichir(d, { app: 'app_a', rafraichir: s!.rafraichir })).ok).toBe(false);
    expect(lireUnJeton(cle, s!.jeton, 1000 + 7200)).toBeNull();
    const autre = laCleDesComptes({ VAVI_CLE_DES_COMPTES: JSON.stringify({ ...generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey.export({ format: 'jwk' }), kid: 'k1' }) })!;
    expect(lireUnJeton(autre, s!.jeton, 1000)).toBeNull();
  });
});

describe('la clé posée depuis un terminal (incident 25/11 : « illisible »)', () => {
  const jwk = JSON.stringify({ ...generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey.export({ format: 'jwk' }), kid: 'k2', alg: 'ES256' });
  it('entre apostrophes ou guillemets, ou en base64, la clé se lit ; mutilée, non', () => {
    for (const pose of [jwk, `'${jwk}'`, `"${jwk}"`, ` '${jwk}' `, Buffer.from(jwk).toString('base64')]) expect(laCleDesComptes({ VAVI_CLE_DES_COMPTES: pose })?.kid).toBe('k2');
    expect(laCleDesComptes({ VAVI_CLE_DES_COMPTES: jwk.replace(/"/g, '') })).toBeNull();
  });
});

describe('pourquoi la clé est illisible, sans la montrer (25/11)', () => {
  it('dit la forme vue et ce qui manque ; jamais une valeur de la clé', async () => {
    const { laRaisonDeLaCle } = await import('@/lib/comptes/les-jetons');
    const jwk = { ...generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey.export({ format: 'jwk' }), kid: 'k3' } as Record<string, string>;
    expect(laRaisonDeLaCle(JSON.stringify(jwk))).toBe('readable');
    const sansD = laRaisonDeLaCle(JSON.stringify({ ...jwk, d: undefined }));
    expect(sansD).toMatch(/^missing d \(fields: crv,kid,kty,x,y\)$/);
    const casse = laRaisonDeLaCle('{crv:P-256,d:' + jwk.d + '}');
    expect(casse).toMatch(/^not JSON \(\d+ characters, starts with "\{", ends with "\}"\)$/);
    for (const r of [sansD, casse]) expect(r).not.toContain(jwk.d!.slice(0, 8));
  });
});

describe('le propriétaire entre dans son app sans rien saisir (Antoine, 27/11)', () => {
  it('INCIDENT — sans compte à son adresse, un compte confirmé est créé et le code ouvre sa session', async () => {
    const { m, comptes } = enMemoire();
    const d = { magasin: m, cle, courrier: null, maintenant: () => 1_000_000 };
    const code = await unCodeDuProprietaire(d, { app: 'app_a', email: 'Antoine@X.fr' });
    if (!code.ok) throw new Error(code.refus);
    expect(code.valeur).toMatch(/^entrer\./);
    expect([...comptes.values()]).toMatchObject([{ app: 'app_a', email: 'antoine@x.fr', motDePasse: null }]);
    const s = await echangerUnCode(d, { app: 'app_a', code: code.valeur });
    expect(s.ok && lireUnJeton(cle, s.valeur.jeton, 1000)?.app).toBe('app_a');
    expect((await echangerUnCode(d, { app: 'app_a', code: code.valeur })).ok).toBe(false); // une fois
  });
  it('un compte non confirmé déjà ouvert à son adresse perd mot de passe et sessions avant d’être le sien', async () => {
    const { m, comptes, sessions } = enMemoire();
    const d = { magasin: m, cle, courrier: null, maintenant: () => 1_000_000 };
    const r = await sInscrire(d, { ...ctx('app_a'), email: 'antoine@x.fr', motDePasse: 'cheval-batterie', sansValidation: true });
    expect(r.ok && sessions.size).toBe(1);
    // L'inscription sans validation ne confirme pas l'adresse : quelqu'un a pu la prendre.
    const avant = [...comptes.values()][0]!;
    comptes.set(avant.id, { ...avant, confirmeLe: null });
    const code = await unCodeDuProprietaire(d, { app: 'app_a', email: 'antoine@x.fr' });
    expect(code.ok).toBe(true);
    expect(sessions.size).toBe(0);
    expect(comptes.get(avant.id)).toMatchObject({ confirmeLe: 'x' });
    expect((await entrer(d, { app: 'app_a', email: 'antoine@x.fr', motDePasse: 'cheval-batterie', sansValidation: true })).ok).toBe(false);
  });
  it('une adresse illisible est refusée', async () => {
    const { m } = enMemoire();
    expect(await unCodeDuProprietaire({ magasin: m, cle, courrier: null, maintenant: () => 0 }, { app: 'app_a', email: 'pas une adresse' })).toEqual({ ok: false, refus: 'adresse_invalide' });
  });
});
