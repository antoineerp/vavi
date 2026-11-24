/** Le SMS : numéro international, compte Twilio du propriétaire complet, la forme de l'API, un refus dit. */
import { describe, expect, it } from 'vitest';
import { envoyerLeSms, lireLeSms, lOperateur, type Appel } from '@/lib/capacites/le-sms';

const SID = `AC${'a'.repeat(32)}`;
const secrets = (s: Record<string, string>) => async (n: string) => ({ lu: true as const, valeur: s[n] ?? null });

describe('le SMS', () => {
  it('le numéro au format international, le texte borné', () => {
    expect(lireLeSms({ to: '+33 6 12 34 56 78', body: 'Bonjour' })).toEqual({ lu: true, valeur: { a: '+33612345678', texte: 'Bonjour' } });
    expect(lireLeSms({ to: '0612345678', body: 'x' })).toMatchObject({ lu: false });
    expect(lireLeSms({ to: '+33612345678', body: 'x'.repeat(1601) })).toMatchObject({ lu: false });
  });
  it('le compte du propriétaire, complet, ou aucun — jamais celui de la plateforme', async () => {
    expect(await lOperateur(secrets({ TWILIO_ACCOUNT_SID: SID, TWILIO_AUTH_TOKEN: 't', TWILIO_NUMERO: '+33100000000' }))).toEqual({ lu: true, valeur: { sid: SID, jeton: 't', de: '+33100000000' } });
    expect(await lOperateur(secrets({ TWILIO_ACCOUNT_SID: SID, TWILIO_AUTH_TOKEN: 't' }))).toEqual({ lu: true, valeur: null });
    expect(await lOperateur(secrets({ TWILIO_ACCOUNT_SID: 'x', TWILIO_AUTH_TOKEN: 't', TWILIO_NUMERO: '+33100000000' }))).toMatchObject({ lu: false });
  });
  it('la requête de Twilio ; un refus rend son message', async () => {
    let vu = { url: '', body: '' };
    const ok: Appel = async (url, i) => { vu = { url, body: i.body }; return { ok: true, status: 201, text: async () => '{"sid":"SM1"}' }; };
    const o = { sid: SID, jeton: 't', de: '+33100000000' };
    expect(await envoyerLeSms(ok, o, { a: '+33612345678', texte: 'Salut' })).toEqual({ lu: true, valeur: { sid: 'SM1' } });
    expect(vu.url).toBe(`https://api.twilio.com/2010-04-01/Accounts/${SID}/Messages.json`);
    expect(Object.fromEntries(new URLSearchParams(vu.body))).toEqual({ To: '+33612345678', From: '+33100000000', Body: 'Salut' });
    const non: Appel = async () => ({ ok: false, status: 401, text: async () => 'Authenticate' });
    expect(await envoyerLeSms(non, o, { a: '+33612345678', texte: 'x' })).toEqual({ lu: false, pourquoi: 'twilio 401 : Authenticate' });
  });
});
