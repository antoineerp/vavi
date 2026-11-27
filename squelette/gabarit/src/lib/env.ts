/**
 * L'environnement de l'app, lu en un seul endroit.
 *
 * En production, la plateforme injecte dans index.html l'adresse et la clé publique de Supabase, le schéma de l'app et
 * sa base de montage (`window.__…__`). En développement local, `import.meta.env` les donne. Aucune clé secrète ici.
 */
declare global {
  interface Window {
    __SUPABASE_URL__?: string;
    __SUPABASE_ANON_KEY__?: string;
    __DATABASE_SCHEMA__?: string;
    __VAVI_BASENAME__?: string;
    /** Le code d'entrée du propriétaire, posé par la vue de vavi dans Claude (`lib/comptes.ts`). */
    __VAVI_CODE__?: string;
  }
}

type CleInjectee = '__SUPABASE_URL__' | '__SUPABASE_ANON_KEY__' | '__DATABASE_SCHEMA__' | '__VAVI_BASENAME__';
const injectee = (cle: CleInjectee): string | null => {
  const v = typeof window === 'undefined' ? undefined : window[cle];
  return typeof v === 'string' && v.length > 0 ? v : null;
};
const locale = (cle: string): string | null => {
  const v = (import.meta.env as Record<string, string | undefined>)[cle];
  return typeof v === 'string' && v.length > 0 ? v : null;
};

export const SUPABASE_URL = injectee('__SUPABASE_URL__') ?? locale('VITE_SUPABASE_URL');
export const SUPABASE_ANON_KEY = injectee('__SUPABASE_ANON_KEY__') ?? locale('VITE_SUPABASE_ANON_KEY');
export const SCHEMA = injectee('__DATABASE_SCHEMA__') ?? locale('VITE_SCHEMA');

/** La base de montage du routeur : `/p/<id>/` dans l'aperçu, `/` sous un domaine. `undefined` pour `/`. */
export const BASE_DE_MONTAGE: string | undefined = (() => {
  const brute = injectee('__VAVI_BASENAME__') ?? (import.meta.env.BASE_URL as string | undefined) ?? '/';
  const nette = `/${brute.replace(/^\/+|\/+$/g, '')}`;
  return nette === '/' ? undefined : nette;
})();

/**
 * La clé, propre à CETTE app, d'une valeur gardée dans le navigateur : l'aperçu sert chaque projet à la même adresse
 * (`/p/<id>/`), et une clé nue y serait partagée entre apps (le panier de l'une monterait dans l'autre).
 */
export const cleDeLApp = (nom: string): string => `${nom}:${SCHEMA ?? BASE_DE_MONTAGE ?? '/'}`;

export const BASE_BRANCHEE = SUPABASE_URL !== null && SUPABASE_ANON_KEY !== null && SCHEMA !== null;
