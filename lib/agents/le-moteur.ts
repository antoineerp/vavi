/**
 * LE MOTEUR D'UN AGENT — fait tourner le code d'un agent (le `_agents/<nom>.cjs` de son build vert) dans le bac à sable
 * des builds (`lib/atelier/le-bac-a-sable.ts`) : sans réseau, sans l'environnement du serveur, sans autre disque que son
 * dossier. Il ne parle qu'au protocole (`le-protocole.ts`), sur son entrée et sa sortie. Il est arrêté à son délai ;
 * sans bac à sable, il ne tourne pas : jamais à découvert.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { argumentsDuBacASable, BWRAP, racineDeNode } from '@/lib/atelier/le-bac-a-sable';
import { ENTREE_DE_L_AGENT, MARQUE } from './l-entree';
import { executer, nouveauxCompteurs, type Briques } from './le-protocole';

export const DELAI_D_UN_AGENT_MS = 120_000;

export type Course =
  | { readonly ok: true; readonly resultat: string | null; readonly journal: readonly string[]; readonly ia: number; readonly operations: number; readonly duree: number }
  | { readonly ok: false; readonly etape: 'bac_a_sable' | 'delai' | 'agent'; readonly erreur: string; readonly pile: string | null;
      readonly journal: readonly string[]; readonly ia: number; readonly operations: number; readonly duree: number };

/** Lance `node <entree> <agent>` dans `dossier` ; les essais le lancent sans bac à sable. */
export type Lanceur = (dossier: string, commande: readonly string[]) => ChildProcess;

export const lanceurDuBacASable: Lanceur = (dossier, commande) => {
  const node = racineDeNode();
  return spawn(BWRAP, argumentsDuBacASable({ atelier: dossier, lecture: [], node, commande: [join(node, 'bin', 'node'), ...commande] }), { cwd: dossier, env: { PATH: '/usr/bin:/bin' } as unknown as NodeJS.ProcessEnv, stdio: ['pipe', 'pipe', 'pipe'] });
};

/** Une ligne de la sortie qui parle le protocole, ou `null`. PURE. */
export function lireUneLigne(ligne: string): Record<string, unknown> | null {
  try {
    const m = JSON.parse(ligne) as unknown;
    return m && typeof m === 'object' && !Array.isArray(m) && (m as Record<string, unknown>)[MARQUE] === 1 ? m as Record<string, unknown> : null;
  } catch { return null; }
}

/** La pile, sans les chemins du bac à sable : ce que Claude lit pour corriger (`src/agents/<nom>.ts:12`). PURE. */
export const pileLisible = (pile: string): string =>
  pile.split('\n').filter((l) => /src\//.test(l) || !/^\s+at /.test(l)).map((l) => l.replace(/\(?[^\s()]*?(src\/[^\s():]+:\d+(?::\d+)?)\)?/g, '$1')).slice(0, 12).join('\n');

export async function lancerUnAgent(o: {
  readonly code: Buffer | string; readonly declencheur: Record<string, unknown>; readonly briques: Briques;
  readonly lanceur?: Lanceur; readonly delaiMs?: number; readonly maintenant?: Date;
}): Promise<Course> {
  const debut = Date.now();
  const c = nouveauxCompteurs(o.declencheur.type === 'essai');
  const dossier = mkdtempSync(join(tmpdir(), 'vavi-agent-'));
  const fin = (x: { ok: true; resultat: string | null } | { ok: false; etape: 'bac_a_sable' | 'delai' | 'agent'; erreur: string; pile: string | null }): Course =>
    ({ ...x, journal: c.journal, ia: c.ia, operations: c.operations, duree: Date.now() - debut }) as Course;
  try {
    writeFileSync(join(dossier, 'entree.cjs'), ENTREE_DE_L_AGENT);
    writeFileSync(join(dossier, 'agent.cjs'), o.code);
    let p: ChildProcess;
    try {
      p = (o.lanceur ?? lanceurDuBacASable)(dossier, ['--enable-source-maps', join(dossier, 'entree.cjs'), join(dossier, 'agent.cjs')]);
    } catch (e) {
      return fin({ ok: false, etape: 'bac_a_sable', erreur: `the agent sandbox could not start: ${(e as Error).message}`, pile: null });
    }
    return await new Promise<Course>((resoudre) => {
      let tampon = '', erreurs = '', fini = false;
      const terminer = (x: Parameters<typeof fin>[0]) => {
        if (fini) return;
        fini = true;
        clearTimeout(minuteur);
        p.kill('SIGKILL');
        resoudre(fin(x));
      };
      const minuteur = setTimeout(() => terminer({ ok: false, etape: 'delai', erreur: `the agent ran longer than ${Math.round((o.delaiMs ?? DELAI_D_UN_AGENT_MS) / 1000)} s and was stopped`, pile: null }), o.delaiMs ?? DELAI_D_UN_AGENT_MS);
      const repondre = (m: Record<string, unknown>) => { if (!fini) p.stdin?.write(`${JSON.stringify(m)}\n`); };
      p.on('error', (e) => terminer({ ok: false, etape: 'bac_a_sable', erreur: `the agent sandbox could not start: ${e.message}`, pile: null }));
      p.stderr?.on('data', (d: Buffer) => { erreurs = (erreurs + d.toString('utf8')).slice(-4000); });
      p.stdout?.on('data', (d: Buffer) => {
        tampon += d.toString('utf8');
        let i: number;
        while ((i = tampon.indexOf('\n')) >= 0) {
          const m = lireUneLigne(tampon.slice(0, i));
          tampon = tampon.slice(i + 1);
          if (!m) continue;
          if (m.fin === true) { terminer({ ok: true, resultat: typeof m.resultat === 'string' ? m.resultat.slice(0, 4000) : null }); return; }
          if (typeof m.erreur === 'string') { terminer({ ok: false, etape: 'agent', erreur: m.erreur.slice(0, 1000), pile: typeof m.pile === 'string' ? pileLisible(m.pile) : null }); return; }
          if (typeof m.id !== 'number') continue;
          const id = m.id;
          void executer(m.op, m.args, o.briques, c)
            .catch((e: unknown) => ({ lu: false as const, pourquoi: `the platform failed: ${String((e as Error)?.message ?? e).slice(0, 200)}` }))
            .then((r) => repondre(r.lu ? { id, ok: true, valeur: r.valeur } : { id, ok: false, pourquoi: r.pourquoi }));
        }
      });
      p.on('close', (code) => {
        if (fini) return;
        const ferme = code !== 0 && /bwrap|namespace|Operation not permitted/i.test(erreurs);
        if (ferme) terminer({ ok: false, etape: 'bac_a_sable', erreur: `the agent sandbox could not start on this vavi server: ${erreurs.slice(-300)}`, pile: null });
        else terminer({ ok: false, etape: 'agent', erreur: `the agent stopped without finishing (exit ${code})${erreurs ? `: ${erreurs.slice(-600)}` : ''}`, pile: null });
      });
      repondre({ debut: { declencheur: o.declencheur, maintenant: (o.maintenant ?? new Date()).toISOString() } });
    });
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
}


