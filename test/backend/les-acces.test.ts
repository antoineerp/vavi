/**
 * Qui fait quoi sur une table (`lib/backend/app/les-acces.ts`, refonte du 26/11) :
 *  1. la forme `acces` se traduit en ce que la base lit, un rôle par geste ; les mots de Claude (select, public…) sont lus et dits ;
 *  2. un app.json d'avant, réécrit par vavi dans la forme `acces` puis relu, donne EXACTEMENT la même base, droit pour
 *     droit, sur tout un corpus de formes (appartenances, visiteur, organisations, clients, rattachées, vente, lecture entière) ;
 *  3. un rôle ne prend pas un nom réservé (tous, inscrits, visiteur).
 */
import { describe, expect, it } from 'vitest';
import { lireLeManifeste, type Manifeste } from '@/lib/backend/app/manifeste';
import { sqlDeLaBase } from '@/lib/backend/pipeline/la-base';
import { derive } from '@/squelette/poser';
import { DIRECTION } from '../aides/un-manifeste';

const MOI = 'aaaaaaaa-0000-4000-8000-0000000000a1';
const lire = (x: Record<string, unknown>): Manifeste => {
  const r = lireLeManifeste({ version: 1, nom: 'Essai', description: 'Un essai.', langues: { principale: 'fr' }, direction: DIRECTION, nature: 'app', ...x });
  if (!r.ok) throw new Error(r.erreurs.join(' ; '));
  return r.manifeste;
};
const sql = (m: Manifeste) => sqlDeLaBase(m, { schema: 'app_essai', proprietaire: MOI }).map((g) => g.sql).join('\n');
const relu = (m: Manifeste): Manifeste => {
  const r = lireLeManifeste(JSON.parse(derive('app.json', m)));
  if (!r.ok) throw new Error(r.erreurs.join(' ; '));
  return r.manifeste;
};
const champ = { nom: 'texte', libelle: 'Texte', type: 'texte' };

