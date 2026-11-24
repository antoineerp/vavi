// Repris de constructor-v13@5bb786e : app/api/sms/[projectId]/send/route.ts et lib/integrations/twilio-sender.ts (Twilio, E.164, compte du propriétaire seul)
/**
 * LE SMS D'UNE APP — envoyé par le compte Twilio du PROPRIÉTAIRE (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`,
 * `TWILIO_NUMERO`), jamais par celui de la plateforme. Numéro au format international (E.164) ; 1 600 caractères au plus
 * (Twilio segmente au-delà de 160). Un échec rend le message de l'opérateur.
 */
export type Issue<T> = { readonly lu: true; readonly valeur: T } | { readonly lu: false; readonly pourquoi: string };
export const SECRETS_DU_SMS = ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_NUMERO'] as const;
export const SMS_AU_PLUS = 1600;

export interface Sms { readonly a: string; readonly texte: string }
export interface Operateur { readonly sid: string; readonly jeton: string; readonly de: string }
export type Appel = (url: string, init: { method: 'POST'; headers: Record<string, string>; body: string }) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

export const estE164 = (n: string): boolean => /^\+[1-9]\d{6,14}$/.test(n);

/** Ce que la page envoie, relu. PUR. */
export function lireLeSms(corps: Record<string, unknown>): Issue<Sms> {
  const a = typeof corps.to === 'string' ? corps.to.replace(/[\s.-]/g, '') : '';
  const texte = typeof corps.body === 'string' ? corps.body : '';
  if (!a || !texte.trim()) return { lu: false, pourquoi: 'un numéro (`a`) et un texte' };
  if (!estE164(a)) return { lu: false, pourquoi: `« ${a.slice(0, 30)} » n’est pas un numéro international (+33612345678)` };
  if (texte.length > SMS_AU_PLUS) return { lu: false, pourquoi: `un SMS de ${SMS_AU_PLUS} caractères au plus` };
  return { lu: true, valeur: { a, texte } };
}

/** Le compte d'opérateur du propriétaire, complet ; `null` : il manque un des trois secrets. */
export async function lOperateur(secret: (nom: string) => Promise<Issue<string | null>>): Promise<Issue<Operateur | null>> {
  const v: string[] = [];
  for (const nom of SECRETS_DU_SMS) {
    const s = await secret(nom);
    if (!s.lu) return s;
    if (!s.valeur) return { lu: true, valeur: null };
    v.push(s.valeur);
  }
  const [sid, jeton, de] = v as [string, string, string];
  if (!/^AC[0-9a-f]{32}$/i.test(sid) || !estE164(de)) return { lu: false, pourquoi: 'TWILIO_ACCOUNT_SID commence par AC, TWILIO_NUMERO est au format +33…' };
  return { lu: true, valeur: { sid, jeton, de } };
}

export async function envoyerLeSms(appel: Appel, o: Operateur, s: Sms): Promise<Issue<{ readonly sid: string | null }>> {
  try {
    const r = await appel(`https://api.twilio.com/2010-04-01/Accounts/${o.sid}/Messages.json`, {
      method: 'POST',
      headers: { Authorization: `Basic ${Buffer.from(`${o.sid}:${o.jeton}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ To: s.a, From: o.de, Body: s.texte }).toString(),
    });
    const corps = await r.text().catch(() => '');
    if (!r.ok) return { lu: false, pourquoi: `twilio ${r.status} : ${corps.slice(0, 300)}` };
    let sid: string | null = null;
    try { sid = (JSON.parse(corps) as { sid?: string }).sid ?? null; } catch { /* corps non JSON */ }
    return { lu: true, valeur: { sid } };
  } catch (x) {
    return { lu: false, pourquoi: `twilio injoignable (${String((x as Error)?.message ?? x).slice(0, 120)})` };
  }
}
