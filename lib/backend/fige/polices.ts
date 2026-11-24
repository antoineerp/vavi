// Repris de constructor-v13@5bb786e : generateur-v2/fige/polices.ts
/**
 * Les polices qu'une app peut porter : une liste fermée de paquets auto-hébergés, déjà dans le `package.json` du gabarit.
 * La direction d'app.json nomme une police de cette liste ; la peau importe son paquet et cite sa famille CSS, relevée
 * dans le paquet lui-même. Une police hors de la liste ne s'écrit pas : le schéma la refuse.
 */
export type Repli = 'serif' | 'sans-serif' | 'monospace';
interface Police { readonly paquet: string; readonly famille: string; readonly repli: Repli }

const variable = (id: string, nom: string, repli: Repli): readonly [string, Police] =>
  [nom, { paquet: `@fontsource-variable/${id}`, famille: `${nom} Variable`, repli }];

export const POLICES: ReadonlyMap<string, Police> = new Map([
  variable('fraunces', 'Fraunces', 'serif'),
  variable('playfair-display', 'Playfair Display', 'serif'),
  variable('newsreader', 'Newsreader', 'serif'),
  variable('lora', 'Lora', 'serif'),
  variable('eb-garamond', 'EB Garamond', 'serif'),
  variable('cormorant', 'Cormorant', 'serif'),
  variable('inter', 'Inter', 'sans-serif'),
  variable('dm-sans', 'DM Sans', 'sans-serif'),
  variable('manrope', 'Manrope', 'sans-serif'),
  variable('plus-jakarta-sans', 'Plus Jakarta Sans', 'sans-serif'),
  variable('space-grotesk', 'Space Grotesk', 'sans-serif'),
  variable('bricolage-grotesque', 'Bricolage Grotesque', 'sans-serif'),
  variable('outfit', 'Outfit', 'sans-serif'),
  variable('archivo', 'Archivo', 'sans-serif'),
  variable('sora', 'Sora', 'sans-serif'),
  variable('work-sans', 'Work Sans', 'sans-serif'),
  variable('instrument-sans', 'Instrument Sans', 'sans-serif'),
  variable('figtree', 'Figtree', 'sans-serif'),
  variable('nunito', 'Nunito', 'sans-serif'),
  variable('syne', 'Syne', 'sans-serif'),
  variable('jetbrains-mono', 'JetBrains Mono', 'monospace'),
]);

export const NOMS_DES_POLICES = [...POLICES.keys()] as [string, ...string[]];

/**
 * Les polices que le propriétaire a retirées : une app livrée qui en porte une se relit et se construit encore, mais
 * aucune génération ne la propose ni ne la choisit. Ce qu'elle remplace : un catalogue entier proposé à chaque cadrage.
 */
export const POLICES_RETIREES: ReadonlySet<string> = new Set(['Space Grotesk']);
export const POLICES_PROPOSEES = NOMS_DES_POLICES.filter((p) => !POLICES_RETIREES.has(p)) as [string, ...string[]];

/** Les polices retirées qu'une direction prend, hors celles que l'app portait déjà. PUR. */
export const lesPolicesRetirees = (d: { readonly polices: Readonly<Record<'titres' | 'texte', string>> }, avant?: { readonly polices: Readonly<Record<'titres' | 'texte', string>> }): string[] =>
  [...new Set([d.polices.titres, d.polices.texte])].filter((p) => POLICES_RETIREES.has(p) && p !== avant?.polices.titres && p !== avant?.polices.texte);

/** Un schéma JSON montré au modèle, sans les polices retirées dans ses énumérations. PUR. */
export const sansLesPolicesRetirees = <T,>(schema: T): T =>
  JSON.parse(JSON.stringify(schema), (k, v: unknown) => (k === 'enum' && Array.isArray(v) ? v.filter((x) => !POLICES_RETIREES.has(x as string)) : v)) as T;

export function police(nom: string): Police {
  const p = POLICES.get(nom);
  if (!p) throw new Error(`${nom} n'est pas une police du catalogue`);
  return p;
}
