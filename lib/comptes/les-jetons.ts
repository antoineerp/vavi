/**
 * LES JETONS DES COMPTES D'APP — vavi signe la connexion d'un compte d'app (ES256, la clé `VAVI_CLE_DES_COMPTES`, une
 * JWK privée que Supabase connaît par son `kid`, importée dans « JWT Keys ») : la base lit `sub` par `auth.uid()`, la
 * RLS décide comme pour tout compte. Un jeton dit son app (`app`) ; une route de vavi qui le lit refuse celui d'une autre.
 */
import { createPrivateKey, createPublicKey, sign, verify, type KeyObject } from 'node:crypto';

export const DUREE_DU_JETON_S = 3600;

export interface CleDesComptes { readonly privee: KeyObject; readonly publique: KeyObject; readonly kid: string }

/**
 * Le texte de la clé tel qu'il a été posé. INCIDENT 25/11 : posée depuis un terminal Windows, la clé gardait les
 * apostrophes de la commande autour d'elle, et vavi la disait « illisible ». Des guillemets ou apostrophes autour sont
 * retirés ; une clé posée en base64 (sans aucun guillemet à taper) est lue aussi. PURE.
 */
export function leTexteDeLaCle(pose: string | undefined): string {
  let t = (pose ?? '').trim();
  while (t.length >= 2 && ((t[0] === "'" && t.endsWith("'")) || (t[0] === '"' && t.endsWith('"')))) t = t.slice(1, -1).trim();
  if (t && !t.startsWith('{') && /^[A-Za-z0-9+/=_-]+$/.test(t)) {
    const d = Buffer.from(t, 'base64').toString('utf8').trim();
    if (d.startsWith('{')) return d;
  }
  return t;
}

/** La clé posée chez l'hébergeur, ou `null` (absente, ou ce n'est pas une JWK EC P-256 privée avec son `kid`). */
export function laCleDesComptes(env: Readonly<Record<string, string | undefined>> = process.env): CleDesComptes | null {
  const brut = leTexteDeLaCle(env.VAVI_CLE_DES_COMPTES);
  if (!brut) return null;
  try {
    const jwk = JSON.parse(brut) as { kty?: string; crv?: string; d?: string; kid?: string };
    if (jwk.kty !== 'EC' || jwk.crv !== 'P-256' || !jwk.d || !jwk.kid) return null;
    const privee = createPrivateKey({ key: jwk as never, format: 'jwk' });
    return { privee, publique: createPublicKey(privee), kid: jwk.kid };
  } catch { return null; }
}

const b64 = (x: Buffer | string): string => Buffer.from(x).toString('base64url');

export interface Charge { readonly sub: string; readonly app: string; readonly email: string; readonly exp: number }

/** PUR (la clé et l'heure données) — le jeton d'accès d'un compte d'app, une heure. */
export function signerUnJeton(cle: CleDesComptes, c: { readonly compte: string; readonly app: string; readonly email: string }, maintenantS: number): string {
  const entete = b64(JSON.stringify({ alg: 'ES256', typ: 'JWT', kid: cle.kid }));
  const charge = b64(JSON.stringify({ sub: c.compte, role: 'authenticated', aud: 'authenticated', iss: 'vavi', app: c.app, email: c.email,
    iat: maintenantS, exp: maintenantS + DUREE_DU_JETON_S }));
  const signature = sign('sha256', Buffer.from(`${entete}.${charge}`), { key: cle.privee, dsaEncoding: 'ieee-p1363' });
  return `${entete}.${charge}.${b64(signature)}`;
}

/** Le jeton est-il signé par vavi, pour un compte d'app, et encore valable ? Rend sa charge, ou `null`. */
export function lireUnJeton(cle: CleDesComptes, jeton: string, maintenantS: number): Charge | null {
  const [e, c, s] = jeton.split('.');
  if (!e || !c || !s) return null;
  try {
    const entete = JSON.parse(Buffer.from(e, 'base64url').toString('utf8')) as { alg?: string; kid?: string };
    if (entete.alg !== 'ES256' || entete.kid !== cle.kid) return null;
    if (!verify('sha256', Buffer.from(`${e}.${c}`), { key: cle.publique, dsaEncoding: 'ieee-p1363' }, Buffer.from(s, 'base64url'))) return null;
    const x = JSON.parse(Buffer.from(c, 'base64url').toString('utf8')) as Partial<Charge> & { iss?: string; role?: string };
    if (x.iss !== 'vavi' || x.role !== 'authenticated' || typeof x.sub !== 'string' || typeof x.app !== 'string' || typeof x.exp !== 'number' || x.exp <= maintenantS) return null;
    return { sub: x.sub, app: x.app, email: typeof x.email === 'string' ? x.email : '', exp: x.exp };
  } catch { return null; }
}

/** La clé des comptes, vue par la santé de vavi : posée, lisible, et publiée par Supabase (son `kid` dans les clés publiques). */
export async function lEtatDeLaCle(env: Readonly<Record<string, string | undefined>>, urlSupabase: string | null): Promise<'absente' | 'illisible' | 'publiee' | 'non_publiee' | 'injoignable'> {
  if (!(env.VAVI_CLE_DES_COMPTES ?? '').trim()) return 'absente';
  const cle = laCleDesComptes(env);
  if (!cle) return 'illisible';
  if (!urlSupabase) return 'injoignable';
  try {
    const r = await fetch(`${urlSupabase.replace(/\/$/, '')}/auth/v1/.well-known/jwks.json`, { signal: AbortSignal.timeout(4000) });
    const j = await r.json() as { keys?: { kid?: string }[] };
    return (j.keys ?? []).some((k) => k.kid === cle.kid) ? 'publiee' : 'non_publiee';
  } catch { return 'injoignable'; }
}
