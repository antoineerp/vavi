/**
 * L'écran « Règles » de la console (Antoine, 27/11) : ce que la base tient, dit en mots, jamais en code.
 * ⚠️ ROUGE AVANT (29e9a89) : le module et l'écran n'existaient pas.
 */
import { describe, expect, it } from 'vitest';
import { lireLeManifeste, type Manifeste } from '@/lib/backend/app/manifeste';
import { lesReglesDites } from '@/lib/fonctions-de-l-app/les-regles-dites';
import { leMenu } from '@/app/projets/[id]/la-navigation';

const APP = {
  version: 1, nature: 'app', nom: 'Frais', description: 'Les frais d’une équipe.', langues: { principale: 'fr' },
  direction: { couleurs: { fond: '#ffffff', texte: '#111111', accent: '#1f6f5c', surface: '#f5f5f5', bordure: '#e5e5e5' }, polices: { titres: 'Inter', texte: 'Inter' }, rayon: 'doux' },
  organisations: 'une',
  roles: [{ nom: 'responsable', libelle: 'Responsable', obtenu: 'proprietaire' }, { nom: 'membre', libelle: 'Membre', obtenu: 'invitation' }],
  tables: [
    { nom: 'depenses', libelle: 'Dépenses', appartenance: 'personnelle', lecture: ['responsable', 'membre'], ecriture: ['responsable', 'membre'],
      champs: [
        { nom: 'objet', libelle: 'Objet', type: 'texte', obligatoire: true },
        { nom: 'montant', libelle: 'Montant', type: 'montant', obligatoire: true, bornes: { min: 0 } },
        { nom: 'le', libelle: 'Date', type: 'date', obligatoire: true },
        { nom: 'categorie', libelle: 'Catégorie', type: 'choix', valeurs: ['repas', 'autre'] },
        { nom: 'justificatif', libelle: 'Justificatif', type: 'fichier' },
      ],
      regles: [
        { nom: 'justifiee', dit: 'Une dépense de plus de 50 € porte son justificatif.', si: [{ champ: 'montant', est: 'superieur', valeur: 50 }], alors: [{ champ: 'justificatif', est: 'rempli' }] },
        { nom: 'passe', dit: 'Pas de date future.', alors: [{ champ: 'le', est: 'au_plus', valeur: 0 }] },
      ],
      uniques: [{ champs: ['objet', 'le'], dit: 'Cette dépense est déjà saisie.' }],
      plafonds: [{ nom: 'mois', dit: '1 000 € par mois au plus.', champ: 'montant', au_plus: 1000, par: ['auteur'], periode: { champ: 'le', sur: 'mois' }, si: [{ champ: 'categorie', est: 'egal', valeur: 'repas' }] }],
      cycle: { etats: ['brouillon', 'validee'], initial: 'brouillon', libelles: { brouillon: 'Brouillon', validee: 'Validée' },
        transitions: [{ nom: 'valider', libelle: 'Valider', de: ['brouillon'], vers: 'validee', par: ['responsable', 'membre'],
          reservee: [{ si: [{ champ: 'montant', est: 'superieur', valeur: 500 }], par: ['responsable'], dit: 'Au-delà de 500 €, seul un responsable valide.' }] }] } },
    { nom: 'notes', libelle: 'Notes', appartenance: 'personnelle', lecture: ['membre'], ecriture: ['membre'], champs: [{ nom: 'texte', libelle: 'Texte', type: 'texte' }] },
  ],
};

const lu = (json: unknown): Manifeste => {
  const r = lireLeManifeste(json);
  if (!r.ok) throw new Error(r.erreurs.join(' ; '));
  return r.manifeste;
};

describe('l’écran Règles', () => {
  it('dit chaque règle de chaque table en mots : la phrase lue par la personne, puis comment elle se lit', () => {
    const dites = lesReglesDites(lu(APP), 'fr');
    expect(dites.map((x) => x.table)).toEqual(['Dépenses']);
    const comments = dites[0]!.regles.map((r) => `${r.titre} | ${r.comment}`.replace(/[\u202f\u00a0]/g, ' '));
    expect(comments).toEqual([
      'Une dépense de plus de 50 € porte son justificatif. | Si montant dépasse 50, alors justificatif est rempli.',
      'Pas de date future. | Toujours : date est au plus aujourd’hui.',
      'Cette dépense est déjà saisie. | Jamais deux lignes avec objet et date pareils, dans une même organisation (sans tenir compte des majuscules).',
      '1 000 € par mois au plus. | La somme de montant ne dépasse pas 1 000, par personne qui écrit, par mois de date, parmi les lignes où catégorie est « repas ».',
      'Au-delà de 500 €, seul un responsable valide. | Le geste « Valider » : quand montant dépasse 500, seul le rôle « Responsable » le fait.',
      'Les limites de montant | Montant n’est jamais sous 0.',
    ]);
  });
  it('en anglais aussi, sans code ni nom de colonne', () => {
    const en = lesReglesDites(lu(APP), 'en')[0]!.regles.map((r) => r.comment).join('\n');
    expect(en).toMatch(/If montant is over 50, then justificatif is filled in\./);
    expect(en).not.toMatch(/categorie|_id|23514/);
  });
  it('est au menu dès que l’app a des tables', () => {
    const ecrans = (donnees: boolean) => leMenu('fr', { vend: false, donnees }).flatMap((r) => r.ecrans.map((e) => e.ecran));
    expect(ecrans(true)).toContain('regles');
    expect(ecrans(false)).not.toContain('regles');
  });
});
