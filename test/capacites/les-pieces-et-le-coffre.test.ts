// Repris de constructor-v13@5bb786e : test/la-piece-jointe-d-une-ligne.test.ts (§ 3) et test/incident-la-piece-restait-apres-sa-ligne.test.ts (§ 2)
/** Les pièces jointes d'une ligne, ce que plus rien ne cite, et le coffre : la base décide, la plateforme range. */
import { describe, expect, it } from 'vitest';
import { cheminDeLaLigne, joindreUnePiece, lireLaCible, ouvrirUnePiece, retirerUnePiece, type DependancesDesPieces } from '@/lib/capacites/les-pieces-jointes';
import { effacerLesPiecesOrphelines, effacerLesPiecesOrphelinesSiDu, type DependancesDesOrphelines } from '@/lib/capacites/les-pieces-orphelines';
import { cheminDansLeSeau, deposerAuCoffre, ouvrirDuCoffre, retirerDuCoffre, viderLeCoffre, type DependancesDuCoffre } from '@/lib/capacites/le-coffre';
import { derriereUnCompte, ouvrirLaPorte, type DependancesDeLaPorte } from '@/lib/capacites/la-porte';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CHEMIN_DE_LA_MIGRATION_DES_PIECES, laMigrationDesPieces } from '@/lib/capacites/le-sql-des-capacites';
import { SQL_DES_PIECES_ORPHELINES } from '@/lib/capacites/les-pieces-orphelines';
import { unManifeste } from '../aides/un-manifeste';

const P = '1b0ac0c1-0000-4000-8000-000000000001';
const AUTRE = '22222222-0000-4000-8000-000000000002';

function deps(base: (fonction: string, args: Record<string, unknown>) => { lu: true; valeur: unknown } | { lu: false; pourquoi: string }) {
  const seau = new Map<string, Uint8Array>();
  const appels: string[] = [];
  const d: DependancesDesPieces = {
    schema: async () => ({ lu: true, valeur: 'app_x' }),
    base: async (_c, _s, f, a) => { appels.push(f); return base(f, a); },
    deposer: async (c, o) => { seau.set(c, o); return null; },
    lire: async (c) => ({ lu: true, valeur: seau.get(c) ?? null }),
    supprimer: async (cs) => { for (const c of cs) seau.delete(c); return null; },
  };
  return { d, seau, appels };
}
const CIBLE = { table: 'depense', id: 'd1', colonne: 'justificatif' };
const FICHIER = { nom: 'taxi.pdf', octets: new Uint8Array([1, 2, 3]), type: 'application/pdf' };

