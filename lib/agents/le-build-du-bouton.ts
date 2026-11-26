/**
 * Le build qu'une page regarde quand elle lance un agent : l'aperçu (servi sous `/p/<projet>/` ou à l'hôte
 * `apercu-<projet>.`), sinon le site en ligne, sinon l'aperçu. PUR.
 */
export function leBuildDuBouton(referent: string | null, projet: string, b: { readonly apercu: string | null; readonly enLigne: string | null }): string | null {
  let u: URL | null = null;
  try { u = referent ? new URL(referent) : null; } catch { u = null; }
  const regardeLApercu = Boolean(u && (u.pathname.startsWith(`/p/${projet}`) || u.hostname.startsWith(`apercu-${projet}.`)));
  return regardeLApercu ? b.apercu ?? b.enLigne : b.enLigne ?? b.apercu;
}
