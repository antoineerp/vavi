/**
 * Revue du 26/11 (Antoine : « des erreurs récurrentes ») : ce que Claude écrit spontanément pour app.json, et que la
 * grammaire refusait alors que le sens ne fait aucun doute, est relu et dit (`lireCeQueClaudeEnvoie`). Chaque cas
 * rougit sur le code d'avant (lu par `lireLeManifeste` seul, il est refusé).
 */
import { describe, expect, it } from 'vitest';
import { lireCeQueClaudeEnvoie, lireLeManifeste } from '@/lib/backend/app/manifeste';
import { DIRECTION } from '../aides/un-manifeste';

const champ = { nom: 'nom', libelle: 'Nom', type: 'texte', obligatoire: true };
const devis = { nom: 'devis', libelle: 'Devis', champs: [champ], acces: { lire: ['proprietaire'], creer: ['tous'], modifier: ['proprietaire'], supprimer: ['proprietaire'] } };
const base = { version: 1, nature: 'site', nom: 'Scierie', description: 'Un site.', langues: { principale: 'fr' }, direction: DIRECTION, organisations: 'une',
  roles: [{ nom: 'proprietaire', libelle: 'Gérant', obtenu: 'proprietaire' }], tables: [devis] };

const CAS: Array<[string, Record<string, unknown>, string]> = [
  ['des rôles en chaînes', { roles: ['proprietaire'] }, 'le rôle « proprietaire » lu comme'],
  ['aucun rôle, une table qui reçoit des visiteurs', { roles: [] }, '`proprietaire` ajouté'],
  ['owner, anon, read/insert', { roles: [], tables: [{ ...devis, acces: { read: 'owner', insert: ['anon'], update: ['owner'], delete: ['owner'] } }] }, 'lu comme le rôle du propriétaire'],
  ['un type email', { tables: [{ ...devis, champs: [champ, { nom: 'email', libelle: 'E-mail', type: 'email', obligatoire: true }] }] }, '« email » lu comme `texte`'],
  ['une police hors liste', { direction: { ...DIRECTION, polices: { titres: 'Merriweather', texte: 'Roboto' } } }, 'Fraunces à la place'],
  ['un nom de table en mots', { tables: [{ ...devis, nom: 'Demandes de devis' }] }, 'nommée `demandes_de_devis`'],
  ['un champ sans libellé, nommé en mots', { tables: [{ ...devis, champs: [{ nom: 'Téléphone', type: 'phone' }] }] }, 'nommé `telephone`'],
  ['langues en chaîne', { langues: 'fr' }, '`langues` lu comme'],
  ['une demande en phrase', { demandes: ['fais un site'] }, 'une phrase seule'],
  ['un choix sans valeurs', { tables: [{ ...devis, champs: [champ, { nom: 'genre', libelle: 'G', type: 'select', obligatoire: true }] }] }, 'un choix sans valeurs devient un `texte`'],
];

describe('les formes que Claude écrit, relues au lieu d’être refusées', () => {
  for (const [nom, x, dit] of CAS) {
    it(nom, () => {
      const j = { ...base, ...x };
      expect(lireLeManifeste(j).ok).toBe(false);
      const r = lireCeQueClaudeEnvoie(j);
      if (!r.ok) throw new Error(r.erreurs.join(' | '));
      expect(r.repare.join(' | ')).toContain(dit);
    });
  }
  it('un site sans compte reste sans compte', () => {
    const r = lireCeQueClaudeEnvoie({ ...base, roles: [], tables: [] });
    expect(r.ok && r.manifeste.roles).toEqual([]);
  });
  it('une couleur nommée reste refusée : son sens n’est pas sûr', () => {
    expect(lireCeQueClaudeEnvoie({ ...base, direction: { ...DIRECTION, couleurs: { ...DIRECTION.couleurs, accent: 'green' } } }).ok).toBe(false);
  });
});