describe('les pièces jointes : sous le chemin de SA ligne, la base décide', () => {
  it('joindre : rangé sous le chemin de la ligne, enregistré par la base ; l’ancienne pièce de la ligne effacée', async () => {
    const ancien = `${cheminDeLaLigne(P, 'depense', 'd1')}ancien`;
    const { d, seau } = deps(() => ({ lu: true, valeur: { ancien: { chemin: ancien, nom: 'vieux.pdf' } } }));
    seau.set(ancien, new Uint8Array([9]));
    const r = await joindreUnePiece(P, 'compte', CIBLE, FICHIER, d);
    expect(r).toEqual({ lu: true, valeur: { nom: 'taxi.pdf', type: 'application/pdf', taille: 3 } });
    expect([...seau.keys()]).toHaveLength(1);
    expect([...seau.keys()][0]!.startsWith(`${P}/depense/d1/`)).toBe(true);
  });
  it('refusée par la base (une ligne d’un autre) : le fichier ne reste pas dans le seau, la raison est dite', async () => {
    const { d, seau } = deps(() => ({ lu: false, pourquoi: 'pièce : ligne introuvable, ou que ce compte ne peut pas modifier (SQLSTATE 42501)' }));
    const r = await joindreUnePiece(P, 'compte', CIBLE, FICHIER, d);
    expect(!r.lu && r.pourquoi).toBe('La pièce jointe : ligne introuvable, ou que ce compte ne peut pas modifier');
    expect(seau.size).toBe(0);
  });
  it('un fichier vide ou trop lourd est refusé avant de rien ranger', async () => {
    const { d, appels } = deps(() => ({ lu: true, valeur: null }));
    expect((await joindreUnePiece(P, 'c', CIBLE, { ...FICHIER, octets: new Uint8Array() }, d)).lu).toBe(false);
    expect((await joindreUnePiece(P, 'c', CIBLE, { ...FICHIER, octets: new Uint8Array(15 * 1024 * 1024 + 1) }, d)).lu).toBe(false);
    expect(appels).toEqual([]);
  });
  it('ouvrir : la pièce d’une ligne que le compte voit ; un chemin d’une AUTRE ligne n’est jamais servi', async () => {
    const chez = `${cheminDeLaLigne(P, 'depense', 'd1')}a1`;
    const ok = deps(() => ({ lu: true, valeur: { chemin: chez, nom: 'taxi.pdf', type: 'application/pdf' } }));
    ok.seau.set(chez, new Uint8Array([7]));
    const r = await ouvrirUnePiece(P, 'compte', CIBLE, ok.d);
    expect(r.lu && [...r.valeur.octets]).toEqual([7]);
    const ailleurs = `${cheminDeLaLigne(P, 'depense', 'd2')}secret`;
    const ko = deps(() => ({ lu: true, valeur: { chemin: ailleurs, nom: 'x' } }));
    ko.seau.set(ailleurs, new Uint8Array([1]));
    const v = await ouvrirUnePiece(P, 'compte', CIBLE, ko.d);
    expect(!v.lu && v.pourquoi).toMatch(/n’appartient pas à cette ligne/);
    expect((await ouvrirUnePiece(P, 'compte', CIBLE, deps(() => ({ lu: true, valeur: null })).d)).lu).toBe(false);
  });
  it('retirer : la base vide la colonne, puis le fichier part', async () => {
    const chez = `${cheminDeLaLigne(P, 'depense', 'd1')}a1`;
    const { d, seau, appels } = deps(() => ({ lu: true, valeur: { ancien: { chemin: chez } } }));
    seau.set(chez, new Uint8Array([7]));
    expect((await retirerUnePiece(P, 'compte', CIBLE, d)).lu).toBe(true);
    expect(appels).toEqual(['piece_joindre']);
    expect(seau.size).toBe(0);
  });
  it('une cible mal nommée est refusée avant tout', () => {
    expect(lireLaCible({ table: 'depense; drop', id: 'd1', colonne: 'justificatif' }).lu).toBe(false);
    expect(lireLaCible({ table: 'depense', id: '../x', colonne: 'justificatif' }).lu).toBe(false);
    expect(lireLaCible(CIBLE).lu).toBe(true);
  });
});

const chemin = (projet: string, id: string) => `${projet}/depense/${id}/${'a'.repeat(24)}`;
function orphelines(orphelins: unknown, illisibles: unknown = [], faute: string | null = null) {
  const effaces: string[] = [];
  const d: DependancesDesOrphelines = {
    orphelins: async () => ({ lu: true, valeur: { orphelins, illisibles } }),
    supprimer: async (cs) => { effaces.push(...cs); return faute; },
  };
  return { d, effaces };
}

