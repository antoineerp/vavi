/** L'import d'un CSV dans une table : séparateur deviné, colonnes reconnues par nom ou libellé, chaque ligne relue, une ligne fausse refuse tout. */
import { describe, expect, it } from 'vitest';
import { enCsv, lesTablesDeLaConsole } from '@/lib/donnees/les-donnees';
import { lesLignesAImporter, lireUnCsv, LIGNES_MAX_IMPORTEES } from '@/lib/donnees/l-import';
import { NOTES, lu } from './une-app';

const [notes] = lesTablesDeLaConsole(lu(NOTES));

describe('l’import d’un CSV', () => {
  it('lit les cellules : guillemets doublés, retours à la ligne cités, séparateur deviné', () => {
    expect(lireUnCsv('﻿a;b\r\n"x; ""y""";2\n\n')).toEqual([['a', 'b'], ['x; "y"', '2']]);
    expect(lireUnCsv('a,b\n"une\nligne",3')).toEqual([['a', 'b'], ['une\nligne', '3']]);
    expect(lireUnCsv('a\tb\n1\t2')).toEqual([['a', 'b'], ['1', '2']]);
  });
  it('reconnaît les colonnes par nom ou libellé (accents et casse ignorés), relit chaque valeur, dit les colonnes ignorées', () => {
    const r = lesLignesAImporter(notes!, 'objet;MONTANT;Catégorie;urgent;id\nDîner;12,50;repas;oui;x\nTrain;30;train;;y', 'fr');
    expect(r).toEqual({ ok: true, ignorees: ['id'], lignes: [
      { objet: 'Dîner', montant: 12.5, categorie: 'repas', urgent: true },
      { objet: 'Train', montant: 30, categorie: 'train', urgent: false },
    ] });
  });
  it('une seule ligne fausse refuse tout l’import, sa ligne et son champ nommés', () => {
    expect(lesLignesAImporter(notes!, 'Objet;Montant\nDîner;12\nTaxi;beaucoup', 'fr')).toEqual({ ok: false, pourquoi: 'ligne 3, Montant : un nombre' });
    expect(lesLignesAImporter(notes!, 'Objet;Montant;Catégorie\nDîner;12;avion', 'fr')).toMatchObject({ ok: false, pourquoi: expect.stringContaining('ligne 2, Catégorie') });
    expect(lesLignesAImporter(notes!, 'Montant\n12', 'fr')).toMatchObject({ ok: false, pourquoi: 'ligne 2, Objet : obligatoire' });
    expect(lesLignesAImporter(notes!, 'quoi;qui\n1;2', 'fr')).toMatchObject({ ok: false, pourquoi: expect.stringContaining('aucun titre') });
    expect(lesLignesAImporter(notes!, 'Objet', 'fr').ok).toBe(false);
    expect(lesLignesAImporter(notes!, `Objet;Montant\n${'a;1\n'.repeat(LIGNES_MAX_IMPORTEES + 1)}`, 'fr').ok).toBe(false);
  });
  it('un export de la console se réimporte tel quel', () => {
    const csv = enCsv(notes!, [{ id: 'i1', created_at: 't', etat: 'brouillon', objet: 'Dîner; "client"', montant: 10, urgent: true, categorie: 'repas' }], 'fr');
    const r = lesLignesAImporter(notes!, csv, 'fr');
    expect(r.ok && r.lignes[0]).toMatchObject({ objet: 'Dîner; "client"', montant: 10, urgent: true, categorie: 'repas' });
  });
  it('l’export ne livre jamais une formule au tableur, et garde un nombre négatif', () => {
    const csv = enCsv(notes!, [{ id: 'i1', created_at: 't', etat: 'brouillon', objet: '=HYPERLINK("http://x")', montant: -3 }], 'fr');
    expect(csv.split('\r\n')[1]).toBe(`i1;t;Brouillon;"'=HYPERLINK(""http://x"")";-3;;;;`);
  });
});
