/**
 * LE NOM LISIBLE D'UN SITE (Antoine, 26/11 : « ok pour point 1 », un site servi à `<identifiant>.<domaine>` ne se vend
 * pas) : chaque projet reçoit à sa création un nom tiré du sien (« Salon de coiffure » → `salon-de-coiffure`), unique
 * parmi tous les sites, que la personne change dans l'écran Domaine. Le site en ligne est servi à `<nom>.<domaine des
 * apps>` ; son identifiant y renvoie ; l'aperçu, privé, garde le sien. Table `vavi_noms_des_sites` ; avant sa migration,
 * aucun nom n'est posé ni lu, et tout reste servi à l'identifiant.
 *
 * Ce qu'il remplace : l'adresse `<identifiant>.<domaine>` seule (`lib/publication/les-adresses-des-apps.ts`).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Issue } from './les-domaines';

/** Les noms qu'aucun site ne prend : ceux de la plateforme, et ceux qu'un visiteur prendrait pour elle. */
export const NOMS_RESERVES: ReadonlySet<string> = new Set(['www', 'api', 'app', 'apps', 'admin', 'console', 'mail', 'smtp', 'ftp', 'vavi',
  'status', 'aide', 'help', 'support', 'docs', 'blog', 'static', 'cdn', 'auth', 'login', 'compte', 'comptes', 'paiement', 'pay', 'stripe', 'test', 'essai']);

const FORME = /^[a-z][a-z0-9-]{1,38}[a-z0-9]$/;

/** PURE — un nom de site valable tiré d'un texte (sans accent, minuscules, tirets), ou `null`. */
export function unNomDeSite(x: string): string | null {
  let s = x.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^[-0-9]+|-+$/g, '');
  if (s.length > 40) s = s.slice(0, 40).replace(/-[^-]*$/, '') || s.slice(0, 40);
  s = s.replace(/-+$/, '');
  return estUnNomPermis(s) ? s : null;
}

/** PURE — le nom est-il permis tel quel (forme, ni réservé, ni un aperçu) ? */
export const estUnNomPermis = (s: string): boolean => FORME.test(s) && !s.includes('--') && !NOMS_RESERVES.has(s) && !s.startsWith('apercu-');

const PRIS = '23505';

export async function leNomDuSite(base: SupabaseClient, projet: string): Promise<Issue<string | null>> {
  const r = await base.from('vavi_noms_des_sites').select('nom').eq('projet', projet).maybeSingle<{ nom: string }>();
  return r.error ? { lu: false, pourquoi: r.error.message } : { lu: true, valeur: r.data?.nom ?? null };
}

/** Le nom d'un projet qui n'en a pas encore : tiré de son nom, suivi de -2, -3… s'il est pris. Déjà nommé : rien ne change. */
export async function nommerLeSite(base: SupabaseClient, projet: string, nomDuProjet: string): Promise<Issue<string>> {
  const deja = await leNomDuSite(base, projet);
  if (!deja.lu) return deja;
  if (deja.valeur) return { lu: true, valeur: deja.valeur };
  const racine = unNomDeSite(nomDuProjet) ?? 'site';
  for (let i = 1; i <= 30; i++) {
    const nom = i === 1 && estUnNomPermis(racine) ? racine : `${racine.slice(0, 36)}-${i === 1 ? 1 : i}`;
    if (!estUnNomPermis(nom)) continue;
    const r = await base.from('vavi_noms_des_sites').insert({ nom, projet });
    if (!r.error) { oublier(); return { lu: true, valeur: nom }; }
    if (r.error.code !== PRIS) return { lu: false, pourquoi: r.error.message };
    const autre = await leNomDuSite(base, projet);
    if (autre.lu && autre.valeur) return { lu: true, valeur: autre.valeur };
  }
  return { lu: false, pourquoi: 'no free name' };
}

/** La personne change le nom de son site (écran Domaine). */
export async function renommerLeSite(base: SupabaseClient, projet: string, voulu: string): Promise<Issue<'fait' | 'invalide' | 'pris'>> {
  const nom = voulu.trim().toLowerCase();
  if (!estUnNomPermis(nom)) return { lu: true, valeur: 'invalide' };
  const autre = await base.from('vavi_noms_des_sites').select('projet').eq('nom', nom).maybeSingle<{ projet: string }>();
  if (autre.error) return { lu: false, pourquoi: autre.error.message };
  if (autre.data) return { lu: true, valeur: autre.data.projet === projet ? 'fait' : 'pris' };
  const r = await base.from('vavi_noms_des_sites').upsert({ projet, nom }, { onConflict: 'projet' });
  oublier();
  if (r.error) return r.error.code === PRIS ? { lu: true, valeur: 'pris' } : { lu: false, pourquoi: r.error.message };
  return { lu: true, valeur: 'fait' };
}

/** Les noms de tous les sites, pour l'aiguillage des requêtes. */
export const lesNomsSur = (base: SupabaseClient) => async (): Promise<Issue<readonly { nom: string; projet: string }[]>> => {
  const r = await base.from('vavi_noms_des_sites').select('nom, projet').limit(50_000);
  // Avant la migration, la table manque : aucun nom, tout reste servi à l'identifiant.
  return r.error ? { lu: false, pourquoi: r.error.message } : { lu: true, valeur: r.data as { nom: string; projet: string }[] };
};

let auRenouvellement: (() => void) | null = null;
/** La carte des domaines s'abonne : un nom posé ou changé la fait relire. */
export const quandUnNomChange = (f: () => void) => { auRenouvellement = f; };
const oublier = () => auRenouvellement?.();
