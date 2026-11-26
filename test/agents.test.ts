/**
 * Les agents des apps (Antoine, 26/11, « Quatre briques, Claude écrit l'agent ») : le code de l'agent tourne à part et
 * n'agit que par le protocole ; une forme fausse est un refus dit, une erreur de l'agent est dite avec sa ligne, un agent
 * trop long est arrêté, le journal et les appels à l'IA sont comptés.
 */
import { describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { lancerUnAgent, pileLisible, type Lanceur } from '@/lib/agents/le-moteur';
import { executer, nouveauxCompteurs, BORNES, type Briques } from '@/lib/agents/le-protocole';

/** Les essais lancent node sans bac à sable (la CI n'a pas bubblewrap) ; la production passe toujours par lui. */
const direct: Lanceur = (dossier, commande) => spawn(process.execPath, [...commande], { cwd: dossier, stdio: ['pipe', 'pipe', 'pipe'] });

function desBriques(): Briques & { ecrits: unknown[] } {
  const ecrits: unknown[] = [];
  return {
    ecrits,
    ia: async (d) => ({ lu: true, valeur: d.schema ? { urgence: 'haute' } : `réponse à ${d.prompt}` }),
    lire: async (table) => (table === 'demandes' ? { lu: true, valeur: [{ id: 'd1', texte: 'fuite' }, { id: 'd2', texte: 'bruit' }] } : { lu: false, pourquoi: `table ${table} inconnue` }),
    creer: async (table, valeurs) => { ecrits.push({ table, valeurs }); return { lu: true, valeur: 'n1' }; },
    modifier: async (table, id, valeurs) => { ecrits.push({ table, id, valeurs }); return { lu: true, valeur: null }; },
  };
}

const code = (corps: string) => `"use strict";Object.defineProperty(exports,"__esModule",{value:true});exports.default=async function(ctx){${corps}};`;

describe('le moteur d’un agent', () => {
  it('fait tourner le code, qui lit, demande à l’IA, modifie et écrit au journal ; rend son résultat', async () => {
    const b = desBriques();
    const r = await lancerUnAgent({ lanceur: direct, briques: b, declencheur: { type: 'essai', entree: '' }, code: code(`
      const ds = await ctx.base.lire('demandes');
      for (const d of ds) { const t = await ctx.ia.donnee('classe ' + d.texte, { type: 'object', properties: { urgence: { type: 'string' } } });
        await ctx.base.modifier('demandes', d.id, { urgence: t.urgence }); ctx.journal('classée ' + d.id); }
      console.log('fini', ds.length);
      return ds.length + ' demandes classées';`) });
    expect(r).toMatchObject({ ok: true, resultat: '2 demandes classées', ia: 2 });
    expect(r.journal).toEqual(expect.arrayContaining(['classée d1', 'classée d2', 'fini 2']));
    expect(b.ecrits).toEqual([{ table: 'demandes', id: 'd1', valeurs: { urgence: 'haute' } }, { table: 'demandes', id: 'd2', valeurs: { urgence: 'haute' } }]);
  }, 20_000);
  it('dit l’erreur de l’agent, et un refus de la plateforme devient une erreur qu’il peut lire', async () => {
    const r = await lancerUnAgent({ lanceur: direct, briques: desBriques(), declencheur: { type: 'essai', entree: '' }, code: code(`await ctx.base.lire('clients');`) });
    expect(r).toMatchObject({ ok: false, etape: 'agent', erreur: 'table clients inconnue' });
  }, 20_000);
  it('arrête un agent qui dépasse son délai', async () => {
    const r = await lancerUnAgent({ lanceur: direct, briques: desBriques(), delaiMs: 800, declencheur: { type: 'essai', entree: '' }, code: code('await new Promise(() => {});') });
    expect(r).toMatchObject({ ok: false, etape: 'delai' });
  }, 20_000);
  it('refuse un fichier sans fonction par défaut, en disant quoi écrire', async () => {
    const r = await lancerUnAgent({ lanceur: direct, briques: desBriques(), declencheur: { type: 'essai', entree: '' }, code: 'exports.x = 1;' });
    expect(r).toMatchObject({ ok: false, etape: 'agent' });
    expect(r.ok ? '' : r.erreur).toMatch(/default export/);
  }, 20_000);
});

describe('le protocole', () => {
  it('relit chaque demande avant sa brique, et borne le nombre de demandes', async () => {
    const c = nouveauxCompteurs();
    expect(await executer('lire', { table: 'Drop table' }, desBriques(), c)).toMatchObject({ lu: false });
    expect(await executer('ia', { prompt: 'x', schema: { type: 'array' } }, desBriques(), c)).toMatchObject({ lu: false });
    expect(await executer('effacer', {}, desBriques(), c)).toMatchObject({ lu: false, pourquoi: 'unknown request effacer' });
    c.operations = BORNES.operations;
    expect(await executer('journal', { texte: 'x' }, desBriques(), c)).toMatchObject({ lu: false });
  });
  it('rend la pile lisible : la ligne du fichier de l’agent, sans le dossier du bac à sable', () => {
    expect(pileLisible('Error: non\n    at f (/tmp/vavi-agent-x/src/agents/tri.ts:12:5)\n    at node:internal/x')).toBe('Error: non\n    at f src/agents/tri.ts:12:5');
  });
});

describe.runIf(process.env.VAVI_BWRAP_ESSAI === 'oui')('le bac à sable réel', () => {
  it('fait tourner l’agent sans réseau', async () => {
    const r = await lancerUnAgent({ briques: desBriques(), declencheur: { type: 'essai', entree: '' },
      code: code('try { await fetch("https://example.com"); return "ouvert"; } catch { return "fermé"; }') });
    expect(r).toMatchObject({ ok: true, resultat: 'fermé' });
  }, 20_000);
});

describe('le build que regarde le bouton', () => {
  it('l’aperçu quand la page est l’aperçu, sinon le site en ligne', async () => {
    const { leBuildDuBouton } = await import('@/lib/agents/le-build-du-bouton');
    const b = { apercu: 'a', enLigne: 'e' };
    expect(leBuildDuBouton('https://www.vavi.dev/p/p1/equipe', 'p1', b)).toBe('a');
    expect(leBuildDuBouton('https://apercu-p1.apps.vavi.dev/', 'p1', b)).toBe('a');
    expect(leBuildDuBouton('https://monsite.fr/equipe', 'p1', b)).toBe('e');
    expect(leBuildDuBouton(null, 'p1', { apercu: 'a', enLigne: null })).toBe('a');
  });
});

describe('la déclaration d’un agent dans app.json', () => {
  it('dit quand il se réveille ; la table de l’événement, les rôles du bouton et le jour d’une semaine sont vérifiés', async () => {
    const { lireLeManifeste } = await import('@/lib/backend/app/manifeste');
    const { DIRECTION } = await import('./aides/un-manifeste');
    const app = (agents: unknown[]) => lireLeManifeste({ version: 1, nature: 'site', nom: 'Essai', description: 'Un essai.', langues: { principale: 'fr' }, direction: DIRECTION, agents });
    const ok = app([{ nom: 'tri', libelle: 'Tri', dit: 'Classe les demandes chaque matin.', reveil: { type: 'horaire', cadence: 'quotidien', heure: 7 } }]);
    expect(ok).toMatchObject({ ok: true });
    expect(ok.ok && ok.manifeste.agents[0]!.ia_par_jour).toBe(30);
    const erreurs = (x: ReturnType<typeof app>) => (x.ok ? [] : x.erreurs).join(' | ');
    expect(erreurs(app([{ nom: 'a', libelle: 'A', dit: 'Fait quelque chose.', reveil: { type: 'evenement', table: 'absente' } }]))).toMatch(/table absente/);
    expect(erreurs(app([{ nom: 'a', libelle: 'A', dit: 'Fait quelque chose.', reveil: { type: 'bouton', par: ['chef'] } }]))).toMatch(/rôle chef/);
    expect(erreurs(app([{ nom: 'a', libelle: 'A', dit: 'Fait quelque chose.', reveil: { type: 'horaire', cadence: 'quotidien', jour: 2 } }]))).toMatch(/hebdomadaire/);
    // L'ancienne forme (mission, tables lues, table à propositions) n'existe plus : un moteur fixe ne la sert pas.
    expect(app([{ nom: 'a', libelle: 'A', mission: 'Cherche des fournisseurs et propose-les.', lit: [], propose: 'x', par: ['proprietaire'] }])).toMatchObject({ ok: false });
  });
});
