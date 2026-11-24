// Repris de constructor-v13@5bb786e : test/generateur-v2/les-liens-des-exemples.test.ts
/**
 * Ce qui classe une ligne la désigne par une référence facultative, et un cumul la totalise par ce lien. Une app de
 * dépenses le montrait : la dépense était « rattachée » à sa catégorie (obligatoire, effacée avec elle) et doublée d'un
 * champ référence ; ses exemples, ignorés sans le dire, laissaient le tableau de bord à zéro, et leurs dates de l'an
 * passé ne tombaient dans aucune période.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { lireLeManifeste, relireUnManifesteLivre, type Manifeste } from '@/lib/backend/app/manifeste';
import { sqlDeLaBase } from '@/lib/backend/pipeline/la-base';
import { demarrer, POSTGRES_PRESENT, type UnPostgres } from '../aides/un-postgres';

const CATEGORIES = {
  nom: 'categories', libelle: 'Catégories', appartenance: 'personnelle', lecture: ['moi', 'membre'], ecriture: ['moi', 'membre'], identite: ['nom'],
  champs: [{ nom: 'nom', libelle: 'Nom', type: 'texte', obligatoire: true }, { nom: 'budget', libelle: 'Budget', type: 'montant' },
    { nom: 'total', libelle: 'Total', type: 'montant', cumul: { table: 'depenses', champ: 'montant' } }],
  exemples: [{ nom: 'Courses', budget: 400 }, { nom: 'Loisirs', budget: 150 }],
};
const DEPENSES = {
  nom: 'depenses', libelle: 'Dépenses', appartenance: 'personnelle', lecture: ['moi', 'membre'], ecriture: ['moi', 'membre'],
  champs: [{ nom: 'libelle', libelle: 'Libellé', type: 'texte', obligatoire: true }, { nom: 'montant', libelle: 'Montant', type: 'montant', obligatoire: true },
    { nom: 'date', libelle: 'Date', type: 'date', obligatoire: true }, { nom: 'categorie', libelle: 'Catégorie', type: 'reference', table: 'categories' }],
  exemples: [{ libelle: 'Marché', montant: 30, date: -2, categorie: 'Courses' }, { libelle: 'Cinéma', montant: 12, date: 0, categorie: 'Loisirs' },
    { libelle: 'Divers', montant: 5, date: -1, categorie: 'Inconnue' }],
};
const REPARTIS = [
  { nom: 'par_categorie', libelle: 'Ce mois, par catégorie', table: 'depenses', calcul: 'somme', champ: 'montant', periode: { champ: 'date', unite: 'mois' },
    par: { champ: 'categorie', objectif: 'budget' } },
  { nom: 'par_semaine', libelle: 'Semaine par semaine', table: 'depenses', calcul: 'somme', champ: 'montant', par: { date: 'date', unite: 'semaine', nombre: 3 } },
];
const app = (tables: unknown[], indicateurs: unknown[] = []) => ({ indicateurs,
  version: 1, nature: 'app', nom: 'Dépenses', description: 'Mes dépenses.', langues: { principale: 'fr' },
  direction: { couleurs: { fond: '#ffffff', texte: '#111111', accent: '#1f6f5c', surface: '#f5f5f5', bordure: '#e5e5e5' }, polices: { titres: 'Inter', texte: 'Inter' }, rayon: 'doux' },
  roles: [{ nom: 'moi', libelle: 'Moi', obtenu: 'proprietaire' }, { nom: 'membre', libelle: 'Membre', obtenu: 'inscription' }], tables, resultat: 'categories',
});
// Une app livrée avant ces règles : la dépense rattachée, doublée d'une référence, ses exemples sans leur mère.
const LIVREE = app([{ ...CATEGORIES, champs: CATEGORIES.champs.filter((c) => c.nom !== 'total') },
  { ...DEPENSES, appartenance: 'rattachee', parent: 'categories', exemples: [{ libelle: 'Marché', montant: 30, date: '2025-03-01' }] }]);
const lu = (x: unknown) => { const r = lireLeManifeste(x); if (!r.ok) throw new Error(r.erreurs.join(' ; ')); return r; };

describe('les liens lus au cadrage', () => {
  it('une app déjà livrée se relit telle quelle : sa référence reste, sous le code qui l’écrit', () => {
    const m = relireUnManifesteLivre(LIVREE)!;
    expect(m.tables[1]!.champs.map((c) => c.nom)).toContain('categorie');
    expect(lu(LIVREE).manifeste.tables[1]!.champs.map((c) => c.nom)).not.toContain('categorie');
  });

  it('un cumul se lit par une référence ; un exemple qui nomme une ligne absente perd ce lien, et c’est dit', () => {
    const r = lu(app([CATEGORIES, DEPENSES]));
    expect(r.repare).toEqual(['la table depenses, exemple 3 : « Inconnue » ne nomme aucun exemple de categories, le lien est retiré']);
    expect(r.manifeste.tables[1]!.exemples[2]).toEqual({ libelle: 'Divers', montant: 5, date: -1 });
  });

  it('une table rattachée ne double pas sa mère par une référence ; un exemple sans sa mère est retiré', () => {
    const rattachee = { ...DEPENSES, appartenance: 'rattachee', parent: 'categories',
      exemples: [{ libelle: 'Marché', montant: 30, date: -2, categories_id: 'Courses', categorie: 'Courses' }, { libelle: 'Divers', montant: 5, date: -1 }] };
    const r = lu(app([CATEGORIES, rattachee]));
    expect(r.repare).toEqual([
      'depenses.categorie retiré : la table est rattachée à categories, qu’elle désigne déjà',
      'la table depenses, exemple 2 retiré : il ne nomme aucune ligne de categories, et ce lien est obligatoire',
    ]);
    expect(r.manifeste.tables[1]!.champs.map((c) => c.nom)).toEqual(['libelle', 'montant', 'date']);
    expect(r.manifeste.tables[1]!.exemples).toHaveLength(1);
  });

  it('un indicateur se répartit par un champ ou dans le temps, pas les deux ; son objectif est un chiffre de la ligne désignée', () => {
    const avec = (par: unknown) => { const r = lireLeManifeste(app([CATEGORIES, DEPENSES], [{ ...REPARTIS[0], par }])); return r.ok ? [] : r.erreurs; };
    expect(avec({ champ: 'categorie', date: 'date', unite: 'mois' })).toEqual(['l’indicateur par_categorie : il se répartit par un `champ`, ou dans le temps par une `date` et une `unite`']);
    expect(avec({ champ: 'libelle' })).toEqual(['l’indicateur par_categorie : libelle n’est pas un champ choix, booleen, reference de depenses']);
    expect(avec({ champ: 'categorie', objectif: 'nom' })).toEqual(['l’indicateur par_categorie : l’objectif est un champ chiffré de la table que `categorie` désigne']);
  });

  it('un cumul sur une table qui ne désigne pas la ligne est refusé, avec ce qui le lèverait', () => {
    const sansLien = { ...DEPENSES, champs: DEPENSES.champs.filter((c) => c.nom !== 'categorie'), exemples: [] };
    const r = lireLeManifeste(app([CATEGORIES, sansLien]));
    expect(r.ok ? [] : r.erreurs).toContain('categories.total : depenses ne désigne pas categories (rattachée à elle, ou une référence nommée par `par`)');
  });
});

const MOI = 'aaaaaaaa-0000-4000-8000-00000000000a';
const AUTRE = 'bbbbbbbb-0000-4000-8000-00000000000b';

describe.runIf(POSTGRES_PRESENT)('les exemples liés et le cumul par une référence, sur un PostgreSQL réel', () => {
  let pg: UnPostgres;
  let m: Manifeste;
  const S = 'app_liens';
  beforeAll(() => {
    pg = demarrer('voie-d-les-liens', 55742);
    pg.admin(`insert into auth.users values ('${MOI}', 'moi@f.fr'), ('${AUTRE}', 'autre@f.fr');`);
    m = lu(app([CATEGORIES, DEPENSES], REPARTIS)).manifeste;
    pg.admin(`create schema ${S};`);
    for (const g of sqlDeLaBase(m, { schema: S, proprietaire: MOI })) pg.admin(`begin;\nset search_path to '';\n${g.sql}\ncommit;`);
    pg.comme(AUTRE, `select ${S}.rejoindre();`);
  }, 60_000);
  afterAll(() => pg?.arreter());

  it('les exemples sont posés, liés à leur catégorie, datés de cette semaine ; le cumul les compte', () => {
    expect(pg.admin(`select string_agg(d.libelle || ':' || coalesce(c.nom, '-'), ',' order by d.libelle) from ${S}.depenses d left join ${S}.categories c on c.id = d.categorie;`))
      .toBe('Cinéma:Loisirs,Divers:-,Marché:Courses');
    expect(pg.admin(`select count(*) from ${S}.depenses where date >= current_date - 2;`)).toBe('3');
    expect(pg.admin(`select (current_date + 1)::timestamptz + interval '9 hours' = ${'(date_trunc(\'day\', now()) + 1.375 * interval \'1 day\')'};`)).toBe('t');
    expect(pg.admin(`select string_agg(nom || '=' || total, ',' order by nom) from ${S}.categories;`)).toBe('Courses=30.00,Loisirs=12.00');
  });

  it('un indicateur réparti : chaque catégorie avec sa dépense du mois et son budget ; les dernières semaines, la plus récente en dernier', () => {
    const v = JSON.parse(pg.comme(MOI, `select ${S}.analyser('{}');`).sortie) as Record<string, Array<Record<string, unknown>>>;
    expect(v.par_categorie!.map((x) => [x.libelle, x.valeur, x.objectif])).toEqual([['Courses', 30, 400], ['Loisirs', 12, 150]]);
    expect(v.par_semaine).toHaveLength(3);
    expect(v.par_semaine!.reduce((a, x) => a + Number(x.valeur), 0)).toBeGreaterThanOrEqual(12);
    expect(JSON.parse(pg.comme(AUTRE, `select ${S}.analyser('{}');`).sortie).par_categorie).toEqual([]);
  });

  it('effacer une catégorie garde ses dépenses ; une dépense ne se range pas dans la catégorie d’un autre', () => {
    const loisirs = pg.admin(`select id from ${S}.categories where nom = 'Loisirs';`);
    expect(pg.comme(AUTRE, `insert into ${S}.depenses (libelle, montant, date, categorie) values ('Intrus', 999, current_date, '${loisirs}');`).ok).toBe(false);
    expect(pg.admin(`select total from ${S}.categories where nom = 'Loisirs';`)).toBe('12.00');
    expect(pg.comme(MOI, `delete from ${S}.categories where nom = 'Loisirs';`).ok).toBe(true);
    expect(pg.admin(`select count(*) from ${S}.depenses where libelle = 'Cinéma' and categorie is null;`)).toBe('1');
  });

  it('une app livrée avant ces règles se repose : ses exemples sans mère ne se posent pas, sa référence s’écrit encore', () => {
    pg.admin('create schema app_livree;');
    for (const g of sqlDeLaBase(relireUnManifesteLivre(LIVREE)!, { schema: 'app_livree', proprietaire: MOI })) {
      expect(pg.admin(`begin;\nset search_path to '';\n${g.sql}\ncommit;`)).not.toMatch(/ERROR/);
    }
    expect(pg.admin('select count(*) from app_livree.depenses;')).toBe('0');
    const courses = pg.admin(`select id from app_livree.categories where nom = 'Courses';`);
    expect(pg.comme(MOI, `insert into app_livree.depenses (libelle, montant, date, categories_id, categorie) values ('Pain', 2, current_date, '${courses}', '${courses}');`).ok).toBe(true);
  });
});