describe('ce que plus aucune ligne ne cite part du seau, et rien d’autre', () => {
  it('les orphelines d’un projet sont effacées', async () => {
    const { d, effaces } = orphelines([chemin(P, 'd1'), chemin(P, 'd2')]);
    expect(await effacerLesPiecesOrphelines(P, d, 2)).toEqual({ lu: true, valeur: { effaces: 2, illisibles: [] } });
    expect(effaces).toEqual([chemin(P, 'd1'), chemin(P, 'd2')]);
  });
  it('un chemin d’un AUTRE projet, ou qui n’a pas la forme d’une pièce, n’est jamais effacé', async () => {
    const { d, effaces } = orphelines([chemin(AUTRE, 'x'), `${P}/../secret`, `${P}/depense/d1/court`, 42, chemin(P, 'd3')]);
    const r = await effacerLesPiecesOrphelines(P, d);
    expect(r.lu && r.valeur.effaces).toBe(1);
    expect(effaces).toEqual([chemin(P, 'd3')]);
  });
  it('ce que la base ne dit pas est DIT ; un effacement refusé n’est pas un succès', async () => {
    expect(await effacerLesPiecesOrphelines(null, orphelines([], [AUTRE]).d)).toEqual({ lu: true, valeur: { effaces: 0, illisibles: [AUTRE] } });
    const r = await effacerLesPiecesOrphelines(P, orphelines([chemin(P, 'd1')], [], 'stockage indisponible').d);
    expect(!r.lu && r.pourquoi).toMatch(/non effacé.*stockage indisponible/);
  });
  it('le balayage : au plus toutes les 30 min', async () => {
    const { d } = orphelines([]);
    const t = 1_000_000_000_000;
    expect(await effacerLesPiecesOrphelinesSiDu(d, t)).toBe(true);
    expect(await effacerLesPiecesOrphelinesSiDu(d, t + 60_000)).toBe(false);
    expect(await effacerLesPiecesOrphelinesSiDu(d, t + 31 * 60_000)).toBe(true);
  });
});

const DOSSIER = `sb_${'b'.repeat(32)}`;
function unCoffre(base: (f: string, a: Record<string, unknown>) => { lu: true; valeur: unknown } | { lu: false; pourquoi: string }) {
  const seau = new Map<string, Uint8Array>();
  const appels: string[] = [];
  const d: DependancesDuCoffre = {
    schema: async () => ({ lu: true, valeur: 'app_x' }),
    base: async (_c, _s, f, a) => { appels.push(f); return base(f, a); },
    seau: {
      deposer: async (c, o) => { seau.set(c, o); return null; },
      lire: async (c) => ({ lu: true, valeur: seau.get(c) ?? null }),
      lister: async (p) => ({ lu: true, valeur: [...seau.keys()].filter((k) => k.startsWith(`${p}/`)) }),
      supprimer: async (cs) => { for (const c of cs) seau.delete(c); return null; },
    },
  };
  return { d, seau, appels };
}

describe('le coffre : la base dit l’organisation et décide, le seau range sous elle', () => {
  it('le premier dépôt pose le dossier de l’organisation, puis le fichier rangé dessous, enregistré par la base', async () => {
    let enregistre = '';
    const { d, seau, appels } = unCoffre((f, a) => f === 'coffre_preparer' ? { lu: true, valeur: { organisation: 'o1', dossier: null } }
      : f === 'coffre_poser_le_dossier' ? { lu: true, valeur: a.p_kdrive_id }
      : (enregistre = String(a.p_kdrive_id), { lu: true, valeur: { id: 'f1' } }));
    const r = await deposerAuCoffre(P, 'c', FICHIER, d);
    expect(r).toEqual({ lu: true, valeur: { id: 'f1', nom: 'taxi.pdf', taille: 3 } });
    expect(appels).toEqual(['coffre_preparer', 'coffre_poser_le_dossier', 'coffre_enregistrer']);
    expect([...seau.keys()]).toEqual([cheminDansLeSeau(P, enregistre)]);
  });
  it('refusé par la base (coffre plein) : le fichier repart du seau ; sans coffre : rien n’est rangé', async () => {
    const plein = unCoffre((f) => f === 'coffre_preparer' ? { lu: true, valeur: { organisation: 'o1', dossier: DOSSIER } }
      : { lu: false, pourquoi: 'coffre : la place offerte est pleine (SQLSTATE 53100)' });
    const r = await deposerAuCoffre(P, 'c', FICHIER, plein.d);
    expect(!r.lu && r.pourquoi).toBe('Le coffre : la place offerte est pleine');
    expect(plein.seau.size).toBe(0);
    const sans = unCoffre(() => ({ lu: true, valeur: {} }));
    expect((await deposerAuCoffre(P, 'c', FICHIER, sans.d)).lu).toBe(false);
    expect(sans.seau.size).toBe(0);
  });
  it('ouvrir ne sert qu’un identifiant rangé par la base, dans la forme d’un fichier du coffre', async () => {
    const id = `${DOSSIER}-${'c'.repeat(24)}`;
    const ok = unCoffre(() => ({ lu: true, valeur: { kdriveId: id, nom: 'statuts.pdf', type: 'application/pdf' } }));
    ok.d.seau.deposer(cheminDansLeSeau(P, id)!, new Uint8Array([5]));
    const r = await ouvrirDuCoffre(P, 'c', 'f1', ok.d);
    expect(r.lu && r.valeur.nom).toBe('statuts.pdf');
    expect((await ouvrirDuCoffre(P, 'c', 'f1', unCoffre(() => ({ lu: true, valeur: { kdriveId: '../../autre' } })).d)).lu).toBe(false);
    expect((await ouvrirDuCoffre(P, 'c', 'f1', unCoffre(() => ({ lu: true, valeur: null })).d)).lu).toBe(false);
  });
  it('retirer efface le fichier ; vider efface chaque fichier et le dossier', async () => {
    const id = `${DOSSIER}-${'c'.repeat(24)}`;
    const un = unCoffre(() => ({ lu: true, valeur: { kdriveId: id } }));
    await un.d.seau.deposer(cheminDansLeSeau(P, id)!, new Uint8Array([5]));
    expect((await retirerDuCoffre(P, 'c', 'f1', un.d)).lu).toBe(true);
    expect(un.seau.size).toBe(0);
    const tout = unCoffre(() => ({ lu: true, valeur: { dossier: DOSSIER, fichiers: [id] } }));
    await tout.d.seau.deposer(cheminDansLeSeau(P, id)!, new Uint8Array([5]));
    await tout.d.seau.deposer(`${P}/${DOSSIER}/${'d'.repeat(24)}`, new Uint8Array([6]));
    expect(await viderLeCoffre(P, 'c', tout.d)).toEqual({ lu: true, valeur: { documents: 1 } });
    expect(tout.seau.size).toBe(0);
    const refuse = unCoffre(() => ({ lu: false, pourquoi: 'coffre : vider le coffre est réservé à qui gère l’équipe' }));
    expect((await viderLeCoffre(P, 'c', refuse.d)).lu).toBe(false);
  });
});

