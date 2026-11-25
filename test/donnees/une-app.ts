/** Une app à cycle et à table rattachée, pour les essais des données de la console. */
import { lireLeManifeste, type Manifeste } from '@/lib/backend/app/manifeste';

export const NOTES = {
  version: 1, nature: 'app', nom: 'Notes de frais', description: 'Les notes de frais, de la saisie au remboursement.', langues: { principale: 'fr' },
  direction: { couleurs: { fond: '#ffffff', texte: '#111111', accent: '#1f6f5c', surface: '#f5f5f5', bordure: '#e5e5e5' }, polices: { titres: 'Inter', texte: 'Inter' }, rayon: 'doux' },
  organisations: 'une',
  roles: [{ nom: 'responsable', libelle: 'Responsable', obtenu: 'proprietaire' }, { nom: 'salarie', libelle: 'Salarié', obtenu: 'invitation' }],
  tables: [
    { nom: 'notes', libelle: 'Notes', appartenance: 'personnelle', lecture: ['responsable', 'salarie'], ecriture: ['responsable', 'salarie'],
      champs: [
        { nom: 'objet', libelle: 'Objet', type: 'texte', obligatoire: true },
        { nom: 'montant', libelle: 'Montant', type: 'montant', obligatoire: true, bornes: { min: 0 } },
        { nom: 'urgent', libelle: 'Urgent', type: 'booleen' },
        { nom: 'categorie', libelle: 'Catégorie', type: 'choix', valeurs: ['repas', 'train'] },
        { nom: 'justificatif', libelle: 'Justificatif', type: 'fichier' },
        { nom: 'validee_le', libelle: 'Validée le', type: 'date_heure' },
      ],
      cycle: { etats: ['brouillon', 'soumise', 'approuvee'], initial: 'brouillon',
        libelles: { brouillon: 'Brouillon', soumise: 'Soumise', approuvee: 'Approuvée' },
        transitions: [
          { nom: 'soumettre', libelle: 'Soumettre', de: ['brouillon'], vers: 'soumise', par: ['salarie', 'responsable'] },
          { nom: 'approuver', libelle: 'Approuver', de: ['soumise'], vers: 'approuvee', par: ['responsable'], date: 'validee_le' },
        ] } },
    { nom: 'depenses', libelle: 'Dépenses', appartenance: 'rattachee', parent: 'notes', lecture: ['responsable', 'salarie'], ecriture: ['responsable', 'salarie'],
      champs: [{ nom: 'libelle', libelle: 'Libellé', type: 'texte', obligatoire: true }, { nom: 'montant', libelle: 'Montant', type: 'montant', bornes: { min: 0 } }] },
  ],
};

export function lu(json: unknown): Manifeste {
  const r = lireLeManifeste(json);
  if (!r.ok) throw new Error(r.erreurs.join(' ; '));
  return r.manifeste;
}
