/**
 * ============================================================================
 * INCIDENT 28/11 — LE JOUR DU DÉPART RESTAIT PRIS, ET LE PLANNING ÉTAIT INTROUVABLE (essai d'Antoine : un hôtel)
 * ============================================================================
 *
 * Un site d'hôtel déclarait bien ses réservations (`periode` exclusive sur la chambre), mais une date seule occupait sa
 * journée entière : la chambre réservée du 10 au 12 restait prise le 12, la base refusait l'arrivée suivante ce
 * jour-là, le site la montrait occupée, et le planning de la console mettait le client le jour de son départ. Le
 * planning, rangé dans « Données » derrière un lien, ne se trouvait pas, et ne permettait pas de prendre un jour.
 * LA RÈGLE, POUR TOUTE APP : un séjour se compte en nuits quand app.json le déclare (`periode.nuits`) ; le jour de la fin
 * se libère, partout (la base, les occupations que lit la page, le planning) ; « Planning » est au menu dès qu'une table
 * occupe des périodes ; une case libre s'ouvre sur une ligne déjà datée.
 *
 * ⚠️ ROUGE AVANT (10822af) : `nuits` n'existait pas, l'arrivée du 12 était refusée, le planning n'était pas au menu.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { lireLeManifeste, type Manifeste } from '@/lib/backend/app/manifeste';
import { sqlDeLaBase } from '@/lib/backend/pipeline/la-base';
import { lesTablesDeLaConsole } from '@/lib/donnees/les-donnees';
import { estLibreLeJour, laLigneDuJour, lePlanning } from '@/lib/donnees/le-planning';
import { leMenu } from '@/app/projets/[id]/la-navigation';
import { laFormeDAppJson } from '@/lib/backend/app/l-exemple-d-app-json';
import { lesReglesDites } from '@/lib/fonctions-de-l-app/les-regles-dites';
import { demarrer, POSTGRES_PRESENT, type UnPostgres } from '../aides/un-postgres';

const HOTEL = {
  version: 1, nature: 'app', nom: 'Hôtel', description: 'Réserver une chambre.', langues: { principale: 'fr' },
  direction: { couleurs: { fond: '#ffffff', texte: '#111111', accent: '#1f6f5c', surface: '#f5f5f5', bordure: '#e5e5e5' }, polices: { titres: 'Inter', texte: 'Inter' }, rayon: 'doux' },
  organisations: 'une', roles: [{ nom: 'gerant', libelle: 'Gérant', obtenu: 'proprietaire' }],
  tables: [
    { nom: 'chambres', libelle: 'Chambres', appartenance: 'organisation', lecture: ['gerant'], ecriture: ['gerant'],
      champs: [{ nom: 'numero', libelle: 'Numéro', type: 'texte', obligatoire: true }] },
    { nom: 'sejours', libelle: 'Séjours', appartenance: 'organisation', lecture: ['gerant'], ecriture: ['gerant'],
      champs: [
        { nom: 'nom', libelle: 'Nom', type: 'texte', obligatoire: true },
        { nom: 'chambre', libelle: 'Chambre', type: 'reference', table: 'chambres', obligatoire: true },
        { nom: 'arrivee', libelle: 'Arrivée', type: 'date', obligatoire: true },
        { nom: 'depart', libelle: 'Départ', type: 'date', obligatoire: true },
      ],
      periode: { debut: 'arrivee', fin: 'depart', libelle: 'nom', exclusive: true, ressource: 'chambre', nuits: true } },
    { nom: 'locations', libelle: 'Locations', appartenance: 'organisation', lecture: ['gerant'], ecriture: ['gerant'],
      champs: [
        { nom: 'nom', libelle: 'Nom', type: 'texte', obligatoire: true },
        { nom: 'du', libelle: 'Du', type: 'date', obligatoire: true },
        { nom: 'au', libelle: 'Au', type: 'date', obligatoire: true },
      ],
      periode: { debut: 'du', fin: 'au', libelle: 'nom', exclusive: true } },
  ],
};

const lu = (json: unknown): Manifeste => {
  const r = lireLeManifeste(json);
  if (!r.ok) throw new Error(r.erreurs.join(' ; '));
  return r.manifeste;
};
const M = lu(HOTEL);
const [, sejours, locations] = lesTablesDeLaConsole(M);

describe('1 — le séjour en nuits, dans la console (pur)', () => {
  it('le planning met le client ses nuits, pas le jour de son départ ; sans `nuits`, une date prend sa journée', () => {
    const p = lePlanning(sejours!, [{ id: 'a', nom: 'Martin', chambre: 'c1', arrivee: '2027-03-02', depart: '2027-03-04' }], '2027-03-01', ['c1']);
    expect(p.rangees[0]!.jours.map((j) => j.length)).toEqual([0, 1, 1, 0, 0, 0, 0]);
    const q = lePlanning(locations!, [{ id: 'b', nom: 'Vélo', du: '2027-03-02', au: '2027-03-04' }], '2027-03-01');
    expect(q.rangees[0]!.jours.map((j) => j.length)).toEqual([0, 1, 1, 1, 0, 0, 0]);
  });
  it('une case libre s’ouvre sur une ligne datée : sa chambre, une nuit ; sans nuits, le jour même', () => {
    expect(laLigneDuJour(sejours!, 'c1', '2027-03-04')).toEqual({ 'pre.chambre': 'c1', 'pre.arrivee': '2027-03-04', 'pre.depart': '2027-03-05' });
    expect(laLigneDuJour(locations!, null, '2027-03-04')).toEqual({ 'pre.du': '2027-03-04', 'pre.au': '2027-03-04' });
    expect(estLibreLeJour([])).toBe(true);
    expect(estLibreLeJour([{ id: 'x', heures: null, ligne: {}, rendue: false }])).toBe(false);
    expect(estLibreLeJour([{ id: 'x', heures: null, ligne: {}, rendue: true }])).toBe(true);
  });
  it('« Planning » est au menu dès qu’une table occupe des périodes, et Claude apprend `nuits`', () => {
    const ecrans = (planning: boolean) => leMenu('fr', { vend: false, planning }).flatMap((r) => r.ecrans.map((e) => e.ecran));
    expect(ecrans(true)).toContain('planning');
    expect(ecrans(false)).not.toContain('planning');
    expect(laFormeDAppJson()).toMatch(/nuits\?: true for a stay counted in nights/);
    expect(lesReglesDites(M, 'fr').find((x) => x.table === 'Séjours')!.regles.at(-1)!.comment).toMatch(/le jour du départ se libère/);
  });
});

const S = 'app_hotel';
const GERANT = '11111111-1111-1111-1111-111111111111';

describe.runIf(POSTGRES_PRESENT)('2 — la base réelle compte les nuits', () => {
  let pg: UnPostgres;
  let c1 = '';
  const sejour = (du: string, au: string, chambre = c1) => pg.comme(GERANT, `insert into ${S}.sejours (nom, chambre, arrivee, depart) values ('Client', '${chambre}', '${du}', '${au}');`);
  const location = (du: string, au: string) => pg.comme(GERANT, `insert into ${S}.locations (nom, du, au) values ('Vélo', '${du}', '${au}');`);

  beforeAll(() => {
    pg = demarrer('vavi-nuits', 55891);
    pg.admin(`insert into auth.users values ('${GERANT}', 'g@a.fr');\ncreate schema ${S};`);
    for (const g of sqlDeLaBase(M, { schema: S, proprietaire: GERANT })) pg.admin(`begin;\nset search_path to '';\n${g.sql}\ncommit;`);
    c1 = pg.comme(GERANT, `insert into ${S}.chambres (numero) values ('101') returning id;`).sortie.split('\n')[0]!;
  });
  afterAll(() => pg?.arreter());

  it('du 10 au 12, puis du 12 au 14 dans la même chambre : accepté ; du 11 au 13 : refusé', () => {
    expect(sejour('2027-01-10', '2027-01-12').ok).toBe(true);
    expect(sejour('2027-01-12', '2027-01-14').ok).toBe(true);
    expect(sejour('2027-01-11', '2027-01-13').sortie).toMatch(/cette période est déjà prise/);
  });
  it('un séjour dure au moins une nuit : un départ le jour de l’arrivée est refusé', () => {
    expect(sejour('2027-02-01', '2027-02-01').ok).toBe(false);
  });
  it('les occupations que lit la page s’arrêtent au matin du départ', () => {
    const o = JSON.parse(pg.comme(GERANT, `select ${S}.sejours_occupations('2027-01-09 00:00+00', '2027-01-11 00:00+00', '${c1}');`).sortie) as { occupations: { debut: string; fin: string }[] };
    expect(o.occupations.length).toBe(1);
    expect(Date.parse(o.occupations[0]!.fin)).toBe(Date.parse('2027-01-12T00:00:00Z'));
  });
  it('sans `nuits`, une date prend sa journée : la location du 10 au 12 tient le 12', () => {
    expect(location('2027-01-10', '2027-01-12').ok).toBe(true);
    expect(location('2027-01-12', '2027-01-14').sortie).toMatch(/cette période est déjà prise/);
  });
});
