/**
 * L'activité de vavi (le tableau de bord de /admin) : les courbes jour par jour, les comptes qui utilisent vavi dans Claude
 * comptés une fois, les comptes administrateurs hors de tout chiffre, une mesure illisible à « — » ; et le serveur MCP qui
 * compte chaque appel, refusé ou non, sans son contenu.
 */
import { describe, expect, it } from 'vitest';
import { lActivite, type LActiviteBrute } from '@/lib/administration/l-activite';
import { servirLeMcp, type ContexteDuServeur } from '@/lib/mcp/le-serveur';

const MAINTENANT = Date.parse('2026-11-27T12:00:00Z');
const A = 'aaaaaaaa-0000-4000-8000-000000000001', B = 'bbbbbbbb-0000-4000-8000-000000000002', MOI = 'cccccccc-0000-4000-8000-000000000003';
const comptes = [
  { id: A, courriel: 'a@x.fr', creeLe: '2026-11-27T08:00:00Z', derniereConnexion: null },
  { id: B, courriel: 'b@x.fr', creeLe: '2026-11-10T08:00:00Z', derniereConnexion: null },
  { id: MOI, courriel: 'moi@x.fr', creeLe: '2026-11-26T08:00:00Z', derniereConnexion: null },
  { id: 'vieux', courriel: null, creeLe: '2026-01-01T08:00:00Z', derniereConnexion: null },
];
const projets = [
  { proprietaire: A, cree_le: '2026-11-27T09:00:00Z', en_ligne: true, en_ligne_le: '2026-11-27T10:00:00Z' },
  { proprietaire: MOI, cree_le: '2026-11-27T09:00:00Z', en_ligne: true, en_ligne_le: '2026-11-27T10:00:00Z' },
];
const brut: LActiviteBrute = {
  appels: [
    { jour: '2026-11-27', compte: A, outil: 'apply_changes', appels: 5, refus: 1 },
    { jour: '2026-11-27', compte: A, outil: 'build_preview', appels: 2, refus: 0 },
    { jour: '2026-11-20', compte: B, outil: 'apply_changes', appels: 3, refus: 0 },
    { jour: '2026-11-27', compte: MOI, outil: 'apply_changes', appels: 40, refus: 9 },
    { jour: '2026-09-01', compte: B, outil: 'apply_changes', appels: 99, refus: 0 },
  ],
  builds: [{ jour: '2026-11-27', compte: A, verts: 2, rouges: 1 }, { jour: '2026-11-27', compte: MOI, verts: 8, rouges: 8 }],
  visites: [{ jour: '2026-11-26', visites: 12 }, { jour: '2026-11-01', visites: 3 }],
};

describe('l’activité de vavi', () => {
  const a = lActivite(brut, comptes, projets, new Set([MOI]), MAINTENANT, 30);

  it('les jours de la période, le dernier aujourd’hui ; chaque courbe a un point par jour', () => {
    expect(a.jours).toHaveLength(30);
    expect(a.jours.at(-1)).toBe('2026-11-27');
    for (const m of [a.inscrits, a.actifs!, a.appels!, a.projets, a.builds!.verts, a.misesEnLigne, a.visites!]) expect(m.serie).toHaveLength(30);
  });

  it('les comptes administrateurs ne comptent nulle part : ni inscrits, ni appels, ni projets, ni builds', () => {
    expect(a.inscrits).toMatchObject({ total: 3, periode: 2, semaine: 1 });
    expect(a.appels).toMatchObject({ periode: 10, semaine: 7, refus: 1 });
    expect(a.appels!.parOutil).toEqual([{ outil: 'apply_changes', appels: 8, refus: 1 }, { outil: 'build_preview', appels: 2, refus: 0 }]);
    expect(a.projets).toMatchObject({ total: 1, periode: 1 });
    expect(a.builds).toMatchObject({ rouges: 1 });
    expect(a.builds!.verts.periode).toBe(2);
    expect(a.misesEnLigne).toMatchObject({ enLigne: 1, periode: 1 });
  });

  it('un compte qui appelle vavi plusieurs fois compte une fois ; hors période, rien', () => {
    expect(a.actifs).toMatchObject({ periode: 2, semaine: 1 });
    expect(a.actifs!.serie.at(-1)).toBe(1);
    expect(a.visites).toMatchObject({ periode: 15, semaine: 12 });
    expect(a.conversion).toEqual({ comptes: 3, avecUnProjet: 1, avecUnSiteEnLigne: 1 });
  });

  it('la mesure de l’activité absente (migration à coller) : « — », jamais 0', () => {
    const s = lActivite(null, comptes, projets, new Set(), MAINTENANT, 30);
    expect([s.actifs, s.appels, s.builds, s.visites]).toEqual([null, null, null, null]);
    expect(s.inscrits.total).toBe(4);
  });

  it('le serveur MCP compte chaque appel d’outil connu, refusé ou non, et rien d’autre', async () => {
    const vus: [string, boolean][] = [];
    const ctx = { compter: (o: string, r: boolean) => vus.push([o, r]), langue: 'fr', outils: {} } as unknown as ContexteDuServeur;
    await servirLeMcp({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'n_existe_pas', arguments: {} } }, ctx);
    await servirLeMcp({ jsonrpc: '2.0', id: 2, method: 'tools/list' }, ctx);
    expect(vus).toEqual([]);
    await servirLeMcp({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'get_project_state', arguments: {} } }, ctx);
    expect(vus).toEqual([['get_project_state', true]]);
  });
  it('les visites de www.vavi.dev : une courbe par jour, la période, la semaine ; illisibles, « — » (null), jamais 0', () => {
    const avec = lActivite(brut, comptes, projets, new Set([MOI]), MAINTENANT, 30, { visites: [{ jour: '2026-11-27', visites: 5 }, { jour: '2026-11-15', visites: 3 }, { jour: '2026-08-01', visites: 99 }], provenances: [{ referent: 'direct', visites: 6 }] });
    expect(avec.accueil).toMatchObject({ periode: 8, semaine: 5, provenances: [{ referent: 'direct', visites: 6 }] });
    expect(avec.accueil!.serie).toHaveLength(30);
    expect(lActivite(brut, comptes, projets, new Set([MOI]), MAINTENANT, 30).accueil).toBeNull();
  });
});
