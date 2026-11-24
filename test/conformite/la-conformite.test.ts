/** Le registre tiré d'app.json, le lien d'effacement signé, la demande et la confirmation, la migration et sa source. */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { leRegistre } from '@/lib/conformite/le-registre';
import { CHEMIN_DE_LA_MIGRATION_DE_LA_CONFORMITE, laMigrationDeLaConformite } from '@/lib/conformite/le-sql-de-la-conformite';
import { confirmerLEffacement, demanderLEffacement, DUREE_DU_LIEN_MS, emettreLeLien, lireLaDemande, lireLeLien, type DependancesDeLEffacement } from '@/lib/conformite/l-effacement';
import { unManifeste } from '../aides/un-manifeste';

const P = '0f1e2d3c-4b5a-4968-8776-655443322110';
const ADA = 'cccccccc-0000-4000-8000-00000000000c';
const T = 1_800_000_000_000;

const SITE = unManifeste({ nature: 'site', roles: [], tables: [] });
const APP = unManifeste({ nature: 'app',
  roles: [{ nom: 'gerant', libelle: 'Gérant', obtenu: 'proprietaire' }, { nom: 'membre', libelle: 'Membre', obtenu: 'invitation' }],
  tables: [{ nom: 'note', libelle: 'Notes de frais', appartenance: 'personnelle', lecture: ['membre', 'gerant'], ecriture: ['membre'],
    champs: [{ nom: 'objet', libelle: 'Objet', type: 'texte', obligatoire: true }, { nom: 'montant', libelle: 'Montant', type: 'montant' }] }] });

describe('le registre des traitements', () => {
  it('un site sans compte : formulaires et audience, aucun compte, aucun bandeau', () => {
    const r = leRegistre(SITE);
    expect(r.traitements.map((x) => x.quoi)).toEqual(['Les messages des formulaires', 'La mesure d’audience']);
    expect(r.traceurs.map((x) => x.nom)).toEqual(['Preuve de visite']);
    expect(r.bandeau).toBe(false);
    expect(r.sousTraitants.some((x) => x.startsWith('Stripe'))).toBe(false);
  });
  it('une app : ses comptes, puis chaque table, ses champs, qui la lit — tirés de la déclaration', () => {
    const r = leRegistre(APP);
    expect(r.traitements[0]!.quoi).toBe('Les comptes');
    const note = r.traitements.find((x) => x.quoi === 'Notes de frais')!;
    expect(note).toMatchObject({ source: 'app', donnees: ['Objet', 'Montant', 'le courriel de qui crée la ligne'], qui: ['Membre', 'Gérant', 'le propriétaire de l’app'] });
    expect(r.traceurs.every((x) => x.essentiel)).toBe(true);
    expect(leRegistre(APP, 'en').traitements[0]!.quoi).toBe('Accounts');
  });
});

describe('le lien d’effacement', () => {
  it('intact et dans l’heure, il rend le projet et le compte ; sinon rien', () => {
    const j = emettreLeLien('s', P, ADA, T);
    expect(lireLeLien('s', j, T + 1000)).toEqual({ projet: P, compte: ADA });
    expect(lireLeLien('s', j, T + DUREE_DU_LIEN_MS + 1)).toBeNull();
    expect(lireLeLien('autre', j, T)).toBeNull();
    expect(lireLeLien('s', j.replace(ADA, 'dddddddd-0000-4000-8000-00000000000d'), T)).toBeNull();
    expect(lireLeLien('s', `${j}.x`, T)).toBeNull();
  });
});

function deps(x: Partial<DependancesDeLEffacement> = {}): DependancesDeLEffacement & { envoyes: { a: string; texte: string }[]; effaces: string[] } {
  const envoyes: { a: string; texte: string }[] = [];
  const effaces: string[] = [];
  return {
    envoyes, effaces, secret: 's', adresse: 'https://vavi.test', maintenant: T,
    courrier: async (m) => { envoyes.push(m); return true; },
    laPersonne: async (j) => (j === 'session-ada' ? { compte: ADA, courriel: 'ada@a.fr', confirme: true } : null),
    leProjet: async (id) => ({ lu: true, valeur: id === P ? { nom: 'Le Thé', schema: 'app_x' } : null }),
    effacer: async (s, c) => { effaces.push(`${s}/${c}`); return { lu: true, valeur: { effacees: 2, gardees: 1, compteEfface: true } }; },
    ...x,
  };
}

describe('demander puis confirmer l’effacement', () => {
  it('la demande n’efface rien : elle envoie un lien à l’adresse confirmée du compte', async () => {
    const d = deps();
    expect(await demanderLEffacement(d, P, 'session-ada', 'fr')).toEqual({ statut: 200, corps: { envoye: 'ada@a.fr' } });
    expect(d.effaces).toEqual([]);
    expect(d.envoyes[0]!.a).toBe('ada@a.fr');
    expect(d.envoyes[0]!.texte).toContain('https://vavi.test/compte/effacer?jeton=');
  });
  it('sans session, adresse non confirmée, projet inconnu, sans courrier : refusé, rien n’est envoyé', async () => {
    expect((await demanderLEffacement(deps(), P, null, 'fr')).statut).toBe(401);
    expect((await demanderLEffacement(deps(), P, 'autre', 'fr')).statut).toBe(401);
    expect((await demanderLEffacement(deps({ laPersonne: async () => ({ compte: ADA, courriel: 'ada@a.fr', confirme: false }) }), P, 'x', 'fr')).statut).toBe(400);
    expect((await demanderLEffacement(deps(), 'dddddddd-0000-4000-8000-00000000000d', 'session-ada', 'fr')).statut).toBe(404);
    expect((await demanderLEffacement(deps({ courrier: null }), P, 'session-ada', 'fr')).statut).toBe(503);
  });
  it('le lien reçu nomme l’app, puis le clic efface ce compte de cette app', async () => {
    const d = deps();
    await demanderLEffacement(d, P, 'session-ada', 'fr');
    const jeton = decodeURIComponent(/jeton=(\S+)/.exec(d.envoyes[0]!.texte)![1]!);
    expect(await lireLaDemande(d, jeton)).toEqual({ lu: true, valeur: { nom: 'Le Thé' } });
    expect(d.effaces).toEqual([]);
    expect(await confirmerLEffacement(d, jeton)).toMatchObject({ fait: true, nom: 'Le Thé', effacement: { gardees: 1 } });
    expect(d.effaces).toEqual([`app_x/${ADA}`]);
  });
  it('un lien faux ou échu n’efface rien', async () => {
    const d = deps();
    expect(await confirmerLEffacement(d, 'n.importe.quoi.x')).toEqual({ fait: false, pourquoi: 'lien_invalide' });
    expect(await confirmerLEffacement({ ...d, maintenant: T + 2 * DUREE_DU_LIEN_MS }, emettreLeLien('s', P, ADA, T))).toEqual({ fait: false, pourquoi: 'lien_invalide' });
    expect(d.effaces).toEqual([]);
  });
});

describe('la migration de la conformité', () => {
  it('est exactement celle que sa source écrit (sinon : npx tsx scripts/ecrire-la-migration-du-socle.ts)', () => {
    expect(readFileSync(join(__dirname, '../..', CHEMIN_DE_LA_MIGRATION_DE_LA_CONFORMITE), 'utf8')).toBe(laMigrationDeLaConformite());
  });
});
