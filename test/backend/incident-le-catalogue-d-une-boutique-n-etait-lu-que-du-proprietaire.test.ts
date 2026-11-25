/**
 * INCIDENT 25/11 (Antoine, une boutique de bières) : la table qui se vend, publique, déclarée `lecture: ['gerant']` ;
 * le visiteur qui achète voyait « Les bières n'ont pas pu être chargées ». Rouge avant `lesVentesVisibles`, vert après.
 */
import { describe, expect, it } from 'vitest';
import { lireLeManifeste } from '@/lib/backend/app/manifeste';
import { DIRECTION } from '../aides/un-manifeste';

const app = (lecture: string[], appartenance = 'publique') => ({
  version: 1, nom: 'Boutique', description: 'Une boutique.', langues: { principale: 'fr' }, direction: DIRECTION,
  nature: 'boutique', fonctions: { panier: true },
  roles: [{ nom: 'gerant', libelle: 'Gérant', obtenu: 'proprietaire' }, { nom: 'client', libelle: 'Client', obtenu: 'inscription' }],
  tables: [{ nom: 'produits', libelle: 'Produits', appartenance, lecture, ecriture: ['gerant'],
    champs: [{ nom: 'nom', libelle: 'Nom', type: 'texte', obligatoire: true }, { nom: 'prix', libelle: 'Prix', type: 'montant', obligatoire: true }], vente: { prix: 'prix', libelle: 'nom' } }],
  vente: { pays: 'FR', devise: 'EUR', livraison: { pays: ['FR'], prix: 5, offerteDes: 100 } },
});

describe('le catalogue d’une boutique', () => {
  it('ce qui se vend sur une table publique se lit du visiteur, et la réparation est dite', () => {
    const r = lireLeManifeste(app(['gerant']));
    if (!r.ok) throw new Error(r.erreurs.join(' ; '));
    expect(r.manifeste.tables[0]!.lecture).toContain('visiteur');
    expect(r.repare.join(' ')).toContain('produits se vend');
  });
  it('une lecture qui nomme déjà le visiteur n’est pas touchée', () => {
    const r = lireLeManifeste(app(['visiteur', 'gerant']));
    expect(r.ok).toBe(true);
    expect(r.repare.some((x) => x.includes('se vend'))).toBe(false);
  });
});
