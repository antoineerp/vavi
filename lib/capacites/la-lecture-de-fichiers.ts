// Repris de constructor-v13@32d18f3 : lib/file/extract-text.ts (le texte d'un .docx ou d'un .pptx lu dans son XML, le
// refus nommé d'un binaire inconnu, jamais décodé en « texte ») et app/api/file/[projectId]/parse/route.ts (10 Mo, 422
// avec le motif réel). Le PDF passe par `unpdf` (pdf.js sans worker) au lieu de `pdf-parse`, dont le worker se perdait
// une fois la route empaquetée.
/**
 * LA LECTURE D'UN FICHIER — `capacites.lecture.lire` (`file/<projet>/parse`) : le texte réel d'un PDF, d'un Word (.docx),
 * d'un PowerPoint (.pptx), d'un CSV ou d'un fichier texte que la personne choisit dans l'app. La nature se décide par la
 * signature des octets d'abord, puis l'extension ; un format qu'on ne sait pas lire est REFUSÉ, nommé, jamais rendu en
 * texte illisible. Un tableur Excel se lit dans la page (`read-excel-file/browser`).
 *
 * Ce qu'il remplace (interdit 9) : « lecture » dans les fonctions pas encore servies ; Claude disait à la personne que
 * vavi ne lit pas un PDF ni un Word (essai d'Antoine du 25/11).
 */
export type Issue<T> = { readonly lu: true; readonly valeur: T } | { readonly lu: false; readonly pourquoi: string };
export type Nature = 'pdf' | 'word' | 'powerpoint' | 'csv' | 'texte' | 'tableur' | 'ancien' | 'inconnu';
export interface TexteLu { readonly texte: string; readonly nature: Nature }

export const TAILLE_MAX_A_LIRE = 10 * 1024 * 1024;
/** Le texte rendu, au plus (ce qu'une page peut garder et envoyer à l'IA). */
export const CARACTERES_MAX_LUS = 2_000_000;

const extension = (nom: string): string => (/\.([a-z0-9]{1,8})$/i.exec(nom)?.[1] ?? '').toLowerCase();
const commencePar = (o: Uint8Array, ...octets: number[]): boolean => octets.every((b, i) => o[i] === b);

/** La nature d'un fichier : la signature d'abord (un PDF renommé .txt reste un PDF), puis l'extension. PURE. */
export function laNatureDuFichier(octets: Uint8Array, nom: string): Nature {
  const ext = extension(nom);
  if (commencePar(octets, 0x25, 0x50, 0x44, 0x46)) return 'pdf';
  if (commencePar(octets, 0x50, 0x4b, 0x03, 0x04)) return ext === 'pptx' ? 'powerpoint' : ext === 'xlsx' ? 'tableur' : ext === 'docx' ? 'word' : 'inconnu';
  if (commencePar(octets, 0xd0, 0xcf, 0x11, 0xe0)) return 'ancien';
  if (ext === 'csv' || ext === 'tsv') return 'csv';
  // Un fichier texte n'a pas d'octet nul dans ses premiers kilo-octets.
  return octets.subarray(0, 8000).includes(0) ? 'inconnu' : 'texte';
}

/** Le texte d'un XML Office (`<w:t>` d'un Word, `<a:t>` d'un PowerPoint), un paragraphe par ligne. PURE. */
export function leTexteDuXmlOffice(xml: string, balise: 'w:t' | 'a:t', paragraphe: 'w:p' | 'a:p'): string {
  const re = new RegExp(`<${balise}(?:\\s[^>]*)?>([\\s\\S]*?)</${balise}>`, 'g');
  return xml.split(`</${paragraphe}>`).map((p) => [...p.matchAll(re)].map((m) => m[1]).join('')).filter((l) => l.length > 0).join('\n')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'").replace(/&amp;/g, '&').trim();
}

const REFUS: Partial<Record<Nature, string>> = {
  tableur: 'un fichier Excel se lit dans la page (`read-excel-file/browser`)',
  ancien: 'ancien format Office (.doc, .ppt, .xls) : enregistrez-le en .docx, .pptx, .xlsx ou en PDF',
  inconnu: 'ce fichier n’est ni un PDF, ni un Word (.docx), ni un PowerPoint (.pptx), ni un CSV, ni un texte',
};

/** Le texte réel du fichier, ou le motif qui l'empêche (dit à la personne, en français comme les autres refus des capacités). */
export async function lireUnFichier(octets: Uint8Array, nom: string): Promise<Issue<TexteLu>> {
  if (octets.byteLength > TAILLE_MAX_A_LIRE) return { lu: false, pourquoi: 'le fichier dépasse 10 Mo' };
  const nature = laNatureDuFichier(octets, nom);
  const refus = REFUS[nature];
  if (refus) return { lu: false, pourquoi: refus };
  try {
    let texte: string;
    if (nature === 'pdf') {
      const { extractText, getDocumentProxy } = await import('unpdf');
      const pdf = await getDocumentProxy(new Uint8Array(octets));
      const r = await extractText(pdf, { mergePages: false });
      texte = (r.text as readonly string[]).map((p) => p.trim()).filter(Boolean).join('\n\n');
    } else if (nature === 'word' || nature === 'powerpoint') {
      const JSZip = (await import('jszip')).default;
      const zip = await JSZip.loadAsync(octets);
      const parties = nature === 'word' ? ['word/document.xml']
        : Object.keys(zip.files).filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p)).sort((a, b) => Number(/\d+/.exec(a)![0]) - Number(/\d+/.exec(b)![0]));
      if (parties.length === 0 || !zip.file(parties[0]!)) return { lu: false, pourquoi: `ce fichier ${nature === 'word' ? 'Word' : 'PowerPoint'} est abîmé` };
      const lus = await Promise.all(parties.map(async (p) => leTexteDuXmlOffice(await zip.file(p)!.async('string'), nature === 'word' ? 'w:t' : 'a:t', nature === 'word' ? 'w:p' : 'a:p')));
      texte = lus.filter(Boolean).join('\n\n');
    } else {
      texte = new TextDecoder('utf-8').decode(octets).replace(/^﻿/, '');
    }
    if (!texte.trim()) return { lu: false, pourquoi: nature === 'pdf' ? 'aucun texte dans ce PDF (un scan, ou des images seules)' : 'aucun texte dans ce fichier' };
    return { lu: true, valeur: { texte: texte.slice(0, CARACTERES_MAX_LUS), nature } };
  } catch (e) {
    return { lu: false, pourquoi: `le fichier n’a pas pu être lu (${String((e as Error)?.message ?? e).slice(0, 200)})` };
  }
}
