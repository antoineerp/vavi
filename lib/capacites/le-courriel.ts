// Repris de constructor-v13@5bb786e : lib/integrations/email-provider.ts (fournisseurs, ordre, forme de chaque API)
/**
 * LE COURRIEL D'UNE APP — envoyé par le fournisseur du PROPRIÉTAIRE, à sa clé (`set_secret`), jamais par celle de vavi :
 * la réputation d'un domaine expéditeur ne se partage pas, et un projet qui démarche ferait bloquer tous les autres.
 *
 * Les fournisseurs, dans l'ordre à égalité : Brevo, Mailjet, Resend, SendGrid (les deux premiers sont outillés pour la
 * campagne). La clé que le propriétaire a posée gagne toujours. L'expéditeur est `COURRIEL_EXPEDITEUR`, une adresse
 * vérifiée chez son fournisseur. Texte seul : une page n'envoie pas de HTML (ni lien maquillé, ni image pisteuse).
 * Un échec rend le message du fournisseur : « clé invalide » et « domaine non vérifié » demandent deux gestes opposés.
 */
export type Issue<T> = { readonly lu: true; readonly valeur: T } | { readonly lu: false; readonly pourquoi: string };
export type Fournisseur = 'brevo' | 'mailjet' | 'resend' | 'sendgrid';

/** Les secrets que le propriétaire pose, par fournisseur. */
export const SECRETS_DU_COURRIEL: Readonly<Record<Fournisseur, readonly string[]>> = {
  brevo: ['BREVO_API_KEY'], mailjet: ['MAILJET_API_KEY', 'MAILJET_SECRET_KEY'], resend: ['RESEND_API_KEY'], sendgrid: ['SENDGRID_API_KEY'],
};
export const EXPEDITEUR = 'COURRIEL_EXPEDITEUR';
export const ORDRE: readonly Fournisseur[] = ['brevo', 'mailjet', 'resend', 'sendgrid'];
export const DESTINATAIRES_AU_PLUS = 50;
export const TEXTE_AU_PLUS = 50_000;

export interface Envoi { readonly a: readonly string[]; readonly sujet: string; readonly texte: string }
export interface Configuration { readonly fournisseur: Fournisseur; readonly cles: readonly string[]; readonly de: string }
export type Appel = (url: string, init: { method: 'POST'; headers: Record<string, string>; body: string }) => Promise<{ ok: boolean; status: number; text(): Promise<string>; headers: { get(n: string): string | null } }>;

