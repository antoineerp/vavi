/** « Montrer à Claude » (Antoine, 25/11, « comme Lovable ») : la zone cliquée dans l'aperçu devient une phrase précise. */
import { describe, expect, it } from 'vitest';
import { laPhrasePourClaude, leFichierDeLaSource } from '@/lib/contenus/la-phrase-pour-claude';

describe('la phrase pour Claude', () => {
  it('nomme le projet, l’écran, la section, le texte vu, le fichier, puis la demande', () => {
    const p = laPhrasePourClaude({ projet: 'Le café du port', langue: 'fr', demande: ' mets ce titre plus gros ',
      endroit: { chemin: '/carte', titreDeLaPage: 'La carte', section: 'Nos desserts', texte: 'Tarte   fine\naux pommes', source: 'src/pages/carte.tsx:120-138' } });
    expect(p).toBe('Sur mon projet vavi « Le café du port », dans l\'écran « La carte » (/carte), dans la section « Nos desserts » à l\'endroit qui dit « Tarte fine aux pommes » (fichier src/pages/carte.tsx) : mets ce titre plus gros');
  });
  it('une photo se nomme par son nom ; une source illisible ne donne pas de fichier ; en anglais aussi', () => {
    const p = laPhrasePourClaude({ projet: 'Harbour', langue: 'en', demande: 'use a brighter photo', endroit: { chemin: '/', image: 'salle', source: '../../etc/passwd:1-2' } });
    expect(p).toBe('On my vavi project "Harbour", in the page /, on the photo "salle": use a brighter photo');
    expect(leFichierDeLaSource('src/pages/a.tsx:1-4,9-12')).toBe('src/pages/a.tsx');
    expect(leFichierDeLaSource('squelette/x.ts:1-2')).toBeNull();
  });
});
