/** Les mots de la page des données, en français et en anglais (la langue du navigateur). */
export const MOTS = {
  fr: {
    titre: 'Données', retour: 'Retour au projet', chercher: 'Chercher', ajouter: 'Ajouter une ligne', exporter: 'Exporter en CSV',
    modifier: 'Modifier', supprimer: 'Supprimer', supprimerQ: 'Confirmer la suppression', enregistrer: 'Enregistrer', annuler: 'Annuler',
    aucune: 'Aucune ligne.', lignes: (n: number) => `${n} ligne${n > 1 ? 's' : ''}`, precedentes: '← Précédentes', suivantes: 'Suivantes →',
    etat: 'État', creeeLe: 'Créée le', figee: 'Cette ligne est figée par son état : elle se change par les gestes de l’app.',
    nonEcrit: 'Tenu par la base ou déposé par l’app', verrou: 'figée', choisir: '— choisir —', nouvelle: 'Nouvelle ligne',
    fait: { ajoutee: 'Ligne ajoutée.', modifiee: 'Ligne modifiée.', supprimee: 'Ligne supprimée.' } as Record<string, string>,
    erreurs: { inconnu: 'Projet inconnu.', panne: 'La base n’a pas répondu ; réessayez.', sans_base: 'La base de cette app n’est pas encore posée : demandez à Claude de déclarer ses données.',
      sans_app_json: 'L’app.json de ce projet ne se lit pas.', table: 'Table inconnue.', figee: 'Cette ligne est figée par son état : rien n’a changé.',
      saisie: 'À corriger :', base: 'La base a refusé :' } as Record<string, string>,
    sansTable: 'Cette app ne déclare aucune table.',
  },
  en: {
    titre: 'Data', retour: 'Back to the project', chercher: 'Search', ajouter: 'Add a row', exporter: 'Export as CSV',
    modifier: 'Edit', supprimer: 'Delete', supprimerQ: 'Confirm deletion', enregistrer: 'Save', annuler: 'Cancel',
    aucune: 'No rows.', lignes: (n: number) => `${n} row${n > 1 ? 's' : ''}`, precedentes: '← Previous', suivantes: 'Next →',
    etat: 'State', creeeLe: 'Created', figee: 'This row is locked by its state: it changes through the app’s actions.',
    nonEcrit: 'Kept by the database or uploaded by the app', verrou: 'locked', choisir: '— choose —', nouvelle: 'New row',
    fait: { ajoutee: 'Row added.', modifiee: 'Row updated.', supprimee: 'Row deleted.' } as Record<string, string>,
    erreurs: { inconnu: 'Unknown project.', panne: 'The database did not answer; try again.', sans_base: 'This app’s database is not set up yet: ask Claude to declare its data.',
      sans_app_json: 'This project’s app.json cannot be read.', table: 'Unknown table.', figee: 'This row is locked by its state: nothing changed.',
      saisie: 'To fix:', base: 'The database refused:' } as Record<string, string>,
    sansTable: 'This app declares no table.',
  },
} as const;