describe('la forme `acces`', () => {
  it('Yokono : une carte que tous lisent, des réservations que tous envoient et que le restaurateur seul lit', () => {
    const r = lireLeManifeste({ version: 1, nom: 'Yokono', description: 'Un restaurant.', langues: { principale: 'fr' }, direction: DIRECTION, nature: 'site',
      roles: [{ nom: 'proprietaire', libelle: 'Restaurateur', obtenu: 'proprietaire' }],
      tables: [
        { nom: 'plats', libelle: 'Plats', champs: [champ], acces: { lire: ['tous'], creer: ['proprietaire'], modifier: ['proprietaire'], supprimer: ['proprietaire'] } },
        { nom: 'reservations', libelle: 'Réservations', champs: [champ], acces: { select: 'proprietaire', insert: 'public', update: ['proprietaire'], delete: ['proprietaire'] } },
      ] });
    if (!r.ok) throw new Error(r.erreurs.join(' ; '));
    const [plats, resa] = r.manifeste.tables;
    expect(plats).toMatchObject({ appartenance: 'publique', lecture: ['visiteur', 'proprietaire'], creation: ['proprietaire'] });
    expect(resa).toMatchObject({ appartenance: 'personnelle', lecture: ['proprietaire'], creation: ['visiteur', 'proprietaire'], modification: ['proprietaire'] });
    expect(r.repare.join(' | ')).toContain('`acces.select` lu comme `acces.lire`');
    expect(r.repare.join(' | ')).toContain('« public » lu comme `tous`');
    const ecrit = JSON.parse(derive('app.json', r.manifeste));
    expect(ecrit.tables[0]).not.toHaveProperty('lecture');
    expect(ecrit.tables[0].acces).toEqual({ lire: ['tous'], creer: ['proprietaire'], modifier: ['proprietaire'], supprimer: ['proprietaire'], lignes: 'toutes' });
    expect(ecrit.tables[1].acces).toEqual({ lire: ['proprietaire'], creer: ['tous'], modifier: ['proprietaire'], supprimer: ['proprietaire'], lignes: 'siennes' });
  });

  it('chaque geste a ses rôles en base : qui crée ne modifie pas pour autant', () => {
    const m = lire({ roles: [{ nom: 'gerant', libelle: 'Gérant', obtenu: 'proprietaire' }, { nom: 'client', libelle: 'Client', obtenu: 'inscription' }], resultat: 'avis',
      tables: [{ nom: 'avis', libelle: 'Avis', champs: [champ], exemples: [{ texte: 'Bien' }], acces: { lire: ['inscrits'], creer: ['client'], modifier: ['gerant'], supprimer: ['gerant'], lignes: 'toutes' } }] });
    const s = sql(m);
    expect(s).toMatch(/avis_creation on app_essai\.avis for insert to authenticated with check \(owner_id = auth\.uid\(\) and \(\(app_essai\.a_un_role\(array\['client'\]/);
    expect(s).toMatch(/avis_modification on app_essai\.avis for update to authenticated using \(\(\(app_essai\.a_un_role\(array\['gerant'\]/);
  });

  it('personne ne modifie sans compte : `tous` y vaut `inscrits`, et c’est dit', () => {
    const r = lireLeManifeste({ version: 1, nom: 'E', description: 'E.', langues: { principale: 'fr' }, direction: DIRECTION, nature: 'app',
      roles: [{ nom: 'gerant', libelle: 'Gérant', obtenu: 'proprietaire' }],
      tables: [{ nom: 'notes', libelle: 'Notes', champs: [champ], acces: { lire: ['tous'], creer: ['tous'], modifier: ['tous'], supprimer: ['gerant'] } }] });
    if (!r.ok) throw new Error(r.erreurs.join(' ; '));
    expect(r.manifeste.tables[0]?.modification).toEqual(['gerant']);
    expect(r.repare.join(' | ')).toContain('personne ne modifie une ligne sans compte');
  });

  it('un rôle ne s’appelle ni tous, ni inscrits, ni visiteur', () => {
    const r = lireLeManifeste({ version: 1, nom: 'E', description: 'E.', langues: { principale: 'fr' }, direction: DIRECTION, nature: 'app',
      roles: [{ nom: 'tous', libelle: 'Tous', obtenu: 'proprietaire' }], tables: [{ nom: 'a', libelle: 'A', champs: [champ], acces: { lire: ['tous'], creer: [], modifier: [], supprimer: [] } }] });
    expect(r.ok).toBe(false);
  });
});

describe('un app.json d’avant, réécrit dans la forme `acces` puis relu, donne la même base', () => {
  const R = {
    une: [{ nom: 'gerant', libelle: 'Gérant', obtenu: 'proprietaire' }, { nom: 'membre', libelle: 'Membre', obtenu: 'invitation' }, { nom: 'client', libelle: 'Client', obtenu: 'inscription' }],
    plusieurs: [{ nom: 'gerant', libelle: 'Gérant', obtenu: 'proprietaire' }, { nom: 'chef', libelle: 'Chef', obtenu: 'inscription' }, { nom: 'membre', libelle: 'Membre', obtenu: 'invitation' }],
    clients: [{ nom: 'gerant', libelle: 'Gérant', obtenu: 'proprietaire' }, { nom: 'equipier', libelle: 'Équipier', obtenu: 'invitation' }, { nom: 'client', libelle: 'Client', obtenu: 'invitation', client: true }],
  } as const;
  const formes: Array<[string, Record<string, unknown>]> = [];
  for (const organisations of ['une', 'plusieurs', 'clients'] as const) {
    const roles = R[organisations].map((r) => r.nom);
    for (const appartenance of ['personnelle', 'organisation', 'publique'] as const) {
      for (const [lecture, ecriture] of [[roles, [roles[0]]], [[roles[0], roles[1]], roles], [[...roles, 'visiteur'], [roles[0]]], [[roles[0]], ['visiteur', roles[0]]], [[roles[0]], ['visiteur']], [[], [roles[0]]]] as const) {
        formes.push([`${organisations} ${appartenance} lit ${lecture.join(',') || 'personne'} écrit ${ecriture.join(',')}`, { organisations, roles: R[organisations], resultat: 'vitrine',
          tables: [
            { nom: 'vitrine', libelle: 'Vitrine', champs: [champ], appartenance: 'publique', lecture: [...roles, 'visiteur'], ecriture: [roles[0]], exemples: [{ texte: 'Un' }] },
            { nom: 'mere', libelle: 'Mère', champs: [champ], appartenance, lecture, ecriture },
            { nom: 'fille', libelle: 'Fille', champs: [champ], appartenance: 'rattachee', parent: 'mere', lecture, ecriture: ecriture.filter((x) => x !== 'visiteur').length ? ecriture.filter((x) => x !== 'visiteur') : [roles[0]] },
          ] }]);
      }
    }
  }
  formes.push(['lecture entière', { roles: R.une, tables: [{ nom: 'notes', libelle: 'Notes', champs: [champ], appartenance: 'personnelle', lecture: ['gerant', 'membre'], ecriture: ['membre'], lectureEntiere: ['gerant'] }] }]);
  formes.push(['une boutique', { roles: [R.une[0]], fonctions: { panier: true }, vente: { pays: 'FR', devise: 'EUR' },
    tables: [{ nom: 'articles', libelle: 'Articles', champs: [champ, { nom: 'prix', libelle: 'Prix', type: 'montant', obligatoire: true }], appartenance: 'publique', lecture: ['gerant'], ecriture: ['gerant'], vente: { prix: 'prix', libelle: 'texte' } }] }]);

  it.each(formes)('%s', (_nom, x) => {
    let m: Manifeste;
    try { m = lire(x); } catch { return; } // une forme que la grammaire refuse déjà ne compte pas
    const avant = sql(m);
    const apres = relu(m);
    expect(sql(apres)).toBe(avant);
    expect(sql(relu(apres))).toBe(avant);
  });

  it('le corpus a vraiment été lu (l’instrument ne passe pas à vide)', () => {
    const lues = formes.filter(([, x]) => { try { lire(x); return true; } catch { return false; } });
    expect(lues.length).toBeGreaterThan(40);
  });
});