const ADRESSE = /^[^\s@<>()[\]\\,;:"]{1,64}@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;
const uneLigne = (v: string): string => v.replace(/[\r\n]+/g, ' ').trim();

/** Ce que la page envoie, relu. PUR. Un destinataire illisible refuse l'envoi entier : rien ne part à moitié en silence. */
export function lireLEnvoi(corps: Record<string, unknown>): Issue<Envoi> {
  const brut = Array.isArray(corps.to) ? corps.to : [corps.to];
  const a = brut.map((x) => (typeof x === 'string' ? x.trim() : ''));
  if (a.length === 0 || a.some((x) => !x)) return { lu: false, pourquoi: 'un destinataire au moins (`a`)' };
  if (a.length > DESTINATAIRES_AU_PLUS) return { lu: false, pourquoi: `au plus ${DESTINATAIRES_AU_PLUS} destinataires par envoi` };
  const faux = a.find((x) => !ADRESSE.test(x));
  if (faux) return { lu: false, pourquoi: `« ${faux.slice(0, 80)} » n’est pas une adresse de courriel` };
  const sujet = typeof corps.subject === 'string' ? uneLigne(corps.subject).slice(0, 200) : '';
  const texte = typeof corps.text === 'string' ? corps.text : '';
  if (!sujet || !texte.trim()) return { lu: false, pourquoi: 'un sujet et un texte' };
  if (texte.length > TEXTE_AU_PLUS) return { lu: false, pourquoi: `un texte de ${TEXTE_AU_PLUS} caractères au plus` };
  return { lu: true, valeur: { a: [...new Set(a.map((x) => x.toLowerCase()))], sujet, texte } };
}

/** Le fournisseur du propriétaire : le premier, dans l'ordre, dont toutes les clés sont posées ; et son expéditeur. */
export async function leFournisseur(secret: (nom: string) => Promise<Issue<string | null>>): Promise<Issue<Configuration | null>> {
  const de = await secret(EXPEDITEUR);
  if (!de.lu) return de;
  for (const f of ORDRE) {
    const cles: string[] = [];
    for (const nom of SECRETS_DU_COURRIEL[f]) {
      const v = await secret(nom);
      if (!v.lu) return v;
      if (v.valeur) cles.push(v.valeur);
    }
    if (cles.length === SECRETS_DU_COURRIEL[f].length) return { lu: true, valeur: de.valeur ? { fournisseur: f, cles, de: de.valeur } : null };
  }
  return { lu: true, valeur: null };
}

/** La requête de chaque fournisseur, à la forme de son API documentée. PUR. */
export function laRequete(c: Configuration, e: Envoi): { url: string; headers: Record<string, string>; body: string } {
  const json = { 'Content-Type': 'application/json', Accept: 'application/json' };
  if (c.fournisseur === 'brevo') return { url: 'https://api.brevo.com/v3/smtp/email', headers: { ...json, 'api-key': c.cles[0]! },
    body: JSON.stringify({ sender: { email: c.de }, to: e.a.map((email) => ({ email })), subject: e.sujet, textContent: e.texte }) };
  if (c.fournisseur === 'mailjet') return { url: 'https://api.mailjet.com/v3.1/send', headers: { ...json, Authorization: `Basic ${Buffer.from(`${c.cles[0]}:${c.cles[1]}`).toString('base64')}` },
    body: JSON.stringify({ Messages: [{ From: { Email: c.de }, To: e.a.map((Email) => ({ Email })), Subject: e.sujet, TextPart: e.texte }] }) };
  if (c.fournisseur === 'sendgrid') return { url: 'https://api.sendgrid.com/v3/mail/send', headers: { ...json, Authorization: `Bearer ${c.cles[0]}` },
    body: JSON.stringify({ personalizations: [{ to: e.a.map((email) => ({ email })) }], from: { email: c.de }, subject: e.sujet, content: [{ type: 'text/plain', value: e.texte }] }) };
  return { url: 'https://api.resend.com/emails', headers: { ...json, Authorization: `Bearer ${c.cles[0]}` },
    body: JSON.stringify({ from: c.de, to: e.a, subject: e.sujet, text: e.texte }) };
}

/** L'identifiant que le fournisseur rend, quand il en rend un. PUR. */
function lIdentifiant(f: Fournisseur, corps: string, entete: string | null): string | null {
  if (f === 'sendgrid') return entete;
  try {
    const j = JSON.parse(corps) as { id?: string; messageId?: string; Messages?: { To?: { MessageID?: unknown }[] }[] };
    const id = f === 'brevo' ? j.messageId : f === 'mailjet' ? j.Messages?.[0]?.To?.[0]?.MessageID : j.id;
    return id === undefined || id === null ? null : String(id);
  } catch { return null; }
}

export async function envoyer(appel: Appel, c: Configuration, e: Envoi): Promise<Issue<{ readonly id: string | null; readonly fournisseur: Fournisseur }>> {
  const r = laRequete(c, e);
  try {
    const rep = await appel(r.url, { method: 'POST', headers: r.headers, body: r.body });
    const corps = await rep.text().catch(() => '');
    if (!rep.ok) return { lu: false, pourquoi: `${c.fournisseur} ${rep.status} : ${corps.slice(0, 300)}` };
    return { lu: true, valeur: { id: lIdentifiant(c.fournisseur, corps, rep.headers.get('x-message-id')), fournisseur: c.fournisseur } };
  } catch (x) {
    return { lu: false, pourquoi: `${c.fournisseur} injoignable (${String((x as Error)?.message ?? x).slice(0, 120)})` };
  }
}
