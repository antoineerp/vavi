/** Du HTML dont chaque valeur est échappée : `html\`<td>${valeur}</td>\``. Un `html` imbriqué, ou une liste, passe tel quel. */
export interface HtmlSur { readonly __html: string }
const echapper = (v: unknown): string => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
const morceau = (v: unknown): string => (Array.isArray(v) ? v.map(morceau).join('')
  : v && typeof v === 'object' && '__html' in v ? (v as HtmlSur).__html : echapper(v));
export function html(textes: TemplateStringsArray, ...valeurs: readonly unknown[]): HtmlSur {
  return { __html: textes.reduce((acc, t, i) => acc + t + (i < valeurs.length ? morceau(valeurs[i]) : ''), '') };
}

