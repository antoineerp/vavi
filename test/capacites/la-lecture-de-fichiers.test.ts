/**
 * INCIDENT 25/11 (essai d'Antoine, « Cap Équipage ») : Claude disait que vavi ne lit ni un PDF ni un Word — la
 * fonction « lecture » n'avait pas de route. Ces fichiers, faits à la main ici, sont lus pour de vrai.
 */
import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { laNatureDuFichier, leTexteDuXmlOffice, lireUnFichier } from '@/lib/capacites/la-lecture-de-fichiers';
import { FONCTIONS_PAS_ENCORE_SERVIES } from '@/squelette/les-types-des-tables';

/** Un PDF minimal d'une page, au texte donné (objets et table des renvois calculés). */
function unPdf(texte: string): Uint8Array {
  const flux = `BT /F1 18 Tf 72 720 Td (${texte}) Tj ET`;
  const objets = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${flux.length} >>\nstream\n${flux}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const positions: number[] = [];
  objets.forEach((o, i) => { positions.push(pdf.length); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objets.length + 1}\n0000000000 65535 f \n${positions.map((p) => `${String(p).padStart(10, '0')} 00000 n \n`).join('')}`;
  pdf += `trailer\n<< /Size ${objets.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}

describe('lire un fichier', () => {
  it('la lecture est servie : elle sort des fonctions que Claude devait faire sans vavi', () => {
    expect(FONCTIONS_PAS_ENCORE_SERVIES as readonly string[]).not.toContain('lecture');
  });

  it('un PDF rend son texte réel', async () => {
    const r = await lireUnFichier(unPdf('Gilet obligatoire a bord'), 'consignes.pdf');
    expect(r).toMatchObject({ lu: true, valeur: { nature: 'pdf' } });
    if (r.lu) expect(r.valeur.texte).toContain('Gilet obligatoire a bord');
  });

  it('un Word (.docx) rend ses paragraphes, entités décodées', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', '<w:document><w:body><w:p><w:r><w:t>Départ à 8 h</w:t></w:r></w:p><w:p><w:r><w:t xml:space="preserve">Ciré &amp; bottes</w:t></w:r></w:p></w:body></w:document>');
    const r = await lireUnFichier(await zip.generateAsync({ type: 'uint8array' }), 'liste.docx');
    expect(r).toEqual({ lu: true, valeur: { texte: 'Départ à 8 h\nCiré & bottes', nature: 'word' } });
  });

  it('un PowerPoint rend ses diapositives dans l’ordre', async () => {
    const zip = new JSZip();
    zip.file('ppt/slides/slide10.xml', '<p:sld><a:p><a:t>Dix</a:t></a:p></p:sld>');
    zip.file('ppt/slides/slide2.xml', '<p:sld><a:p><a:t>Deux</a:t></a:p></p:sld>');
    const r = await lireUnFichier(await zip.generateAsync({ type: 'uint8array' }), 'brief.pptx');
    expect(r).toEqual({ lu: true, valeur: { texte: 'Deux\n\nDix', nature: 'powerpoint' } });
  });

  it('un texte se lit ; un binaire inconnu, un ancien .doc et un Excel sont refusés, nommés, jamais rendus en texte', async () => {
    expect(await lireUnFichier(new TextEncoder().encode('﻿bonjour'), 'a.txt')).toEqual({ lu: true, valeur: { texte: 'bonjour', nature: 'texte' } });
    expect(laNatureDuFichier(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 1]), 'vieux.doc')).toBe('ancien');
    expect(laNatureDuFichier(new Uint8Array([1, 0, 2, 3]), 'x.bin')).toBe('inconnu');
    expect(laNatureDuFichier(new Uint8Array([0x50, 0x4b, 3, 4]), 't.xlsx')).toBe('tableur');
    for (const [o, n] of [[new Uint8Array([1, 0, 2]), 'x.bin'], [new Uint8Array([0xd0, 0xcf, 0x11, 0xe0]), 'v.doc'], [new Uint8Array([0x50, 0x4b, 3, 4]), 't.xlsx']] as const) {
      const r = await lireUnFichier(o, n);
      expect(r.lu).toBe(false);
    }
  });

  it('un PDF renommé en .txt reste un PDF (la signature avant l’extension)', () => {
    expect(laNatureDuFichier(unPdf('x'), 'faux.txt')).toBe('pdf');
    expect(leTexteDuXmlOffice('<w:p><w:t>a&lt;b</w:t></w:p>', 'w:t', 'w:p')).toBe('a<b');
  });
});
