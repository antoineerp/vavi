/**
 * « MONTRER À CLAUDE » — troisième des trois améliorations « comme Lovable » (Antoine, 25/11).
 *
 * Dans l'aperçu de la console, la personne clique sur une zone et dit ce qu'elle veut ; la console écrit la phrase à
 * coller dans Claude, qui nomme le projet, l'écran, l'endroit (le texte vu, la section, le fichier quand le build l'a
 * situé) et la demande. Rien n'est écrit dans le projet : c'est Claude qui fera le changement, dans un chantier. PURE.
 */
export interface Endroit {
  readonly chemin: string;
  readonly titreDeLaPage?: string;
  readonly section?: string;
  readonly texte?: string;
  /** `data-texte` : `<fichier>:<début>-<fin>,…`, posé au build. */
  readonly source?: string;
  /** `data-image` : le nom de la photo. */
  readonly image?: string;
}

const court = (t: string, n: number): string => { const x = t.replace(/\s+/g, ' ').trim(); return x.length > n ? `${x.slice(0, n - 1)}…` : x; };

/** Le fichier d'un `data-texte`, s'il se lit. */
export const leFichierDeLaSource = (source: string | undefined): string | null => {
  const m = /^((?:src|public)\/[\w\-./[\]]+\.(?:tsx|ts|jsx|js|md|json)):\d+-\d+(?:,\d+-\d+)*$/.exec(source ?? '');
  return m ? m[1]! : null;
};

export function laPhrasePourClaude(o: { readonly projet: string; readonly endroit: Endroit; readonly demande: string; readonly langue: 'fr' | 'en' }): string {
  const e = o.endroit;
  const fichier = leFichierDeLaSource(e.source);
  const fr = o.langue === 'fr';
  const ecran = e.titreDeLaPage ? (fr ? `l'écran « ${court(e.titreDeLaPage, 80)} » (${e.chemin})` : `the screen "${court(e.titreDeLaPage, 80)}" (${e.chemin})`) : (fr ? `la page ${e.chemin}` : `the page ${e.chemin}`);
  const ou = [
    e.section ? (fr ? `dans la section « ${court(e.section, 80)} »` : `in the section "${court(e.section, 80)}"`) : null,
    e.image ? (fr ? `sur la photo « ${e.image} »` : `on the photo "${e.image}"`) : e.texte ? (fr ? `à l'endroit qui dit « ${court(e.texte, 160)} »` : `where it says "${court(e.texte, 160)}"`) : null,
    fichier ? (fr ? `(fichier ${fichier})` : `(file ${fichier})`) : null,
  ].filter(Boolean).join(' ');
  const demande = o.demande.trim();
  return fr
    ? `Sur mon projet vavi « ${o.projet} », dans ${ecran}${ou ? `, ${ou}` : ''} : ${demande}`
    : `On my vavi project "${o.projet}", in ${ecran}${ou ? `, ${ou}` : ''}: ${demande}`;
}
