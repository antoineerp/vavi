// Repris de constructor-v13@32d18f3 : lib/deploy/custom-domain.ts (addCertificate, certificate, deleteCertificate de l'API
// GraphQL de Fly), le jeton et le réseau injectés.
/**
 * LES CERTIFICATS DES DOMAINES, CHEZ FLY — ajouter le certificat d'un hôte à l'app qui sert vavi, lire où il en est, le
 * retirer. Fly émet le certificat (Let's Encrypt) dès que le DNS du domaine pointe vers lui : c'est ce qui PROUVE que la
 * personne tient le domaine. Ne lève pas : `lu: false` dit pourquoi.
 */
import { lEtatDuCertificat, type EtatDuCertificat } from './le-domaine';

export type Issue<T> = { readonly lu: true; readonly valeur: T } | { readonly lu: false; readonly pourquoi: string };
export interface Fly { readonly jeton: string; readonly app: string; readonly appeler?: typeof fetch }

async function gql<T>(f: Fly, query: string, variables: Record<string, unknown>): Promise<Issue<T>> {
  try {
    const r = await (f.appeler ?? fetch)('https://api.fly.io/graphql', { method: 'POST', headers: { authorization: `Bearer ${f.jeton}`, 'content-type': 'application/json' }, body: JSON.stringify({ query, variables }) });
    if (!r.ok) return { lu: false, pourquoi: `Fly a répondu ${r.status}` };
    const j = (await r.json()) as { data?: T; errors?: { message: string }[] };
    if (j.errors?.length) return { lu: false, pourquoi: j.errors[0]!.message.slice(0, 300) };
    return { lu: true, valeur: j.data as T };
  } catch (e) { return { lu: false, pourquoi: `Fly n’a pas répondu (${String((e as Error)?.message ?? e).slice(0, 120)})` }; }
}

export async function ajouterLeCertificat(f: Fly, hote: string): Promise<Issue<true>> {
  const r = await gql(f, 'mutation($appId: ID!, $hostname: String!) { addCertificate(appId: $appId, hostname: $hostname) { certificate { hostname } } }', { appId: f.app, hostname: hote });
  // Déjà demandé (un second clic, une reprise) : c'est le même certificat.
  return r.lu || /already (exists|being validated)|has already been taken/i.test(r.pourquoi) ? { lu: true, valeur: true } : r;
}

export async function lEtatChezFly(f: Fly, hote: string): Promise<Issue<EtatDuCertificat>> {
  type C = { clientStatus?: string; configured?: boolean; issued?: { nodes?: unknown[] } } | null;
  const r = await gql<{ app: { certificate: C } | null }>(f, 'query($app: String!, $hostname: String!) { app(name: $app) { certificate(hostname: $hostname) { clientStatus configured issued { nodes { type } } } } }', { app: f.app, hostname: hote });
  if (!r.lu) return /not found|no certificate/i.test(r.pourquoi) ? { lu: true, valeur: 'inconnu' } : r;
  const c = r.valeur.app?.certificate ?? null;
  return { lu: true, valeur: lEtatDuCertificat(c ? { clientStatus: c.clientStatus, configured: c.configured, emis: c.issued?.nodes?.length ?? 0 } : null) };
}

export async function retirerLeCertificat(f: Fly, hote: string): Promise<Issue<true>> {
  const r = await gql(f, 'mutation($appId: ID!, $hostname: String!) { deleteCertificate(appId: $appId, hostname: $hostname) { certificate { hostname } } }', { appId: f.app, hostname: hote });
  return r.lu || /not found/i.test(r.pourquoi) ? { lu: true, valeur: true } : r;
}

/** Fly branché si son jeton est posé (`FLY_API_TOKEN`, par Antoine dans les secrets de Fly) ; sinon `null`, dit dans la console. */
export function flyDeLEnvironnement(env: Readonly<Record<string, string | undefined>>): Fly | null {
  const jeton = env.FLY_API_TOKEN?.trim();
  return jeton ? { jeton, app: env.FLY_APP_NAME?.trim() || 'vavi' } : null;
}
