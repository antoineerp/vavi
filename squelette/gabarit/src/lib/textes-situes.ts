/**
 * Où vit chaque texte qu'un écran affiche. Au build, chaque élément dont un enfant direct est un texte écrit dans le code
 * reçoit `data-texte="<fichier>:<début>-<fin>,…"` ; le fichier source ne change pas. L'aperçu désigne cet élément, la
 * plateforme relit le passage dans le fichier et le remplace, puis revérifie l'app sans modèle.
 *
 * Une donnée n'est pas un texte : un courriel, une adresse web, un seul mot qui porte un chiffre, un souligné ou une barre
 * restent où ils sont. Une valeur lue en base n'est jamais écrite dans le code : elle n'est pas vue ici.
 */
import ts from 'typescript';

export interface TexteDuCode {
  readonly debut: number;
  readonly fin: number;
  /** Ce que l'écran affiche : les lignes jointes par une espace, les entités décodées. */
  readonly texte: string;
  /** `jsx` : un texte entre balises ; `expression` : `{'…'}` entre balises. */
  readonly forme: 'jsx' | 'expression';
  /** L'espace gardé autour d'un texte entre balises. */
  readonly avant: string;
  readonly apres: string;
}

const ENTITES: Readonly<Record<string, string>> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: '\'', nbsp: ' ' };

/** Les entités du texte, décodées comme le compilateur JSX ; une entité inconnue ⇒ `null`, et le texte n'est pas situé. */
function decoder(s: string): string | null {
  let inconnue = false;
  const r = s.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g, (e, c: string) => {
    if (c.startsWith('#x')) return String.fromCodePoint(parseInt(c.slice(2), 16));
    if (c.startsWith('#')) return String.fromCodePoint(parseInt(c.slice(1), 10));
    const v = ENTITES[c];
    if (v === undefined) inconnue = true;
    return v ?? e;
  });
  return inconnue ? null : r;
}

/** Le texte tel que JSX le rend : chaque ligne rognée à sa jointure, les lignes vides retirées, jointes par une espace. */
function commeJsx(s: string): string {
  const lignes = s.split(/\r\n|\n|\r/);
  return lignes.map((l, i) => {
    const debut = i > 0 ? l.replace(/^[ \t]+/, '') : l;
    return i < lignes.length - 1 ? debut.replace(/[ \t]+$/, '') : debut;
  }).filter((l) => l !== '').join(' ');
}

function estUneDonnee(s: string): boolean {
  const t = s.trim();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t) || /^(?:https?:\/\/|www\.)\S+$/i.test(t)) return true;
  return !/\s/.test(t) && /[\d_/\\]/.test(t);
}

/** Un texte que la personne lit : au moins un mot de deux lettres, et pas une donnée. */
export const estUnTexte = (s: string): boolean => /\p{L}{2}/u.test(s) && !estUneDonnee(s);

function texteDeLEnfant(n: ts.Node, source: ts.SourceFile): TexteDuCode | null {
  if (ts.isJsxText(n) && !n.containsOnlyTriviaWhiteSpaces) {
    const m = /^([ \t\r\n]*)([\s\S]*?)([ \t\r\n]*)$/.exec(n.getFullText(source))!;
    const coeur = decoder(commeJsx(m[2] ?? ''));
    return coeur && estUnTexte(coeur) ? { debut: n.getFullStart(), fin: n.getEnd(), texte: coeur, forme: 'jsx', avant: m[1] ?? '', apres: m[3] ?? '' } : null;
  }
  if (ts.isJsxExpression(n) && n.expression && (ts.isStringLiteral(n.expression) || ts.isNoSubstitutionTemplateLiteral(n.expression))) {
    const v = n.expression.text;
    return estUnTexte(v) ? { debut: n.getStart(source), fin: n.getEnd(), texte: v, forme: 'expression', avant: '', apres: '' } : null;
  }
  return null;
}

/** Chaque élément qui porte un texte à lui : où poser l'attribut (après le nom de sa balise), et ses textes. */
function lesElements(code: string): { readonly ou: number; readonly textes: readonly TexteDuCode[] }[] {
  const source = ts.createSourceFile('ecran.tsx', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const out: { ou: number; textes: TexteDuCode[] }[] = [];
  const visiter = (n: ts.Node): void => {
    if (ts.isJsxElement(n)) {
      const o = n.openingElement;
      const nom = o.tagName.getText(source);
      const textes = nom === 'style' || nom === 'script' ? [] : n.children.map((c) => texteDeLEnfant(c, source)).filter((t): t is TexteDuCode => t !== null);
      const ou = o.typeArguments ? code.indexOf('>', o.typeArguments.end) + 1 : o.tagName.getEnd();
      if (textes.length > 0 && ou > 0) out.push({ ou, textes });
    }
    ts.forEachChild(n, visiter);
  };
  visiter(source);
  return out;
}

/** Les textes d'un fichier, dans l'ordre où il les écrit. */
export const textesDuCode = (code: string): TexteDuCode[] => lesElements(code).flatMap((e) => e.textes).sort((a, b) => a.debut - b.debut);

/** Le code transformé pour le build : chaque élément qui porte un texte reçoit `data-texte`. `null` : rien à poser. */
export function poserLesTextesSitues(code: string, fichier: string): string | null {
  const elements = lesElements(code);
  if (elements.length === 0) return null;
  let out = code;
  for (const e of [...elements].sort((a, b) => b.ou - a.ou)) {
    out = `${out.slice(0, e.ou)} data-texte="${fichier}:${e.textes.map((t) => `${t.debut}-${t.fin}`).join(',')}"${out.slice(e.ou)}`;
  }
  return out;
}

/** Ce que l'aperçu renvoie (`data-texte`), relu : un fichier et ses passages ; `null` si illisible. */
export function lireLaSituation(valeur: string): { readonly fichier: string; readonly passages: readonly { readonly debut: number; readonly fin: number }[] } | null {
  const m = /^(src\/[\w\-./$[\]]+\.tsx):(\d+-\d+(?:,\d+-\d+)*)$/.exec(valeur.trim());
  if (!m || m[1]!.includes('..')) return null;
  return { fichier: m[1]!, passages: m[2]!.split(',').map((p) => { const [debut, fin] = p.split('-').map(Number); return { debut: debut!, fin: fin! }; }) };
}
