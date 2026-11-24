/**
 * La configuration Supabase de vavi : lue une fois, jugée par son schéma.
 * Une variable absente ne se remplace jamais par un défaut : la configuration dit ce qui manque.
 */
import { z } from 'zod';

const Publique = z.object({
  url: z.string().url(),
  cleAnonyme: z.string().min(20),
});

export type ConfigurationPublique = z.infer<typeof Publique>;

export type Lecture<T> = { readonly lue: true; readonly valeur: T } | { readonly lue: false; readonly manque: readonly string[] };

type Env = Readonly<Record<string, string | undefined>>;

/** PURE — l'adresse et la clé anonyme du projet, ou la liste de ce qui manque. */
export function configurationPublique(env: Env): Lecture<ConfigurationPublique> {
  const brut = { url: env.NEXT_PUBLIC_SUPABASE_URL, cleAnonyme: env.NEXT_PUBLIC_SUPABASE_ANON_KEY };
  const r = Publique.safeParse(brut);
  if (r.success) return { lue: true, valeur: r.data };
  const manque = r.error.issues.map((i) => (i.path[0] === 'url' ? 'NEXT_PUBLIC_SUPABASE_URL' : 'NEXT_PUBLIC_SUPABASE_ANON_KEY'));
  return { lue: false, manque: [...new Set(manque)] };
}

/** PURE — la clé de service, côté serveur seulement. */
export function cleDeService(env: Env): Lecture<string> {
  const cle = env.SUPABASE_SERVICE_ROLE_KEY;
  return cle && cle.length >= 20 ? { lue: true, valeur: cle } : { lue: false, manque: ['SUPABASE_SERVICE_ROLE_KEY'] };
}

/** Lève en nommant ce qui manque : un appel sans configuration est un incident, pas un « rien ». */
export function exiger<T>(l: Lecture<T>): T {
  if (l.lue) return l.valeur;
  throw new Error(`Configuration Supabase incomplète : ${l.manque.join(', ')}`);
}
