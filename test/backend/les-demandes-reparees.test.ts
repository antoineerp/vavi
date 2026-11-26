/**
 * INCIDENT 26/11 (essai d'Antoine, « fais page hello ») : `demandes: [{ passage, tenuePar: ["Accueil"] }]` sur un site
 * sans écran déclaré faisait refuser tout app.json. Un nom de `tenuePar` ne décide rien de la base : il est relu
 * (le titre d'un écran) ou retiré, et c'est dit (`lesDemandesReparees`).
 */
import { describe, expect, it } from 'vitest';
import { lireLeManifeste } from '@/lib/backend/app/manifeste';
import { DIRECTION } from '../aides/un-manifeste';

const base = { version: 1, nom: 'Hello', description: 'Une page qui dit bonjour.', langues: { principale: 'fr' }, direction: DIRECTION,
  organisations: 'une', roles: [{ nom: 'proprietaire', libelle: 'Propriétaire', obtenu: 'proprietaire' }], tables: [] };

describe('les demandes réparées', () => {
  it('un site : « Accueil », qui ne nomme rien, est retiré avec sa demande, et l’app.json est accepté', () => {
    const r = lireLeManifeste({ ...base, nature: 'site', demandes: [{ passage: 'fais page hello', tenuePar: ['Accueil'] }] });
    if (!r.ok) throw new Error(r.erreurs.join(' | '));
    expect(r.manifeste.demandes).toEqual([]);
    expect(r.repare.join(' | ')).toContain('« Accueil » ne nomme aucun écran');
  });

  it('une app : le titre d’un écran est lu comme cet écran', () => {
    const r = lireLeManifeste({ ...base, nature: 'app',
      tables: [{ nom: 'notes', libelle: 'Notes', champs: [{ nom: 'nom', libelle: 'Nom', type: 'texte', obligatoire: true }], acces: { lire: ['proprietaire'], creer: ['proprietaire'], modifier: ['proprietaire'], supprimer: ['proprietaire'] } }],
      ecrans: [{ nom: 'accueil', titre: 'Accueil', pour: ['proprietaire'], montre: ['notes'] }],
      demandes: [{ passage: 'une page d’accueil', tenuePar: ['Accueil'] }] });
    if (!r.ok) throw new Error(r.erreurs.join(' | '));
    expect(r.manifeste.demandes[0]!.tenuePar).toEqual(['accueil']);
    expect(r.repare.join(' | ')).toContain('lu comme l’écran accueil');
  });
});
