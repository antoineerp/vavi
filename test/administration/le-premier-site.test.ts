/** Le temps jusqu'au premier site : les étapes atteintes, leurs médianes, et ce que le serveur MCP note. */
import { describe, expect, it } from 'vitest';
import { enClair, lePremierSite } from '@/lib/administration/le-premier-site';
import { lEtapeFranchie, servirLeMcp, type ContexteDuServeur, type EtapeFranchie } from '@/lib/mcp/le-serveur';

const T0 = '2026-11-26T08:00:00.000Z';
const plus = (min: number) => new Date(Date.parse(T0) + min * 60_000).toISOString();
const compte = (id: string) => ({ id, courriel: null, creeLe: T0, derniereConnexion: null });

describe('le temps jusqu’au premier site', () => {
  it('compte chaque étape atteinte et la médiane depuis l’étape d’avant ; les projets complètent les comptes d’avant la mesure', () => {
    const e = lePremierSite({
      notees: [{ compte: 'a', etape: 'connecteur', le: plus(10) }, { compte: 'b', etape: 'connecteur', le: plus(30) },
        { compte: 'a', etape: 'parcours', le: plus(50) }, { compte: 'x', etape: 'connecteur', le: plus(1) }, { compte: 'a', etape: 'inconnue', le: plus(1) }],
      projets: [{ compte: 'a', projet: plus(20), build_vert: plus(40), en_ligne: null }, { compte: 'c', projet: plus(100), build_vert: null, en_ligne: null }],
    }, [compte('a'), compte('b'), compte('c')]);
    const par = Object.fromEntries(e.map((x) => [x.etape, x]));
    expect(e.map((x) => x.etape)).toEqual(['compte', 'connecteur', 'projet', 'build_vert', 'parcours', 'en_ligne']);
    expect(par.compte).toMatchObject({ atteinte: 3, depuisLAvant: null });
    expect(par.connecteur).toMatchObject({ atteinte: 2, depuisLAvant: 20, depuisLeCompte: 20 });
    // c n'a pas de connecteur noté (compte d'avant la mesure) : il compte au projet, pas dans la médiane depuis le connecteur.
    expect(par.projet).toMatchObject({ atteinte: 2, depuisLAvant: 10, depuisLeCompte: 60 });
    expect(par.build_vert).toMatchObject({ atteinte: 1, depuisLAvant: 20 });
    expect(par.parcours).toMatchObject({ atteinte: 1, depuisLAvant: 10, depuisLeCompte: 50 });
    expect(par.en_ligne).toMatchObject({ atteinte: 0, depuisLAvant: null, depuisLeCompte: null });
  });
  it('dit une durée en clair', () => {
    expect([enClair(null), enClair(4), enClair(130), enClair(120), enClair(4 * 1440)]).toEqual(['—', '4 min', '2 h 10', '2 h', '4 j']);
  });
  it('un résultat d’outil marque son étape ; un refus ou un build rouge n’en marque aucune', () => {
    expect(lEtapeFranchie('create_project', { ok: true }, false)).toBe('projet');
    expect(lEtapeFranchie('create_project', { refuse: true }, true)).toBeNull();
    expect(lEtapeFranchie('build_preview', { green: true }, false)).toBe('build_vert');
    expect(lEtapeFranchie('apply_changes', { build: { green: false } }, false)).toBeNull();
    expect(lEtapeFranchie('apply_changes', { build: { green: true } }, false)).toBe('build_vert');
    expect(lEtapeFranchie('try_journey', { passed: false }, false)).toBe('parcours');
    expect(lEtapeFranchie('publish', {}, false)).toBe('en_ligne');
    expect(lEtapeFranchie('read_files', {}, false)).toBeNull();
  });
  it('le serveur note le connecteur à `initialize`', async () => {
    const notees: EtapeFranchie[] = [];
    const ctx = { noter: (e: EtapeFranchie) => notees.push(e), langue: 'fr', outils: {} } as unknown as ContexteDuServeur;
    await servirLeMcp({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }, ctx);
    expect(notees).toEqual(['connecteur']);
  });
});