describe('la porte des pièces : toujours derrière un compte membre, sans fonction à déclarer', () => {
  const M = unManifeste({ nature: 'app', roles: [{ nom: 'gerant', libelle: 'Gérant', obtenu: 'proprietaire' }],
    tables: [{ nom: 'note', libelle: 'Notes', appartenance: 'personnelle', lecture: ['gerant'], ecriture: ['gerant'], champs: [{ nom: 'objet', libelle: 'Objet', type: 'texte' }] }] });
  const porte = (compte: string | null, membre: boolean): DependancesDeLaPorte => ({
    leManifeste: async () => ({ lu: true, valeur: M }), laPersonne: async () => compte,
    estMembre: async () => ({ lu: true, valeur: membre }), plafond: async () => ({ lu: true, valeur: true }),
  });
  const P_ = { fenetreS: 600, parProjet: 2000, parCompte: 120 };
  it('sans session : 401 ; un compte d’ailleurs : 403 ; un membre : ouverte', async () => {
    expect(derriereUnCompte('pieces')).toBe(true);
    expect((await ouvrirLaPorte(porte(null, false), P, 'pieces', null, P_))).toMatchObject({ ouverte: false, statut: 401 });
    expect((await ouvrirLaPorte(porte('x', false), P, 'pieces', 'jeton', P_))).toMatchObject({ ouverte: false, statut: 403 });
    expect((await ouvrirLaPorte(porte('x', true), P, 'pieces', 'jeton', P_))).toMatchObject({ ouverte: true, compte: 'x' });
  });
  it('le coffre reste une fonction à déclarer', async () => {
    expect((await ouvrirLaPorte(porte('x', true), P, 'coffre', 'jeton', P_))).toMatchObject({ ouverte: false, statut: 404 });
  });
});

it('la migration des pièces est celle que sa source écrit', () => {
  expect(readFileSync(join(__dirname, '../..', CHEMIN_DE_LA_MIGRATION_DES_PIECES), 'utf8')).toBe(laMigrationDesPieces(SQL_DES_PIECES_ORPHELINES));
});
