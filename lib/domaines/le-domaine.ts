// Repris de constructor-v13@32d18f3 : lib/deploy/custom-domain-instructions.ts (le plan DNS : un CNAME vers l'app Fly, un
// domaine racine basculé vers sa forme www avec la redirection dite) et la validation de lib/deploy/custom-domain.ts ; au
// vous de la console, sans le bloc de connaissance pour le modèle (vavi n'en appelle pas).
/**
 * LE DOMAINE D'UN SITE — l'adresse à soi (www.votre-nom.fr) qu'une personne branche sur son site en ligne. Le domaine saisi
 * est relu (jamais une adresse de vavi, de Fly, ni un domaine d'exemple) ; un domaine racine (deux étiquettes) bascule
 * vers sa forme `www.`, car la plupart des registrars refusent un CNAME à la racine. L'état du certificat lu chez Fly dit
 * où en est le branchement. PUR.
 */
export type Refus = { readonly ok: false; readonly pourquoi: string };
export interface PlanDns {
  readonly ok: true;
  /** L'hôte branché (un domaine racine devient `www.<racine>`). */
  readonly hote: string;
  /** Le domaine racine saisi, s'il a basculé vers www : à rediriger chez le registrar. */
  readonly racine: string | null;
  readonly enregistrement: { readonly type: 'CNAME'; readonly nom: string; readonly valeur: string };
}

const ETIQUETTES = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/** Le domaine saisi, relu et nettoyé (`https://`, chemin et point final retirés), ou pourquoi il est refusé. */
export function lePlanDns(saisie: string, o: { readonly cible: string; readonly interdits: readonly string[] }): PlanDns | Refus {
  const brut = saisie.trim().toLowerCase().replace(/^[a-z]+:\/\//, '').replace(/[/?#].*$/, '').replace(/\.+$/, '').replace(/:\d+$/, '');
  if (!brut) return { ok: false, pourquoi: 'saisissez votre domaine, par exemple www.votre-nom.fr' };
  if (brut.length > 253 || !ETIQUETTES.test(brut)) return { ok: false, pourquoi: `« ${brut.slice(0, 80)} » ne se lit pas comme un domaine (par exemple www.votre-nom.fr)` };
  for (const i of ['fly.dev', 'fly.io', 'localhost', 'example.com', 'example.org', 'example.net', ...o.interdits]) {
    if (brut === i || brut.endsWith(`.${i}`)) return { ok: false, pourquoi: `${i} n’est pas un domaine que vous pouvez brancher ici` };
  }
  const racine = brut.split('.').length === 2 ? brut : null;
  const hote = racine ? `www.${racine}` : brut;
  return { ok: true, hote, racine, enregistrement: { type: 'CNAME', nom: hote.split('.').slice(0, -2).join('.'), valeur: o.cible } };
}

/** La cible du CNAME : l'app Fly qui sert vavi. */
export const laCibleDns = (env: Readonly<Record<string, string | undefined>>): string => `${env.FLY_APP_NAME?.trim() || 'vavi'}.fly.dev`;

export type EtatDuCertificat = 'en_attente' | 'dns_vu' | 'actif' | 'inconnu';
/** L'état d'un certificat Fly : émis (le site répond en HTTPS à ce domaine), DNS vu (émission en cours), en attente du DNS. */
export function lEtatDuCertificat(c: { readonly clientStatus?: string | null; readonly configured?: boolean | null; readonly emis?: number } | null): EtatDuCertificat {
  if (!c) return 'inconnu';
  if ((c.emis ?? 0) > 0 || c.clientStatus === 'Ready') return 'actif';
  if (c.configured === true || c.clientStatus === 'Awaiting cert') return 'dns_vu';
  return 'en_attente';
}
