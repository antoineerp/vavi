/**
 * L'ENTRÉE D'UN AGENT — le petit programme que la plateforme lance dans le bac à sable à côté du code de l'agent : il
 * construit le contexte (`src/lib/agent.ts` du gabarit), dont chaque geste devient une ligne JSON sur la sortie, et la
 * réponse revient sur l'entrée. `console.*` de l'agent va au journal : la sortie ne porte que le protocole.
 */
export const MARQUE = 'vavi-agent';

export const ENTREE_DE_L_AGENT = String.raw`'use strict';
const MARQUE = ${JSON.stringify(MARQUE)};
const ecrire = (o) => process.stdout.write(JSON.stringify(Object.assign({ [MARQUE]: 1 }, o)) + '\n');
let suivant = 1;
const attendus = new Map();
const demander = (op, args) => new Promise((ok, non) => {
  const id = suivant++;
  attendus.set(id, { ok, non });
  ecrire({ id, op, args });
});
const enTexte = (x) => { try { return typeof x === 'string' ? x : JSON.stringify(x); } catch { return String(x); } };
const journal = (texte) => { demander('journal', { texte: String(texte) }).catch(() => {}); };
for (const n of ['log', 'info', 'warn', 'error', 'debug']) console[n] = (...xs) => journal(xs.map(enTexte).join(' '));
let tampon = '';
let debut = null;
const finir = (o) => { ecrire(o); setTimeout(() => process.exit(0), 20); };
process.stdin.setEncoding('utf8');
process.stdin.on('data', (morceau) => {
  tampon += morceau;
  let i;
  while ((i = tampon.indexOf('\n')) >= 0) {
    const ligne = tampon.slice(0, i); tampon = tampon.slice(i + 1);
    let m; try { m = JSON.parse(ligne); } catch { continue; }
    if (m.debut && !debut) { debut = m.debut; lancer(); continue; }
    const a = attendus.get(m.id); if (!a) continue;
    attendus.delete(m.id);
    if (m.ok) a.ok(m.valeur); else a.non(new Error(m.pourquoi));
  }
});
async function lancer() {
  let agent;
  try {
    const mod = require(process.argv[2]);
    agent = typeof mod === 'function' ? mod : mod && typeof mod.default === 'function' ? mod.default : null;
  } catch (e) { return finir({ erreur: 'the agent file could not be loaded: ' + (e && e.message), pile: String(e && e.stack || '') }); }
  if (!agent) return finir({ erreur: 'src/agents file has no default export function: export default an async function (ctx) => …' });
  const ctx = Object.freeze({
    declencheur: debut.declencheur,
    maintenant: debut.maintenant,
    ia: Object.freeze({
      texte: (prompt, o) => demander('ia', { prompt, system: o && o.system, maxTokens: o && o.maxTokens }).then((v) => String(v)),
      donnee: (prompt, schema, o) => demander('ia', { prompt, schema, system: o && o.system, maxTokens: o && o.maxTokens }),
    }),
    base: Object.freeze({
      lire: (table, o) => demander('lire', { table, egal: o && o.egal, limite: o && o.limite }),
      creer: (table, valeurs) => demander('creer', { table, valeurs }),
      modifier: (table, id, valeurs) => demander('modifier', { table, id, valeurs }).then(() => undefined),
    }),
    journal,
  });
  try {
    const r = await agent(ctx);
    finir({ fin: true, resultat: r === undefined || r === null ? null : String(r) });
  } catch (e) {
    finir({ erreur: String(e && e.message || e), pile: String(e && e.stack || '') });
  }
}
`;
