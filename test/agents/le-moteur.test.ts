/**
 * Les agents des apps (Antoine, 26/11, « Quatre briques, Claude écrit l'agent ») : le code de l'agent tourne à part et
 * n'agit que par le protocole ; une forme fausse est un refus dit, une erreur de l'agent est dite avec sa ligne, un agent
 * trop long est arrêté, le journal et les appels à l'IA sont comptés.
 */
import { describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { lancerUnAgent, pileLisible, type Lanceur } from '@/lib/agents/le-moteur';
import { executer, nouveauxCompteurs, BORNES, type Briques } from '@/lib/agents/le-protocole';
import { faireLesCourses, lIssue, lirePrise } from '@/lib/agents/les-courses';

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
    connecteur: async (nom, d) => {
      ecrits.push({ nom, ...d });
      return nom === 'gmail' ? { lu: true, valeur: { ok: true, statut: 200, corps: '{"messages":[{"id":"m1"}]}', donnees: { messages: [{ id: 'm1' }] } } }
        : { lu: false, pourquoi: `connecteur ${nom}: connecteur inconnu` };
    },
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
  it('appelle un connecteur de l’app par son nom, lit sa réponse, et chaque appel est au journal (28/11)', async () => {
    const b = desBriques();
    const r = await lancerUnAgent({ lanceur: direct, briques: b, declencheur: { type: 'essai', entree: '' }, code: code(`
      const l = await ctx.connecteur.appeler('gmail', { chemin: '/messages?q=is:unread' });
      await ctx.connecteur.appeler('gmail', { chemin: '/messages/m1/modify', methode: 'post', requete: { addLabelIds: ['L1'] } });
      return l.donnees.messages.length + ' message(s)';`) });
    expect(r).toMatchObject({ ok: true, resultat: '1 message(s)' });
    expect(b.ecrits).toEqual([
      { nom: 'gmail', chemin: '/messages?q=is:unread', methode: 'GET', requete: null },
      { nom: 'gmail', chemin: '/messages/m1/modify', methode: 'POST', requete: { addLabelIds: ['L1'] } },
    ]);
    expect(r.journal).toEqual(expect.arrayContaining(['connecteur gmail GET /messages?q=is:unread → 200']));
    const refus = await lancerUnAgent({ lanceur: direct, briques: desBriques(), declencheur: { type: 'essai', entree: '' }, code: code(`await ctx.connecteur.appeler('crm');`) });
    expect(refus).toMatchObject({ ok: false, etape: 'agent', erreur: 'connecteur crm: connecteur inconnu' });
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
    const { DIRECTION } = await import('../aides/un-manifeste');
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

describe('les courses des agents (`les-courses.ts`)', () => {
  const course = (ok: boolean) => (ok
    ? { ok: true as const, resultat: 'fait', journal: ['a'], ia: 1, operations: 2, duree: 30 }
    : { ok: false as const, etape: 'agent' as const, erreur: 'boum', pile: 'src/agents/tri.ts:3', journal: [], ia: 0, operations: 1, duree: 5 });

  it('lit une prise de la base, et rien d’une forme fausse', () => {
    expect(lirePrise({ id: '7', projet: 'p', agent: 'tri', declencheur: { type: 'horaire' }, ia_par_jour: 12 }))
      .toEqual({ id: 7, projet: 'p', agent: 'tri', declencheur: { type: 'horaire' }, iaParJour: 12 });
    expect(lirePrise(null)).toBeNull();
    expect(lirePrise({ id: 'x', projet: 'p', agent: 'tri' })).toBeNull();
  });

  it('dit l’issue : le résultat, l’erreur avec sa ligne, ou pourquoi il n’a pas tourné', () => {
    expect(lIssue(course(true))).toEqual({ ok: true, resultat: 'fait', journal: ['a'], ia: 1, operations: 2, duree_ms: 30 });
    expect(lIssue(course(false))).toMatchObject({ ok: false, erreur: 'boum\nsrc/agents/tri.ts:3' });
    expect(lIssue({ raison: 'the app has no published version' })).toMatchObject({ ok: false, erreur: 'the agent could not run: the app has no published version' });
  });

  it('prend et finit chaque course jusqu’à la file vide ; une panne de la plateforme finit la course, sans la laisser prise', async () => {
    const file = [1, 2, 3];
    const finies: Array<[number, Record<string, unknown>]> = [];
    const r = await faireLesCourses({
      budgetMs: 10_000,
      prendre: async () => ({ lu: true, valeur: file.length ? { id: file.shift()!, projet: 'p', agent: 'tri', declencheur: {}, iaParJour: 30 } : null }),
      courir: async (p) => { if (p.id === 2) throw new Error('S3 muet'); return course(true); },
      finir: async (id, issue) => { finies.push([id, issue]); return { lu: true, valeur: true }; },
    });
    expect(r).toEqual({ faites: 3, panne: null });
    expect(finies.map(([id, i]) => `${id}:${i.ok}`)).toEqual(['1:true', '2:false', '3:true']);
    expect(finies[1]?.[1].erreur).toContain('S3 muet');
  });

  it('s’arrête à son temps, et à la base muette', async () => {
    let t = 0;
    const r = await faireLesCourses({ budgetMs: 100, maintenant: () => t,
      prendre: async () => ({ lu: true, valeur: { id: 1, projet: 'p', agent: 'a', declencheur: {}, iaParJour: 1 } }),
      courir: async () => { t += 60; return course(true); }, finir: async () => ({ lu: true, valeur: true }) });
    expect(r.faites).toBe(2);
    expect(await faireLesCourses({ budgetMs: 100, prendre: async () => ({ lu: false, pourquoi: 'muette' }), courir: async () => course(true), finir: async () => ({ lu: true, valeur: true }) }))
      .toEqual({ faites: 0, panne: 'muette' });
  });
});
