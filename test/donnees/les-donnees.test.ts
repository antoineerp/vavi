/** Ce que la console montre et laisse écrire d'une app, dérivé d'app.json. */
import { describe, expect, it } from 'vitest';
import { enCsv, enTexte, leNomDUneLigne, lesLignesDuTexte, lesTablesDeLaConsole, relireLaSaisie, seModifie } from '@/lib/donnees/les-donnees';
import { NOTES, lu } from './une-app';

const [notes, depenses] = lesTablesDeLaConsole(lu(NOTES));

describe('les tables de la console', () => {
  it('dit les tables d’app.json, leurs libellés, et n’écrit ni fichier ni date posée par un geste', () => {
    expect([notes!.nom, depenses!.nom]).toEqual(['notes', 'depenses']);
    const ecrivables = notes!.colonnes.filter((c) => c.ecrivable).map((c) => c.nom);
    expect(ecrivables).toEqual(['objet', 'montant', 'urgent', 'categorie']);
    expect(notes!.cycle).toEqual({ libelles: { brouillon: 'Brouillon', soumise: 'Soumise', approuvee: 'Approuvée' }, ouverts: ['brouillon'] });
    expect(depenses!.colonnes[0]).toMatchObject({ nom: 'notes_id', type: 'reference', table: 'notes', obligatoire: true, ecrivable: true });
  });
  it('une ligne à cycle ne change que dans ses états ouverts', () => {
    expect(seModifie(notes!, { etat: 'brouillon' })).toBe(true);
    expect(seModifie(notes!, { etat: 'soumise' })).toBe(false);
    expect(seModifie(depenses!, {})).toBe(true);
  });
  it('relit la saisie à son type, refuse ce qui est mal formé en nommant le champ', () => {
    expect(relireLaSaisie(notes!, { objet: ' Train ', montant: '12,5', categorie: 'train' }, true))
      .toEqual({ ok: true, valeurs: { objet: 'Train', montant: 12.5, urgent: false, categorie: 'train' } });
    expect(relireLaSaisie(notes!, { objet: 'Train', montant: '' }, true)).toEqual({ ok: false, champ: 'Montant', pourquoi: 'obligatoire' });
    expect(relireLaSaisie(notes!, { objet: 'Train', montant: 'douze' }, true)).toMatchObject({ ok: false, champ: 'Montant' });
    expect(relireLaSaisie(notes!, { objet: 'Train', montant: '1', categorie: 'avion' }, true)).toMatchObject({ ok: false, champ: 'Catégorie' });
    expect(relireLaSaisie(depenses!, { notes_id: 'pas-un-id', libelle: 'x' }, true)).toMatchObject({ ok: false, champ: 'Notes' });
    // Une modification n'écrit que ce qui est envoyé (la case à cocher, toujours).
    expect(relireLaSaisie(notes!, { montant: '3' }, false)).toEqual({ ok: true, valeurs: { montant: 3, urgent: false } });
    // Rien de ce que la base tient, même envoyé.
    expect(relireLaSaisie(notes!, { objet: 'a', montant: '1', validee_le: '2026-01-01T10:00', justificatif: 'x' }, true))
      .toEqual({ ok: true, valeurs: { objet: 'a', montant: 1, urgent: false, categorie: null } });
  });
  it('lit une ligne : son nom, ses cellules (« — » pour l’absent), son CSV', () => {
    expect(leNomDUneLigne(notes!, { id: 'abcdef12-0000', objet: 'Repas' })).toBe('Repas');
    expect(leNomDUneLigne(notes!, { id: 'abcdef12-0000', objet: '' })).toBe('abcdef12');
    expect(enTexte({ type: 'montant' }, null, 'fr')).toBe('—');
    expect(enTexte({ type: 'booleen' }, true, 'fr')).toBe('oui');
    const csv = enCsv(notes!, [{ id: 'i1', created_at: 't', etat: 'soumise', objet: 'Dîner; "client"', montant: 10 }], 'fr');
    expect(csv.split('\r\n')[0]).toBe('﻿id;créée le;état;Objet;Montant;Urgent;Catégorie;Justificatif;Validée le');
    expect(csv.split('\r\n')[1]).toBe('i1;t;Soumise;"Dîner; ""client""";10;;;;');
  });
});

// 26/11 (« enrichir » la console) : un texte cliqué dans l'aperçu qui est une donnée mène à sa ligne, sans rien deviner.
describe('lesLignesDuTexte', () => {
  const lignes = [{ id: 'a1', objet: 'Repas  client\nDupont', montant: 42 }, { id: 'a2', objet: 'Train Lyon', montant: 42 }];
  it('la ligne dont un champ de texte porte exactement le texte cliqué (espaces repliés)', () => {
    expect(lesLignesDuTexte(' Repas client Dupont ', [{ table: notes!, lignes }])).toEqual([{ table: 'notes', libelle: 'Notes', ligne: 'a1', nom: 'Repas  client\nDupont', champ: 'Objet' }]);
  });
  it('un texte seulement contenu, ou un nombre affiché, ne désigne aucune ligne', () => {
    expect(lesLignesDuTexte('Repas', [{ table: notes!, lignes }])).toEqual([]);
    expect(lesLignesDuTexte('42', [{ table: notes!, lignes }])).toEqual([]);
  });
});
