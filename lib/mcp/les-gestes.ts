/**
 * LES GESTES DES OUTILS — ce que chaque outil du serveur MCP fait, sur les projets du compte qui appelle.
 *
 * Chaque geste rend un FAIT (`{ ok: true, ... }`) ou un REFUS de la liste fermée (`lib/consignes/refus.ts`) qui dit ce qui
 * le lèverait. Aucun geste ne modifie un fichier de Claude (règle 4) : il l'écrit tel quel, ou il refuse. Les garde-fous
 * tenus ici sont ceux du cahier « Garde-fous de Claude dans vavi » (24/11) :
 *   - on n'écrit que sur un chantier ouvert, et sur la version lue (empreinte par fichier) : jamais par-dessus un autre ;
 *   - app.json ne s'écrit que par `configure_backend`, qui pose la base d'abord ; le figé ne s'écrit jamais ;
 *   - aucune clé secrète dans le code ni dans le build ; aucun paquet hors du gabarit ;
 *   - on ne publie que le build vert de l'arbre courant.
 * Les dépendances (base, magasin, build) sont passées : les essais jouent les gestes sans réseau.
 */
import { derive } from '@/squelette/poser';
import { lesLignesDesMesures } from '@/lib/seo/les-mesures-a-l-ecran';
import { estFige, CHEMINS_A_LIRE_ENTIERS, CHEMINS_EN_FICHE, POSES_PAR_UN_OUTIL, laFiche } from '@/squelette/registre';
import { lireLeManifeste, type Manifeste } from '@/lib/backend/app/manifeste';
import { poserLaBase, type AppelDeLaBase } from '@/lib/relais/poser-la-base';
import type { Projets, Projet } from '@/lib/projets/les-projets';
import { empreinteDuFichier, empreinteMontree, concorde } from '@/lib/projets/les-empreintes';
import type { Construction } from '@/lib/atelier/construire';
import type { Magasin } from '@/lib/publication/le-magasin';
import type { PreRendu } from '@/lib/seo/le-pre-rendu';
import { publierLeDist, racineDuBuild } from '@/lib/publication/publier';
import { refuser, suiteDeRefus, paquetInconnu, erreurMasquee, laBoucle, ROUGES_D_AFFILEE, CONSIGNES_D_OUTIL, type Outil, type Refus } from '@/lib/consignes';
import { estUnFichierDEnvironnement, unSecretDans } from './les-secrets';
import { lArbreDUnProjet } from '@/lib/projets/l-arbre-d-un-projet';
import { revenirA } from '@/lib/versions/revenir';

export interface Contexte {
  readonly compte: string;
  readonly projets: Projets;
  /** La base de la plateforme sous la clé de service, pour poser la base d'un projet. */
  readonly base: AppelDeLaBase;
  /** `null` : le magasin des builds n'est pas configuré. */
  readonly magasin: Magasin | null;
  readonly construire: (arbre: ReadonlyMap<string, string>, base: string) => Promise<Construction>;
  /** Le pré-rendu des pages publiques d'un build vert (`lib/seo`) ; rend `null` sans navigateur sur ce serveur. */
  readonly preRendre: (projet: string, dist: ReadonlyMap<string, Buffer>, manifeste: Manifeste) => Promise<PreRendu | null>;
  /** Les paquets du gabarit verrouillé. */
  readonly permis: readonly string[];
  /** L'adresse publique de la plateforme, sans barre finale. */
  readonly adresse: string;
  readonly scellerUnSecret: (projet: string, nom: string, valeur: string) => string;
  /** Le dernier refus rendu, par compte et projet : le même deux fois de suite dit d'arrêter. */
  readonly refusPrecedents: Map<string, Refus>;
  /** Ce que vavi suit d'un chantier, par compte et projet (en mémoire du processus) : builds rouges d'affilée, texte envoyé. */
  readonly suivis: Map<string, Suivi>;
}

export interface Suivi { rouges: number; envoyes: number }
const cleDe = (c: Contexte, projet: string | undefined): string => `${c.compte}|${projet ?? ''}`;
function leSuivi(c: Contexte, projet: string | undefined): Suivi {
  const cle = cleDe(c, projet);
  let s = c.suivis.get(cle);
  if (!s) {
    s = { rouges: 0, envoyes: 0 };
    c.suivis.set(cle, s);
    if (c.suivis.size > 10_000) c.suivis.delete(c.suivis.keys().next().value!);
  }
  return s;
}
/** Une estimation des jetons, dite comme telle : environ 3,5 caractères par jeton, arrondie à la centaine. */
const jetonsEstimes = (caracteres: number): number => Math.round(caracteres / 3.5 / 100) * 100;

export type Rendu = { readonly ok: true; readonly [champ: string]: unknown } | Refus;
const fait = (x: Record<string, unknown>): Rendu => ({ ok: true, ...x });
export const estUnRefus = (r: Rendu): r is Refus => (r as Refus).refuse === true;

/** Au-delà, la conversation est longue : l'outil le dit, et Claude propose « Reprendre » dans une nouvelle. */
export const GESTES_D_UNE_LONGUE_CONVERSATION = 25;
const LONGUE = 'This work session is getting long. Propose to the person to continue in a new conversation with the "Resume" prompt: vavi keeps the session notes.';
const MAX_ECRIT = 2_000_000;
const MAX_LU = 400_000;

const urlDeLApercu = (c: Contexte, id: string): string => `${c.adresse}/p/${id}/`;
const urlDuBrouillon = (c: Contexte, id: string, e: string): string => `${urlDeLApercu(c, id)}?brouillon=${e}`;

/* ── Ce que chaque geste vérifie d'abord ───────────────────────────────── */

type Etape<T> = { readonly ok: true; readonly valeur: T } | { readonly ok: false; readonly refus: Refus };
const passe = <T>(valeur: T): Etape<T> => ({ ok: true, valeur });
const bloque = <T = never>(refus: Refus): Etape<T> => ({ ok: false, refus });
const panne = (pourquoi: string): Refus => refuser('base_illisible', `The project database did not answer (${pourquoi}).`);

async function leProjet(c: Contexte, id: string): Promise<Etape<Projet>> {
  const p = await c.projets.lire(c.compte, id);
  if (!p.lu) return bloque(panne(p.pourquoi));
  return p.valeur ? passe(p.valeur) : bloque(refuser('projet_inconnu', `No project "${id}" in this account.`));
}

async function leChantier(c: Contexte, id: string, chantier: string): Promise<Etape<Projet>> {
  const p = await leProjet(c, id);
  if (!p.ok) return p;
  const ouvert = p.valeur.chantier;
  if (!ouvert) return bloque(refuser('chantier_requis', 'No work session is open on this project.'));
  if (ouvert.id !== chantier) {
    return bloque(refuser('chantier_ouvert', `The open work session is "${ouvert.intention}" (opened ${ouvert.ouvertLe}, last change ${ouvert.dernierGesteLe}), not this one.`));
  }
  return p;
}

async function lesFichiers(c: Contexte, id: string): Promise<Etape<ReadonlyMap<string, string>>> {
  const f = await c.projets.fichiers(c.compte, id);
  return f.lu ? passe(f.valeur) : bloque(panne(f.pourquoi));
}

/** Un chemin que Claude peut écrire : relatif, dans le projet, hors du cadre ; sinon le refus qui le dit. */
export function cheminRefuse(chemin: string): Refus | null {
  const parts = chemin.split('/');
  if (chemin.startsWith('/') || chemin.includes('\\') || chemin.includes('\0') || parts.some((p) => p === '' || p === '.' || p === '..')
    || chemin.length > 300 || parts[0] === 'node_modules' || parts[0] === 'dist') {
    return refuser('chemin_refuse', `"${chemin}" is not a path inside the project.`, { fichier: chemin });
  }
  if (chemin === 'app.json') return refuser('fichier_du_cadre', 'app.json is written only by `configure_backend`, which also lays out the database.', { fichier: chemin });
  if ((POSES_PAR_UN_OUTIL as readonly string[]).includes(chemin)) return refuser('fichier_du_cadre', `${chemin} is written by the vavi console (images, search settings), not by you.`, { fichier: chemin });
  if (estFige(chemin)) return refuser('fichier_du_cadre', `${chemin} belongs to the platform: it comes from the template or from app.json. Read it with \`read_files\`; write your own file next to it. To change the data, use \`configure_backend\`.`, { fichier: chemin });
  if (estUnFichierDEnvironnement(chemin)) return refuser('secret_dans_le_code', `${chemin} is an environment file: secrets are stored with \`set_secret\`, never in a file.`, { fichier: chemin });
  return null;
}

/** Ce qu'un texte ne doit pas porter : une clé secrète, un paquet hors du gabarit. */
function texteRefuse(c: Contexte, chemin: string, texte: string): Refus | null {
  const secret = unSecretDans(texte);
  if (secret) return refuser('secret_dans_le_code', `${chemin} contains what looks like a secret (${secret.sorte}).`, { fichier: chemin, ligne: secret.ligne });
  if (!/\.(tsx?|jsx?|mjs|cjs)$/.test(chemin)) return null;
  return erreurMasquee(chemin, texte) ?? paquetInconnu(chemin, texte, c.permis);
}

/** app.json tel que Claude l'envoie : valide sans réparation, sinon refusé avec chaque écart. */
function leManifesteEnvoye(brut: unknown): Etape<Manifeste> {
  let json = brut;
  if (typeof brut === 'string') {
    try { json = JSON.parse(brut); } catch (e) { return bloque(refuser('app_json_refuse', `app.json is not valid JSON: ${(e as Error).message}.`, { fichier: 'app.json' })); }
  }
  const r = lireLeManifeste(json);
  if (!r.ok) return bloque(refuser('app_json_refuse', `app.json does not hold: ${r.erreurs.slice(0, 20).join(' | ')}`, { fichier: 'app.json' }));
  // vavi ne répare pas ce que Claude écrit (règle 4) : ce qu'il aurait fallu changer est dit, et Claude l'écrit.
  if (r.repare.length > 0) return bloque(refuser('app_json_refuse', `app.json must be written as follows (vavi does not change it for you): ${r.repare.join(' | ')}`, { fichier: 'app.json' }));
  return passe(r.manifeste);
}

/** Les consignes d'un outil rare, rendues avec sa réponse plutôt que dans les instructions (`CONSIGNES_D_OUTIL`). */
const regles = (o: Outil): { rules?: string } => (CONSIGNES_D_OUTIL[o] ? { rules: CONSIGNES_D_OUTIL[o] } : {});

/* ── Les gestes ────────────────────────────────────────────────────────── */

const vueDuProjet = (c: Contexte, p: Projet) => ({
  id: p.id, name: p.nom, version: p.version, modified_at: p.modifieLe,
  preview_url: p.apercuEmpreinte ? urlDeLApercu(c, p.id) : null,
  work_session: p.chantier ? { id: p.chantier.id, intention: p.chantier.intention, opened_at: p.chantier.ouvertLe, last_change_at: p.chantier.dernierGesteLe } : null,
});

export async function listerLesProjets(c: Contexte): Promise<Rendu> {
  const l = await c.projets.lister(c.compte);
  return l.lu ? fait({ projects: l.valeur.map((p) => vueDuProjet(c, p)) }) : panne(l.pourquoi);
}

export async function creerUnProjet(c: Contexte, a: { app_json: unknown }): Promise<Rendu> {
  const m = leManifesteEnvoye(a.app_json);
  if (!m.ok) return m.refus;
  const p = await c.projets.creer(c.compte, m.valeur.nom, derive('app.json', m.valeur));
  if (!p.lu) return panne(p.pourquoi);
  const pose = await poserLaBase(c.base, p.valeur.id, m.valeur, c.compte);
  if (pose.posee) await c.projets.marquerLaBase(c.compte, p.valeur.id, m.valeur.nom);
  return fait({
    project: p.valeur.id, name: m.valeur.nom, version: 1,
    database: pose.posee ? 'laid out from app.json' : `not laid out: ${pose.motif}. Send app.json again with \`configure_backend\`.`,
    next: `Open a work session with \`ouvrir_chantier\`: it gives the API of the platform files you build on. Then read with \`read_files\`: ${CHEMINS_A_LIRE_ENTIERS.join(', ')}.`,
    ...regles('create_project'),
  });
}

export async function lEtatDuProjet(c: Contexte, a: { project: string }): Promise<Rendu> {
  const p = await leProjet(c, a.project);
  if (!p.ok) return p.refus;
  const f = await lesFichiers(c, a.project);
  if (!f.ok) return f.refus;
  const arbre = lArbreDUnProjet(f.valeur);
  const build = arbre.lu ? await c.projets.leBuild(c.compte, a.project, arbre.empreinte) : null;
  const ch = p.valeur.chantier;
  return fait({
    ...vueDuProjet(c, p.valeur),
    work_session: ch ? { id: ch.id, intention: ch.intention, opened_at: ch.ouvertLe, changes: ch.gestes, done: ch.fait, remaining: ch.reste } : null,
    database_laid_out_at: p.valeur.basePoseeLe,
    your_files: [...f.valeur].filter(([chemin]) => chemin !== 'app.json').map(([chemin, t]) => ({ path: chemin, fingerprint: empreinteMontree(t), size: t.length })),
    app_json: f.valeur.has('app.json') ? { fingerprint: empreinteMontree(f.valeur.get('app.json')!) } : null,
    platform_files: { read_whole: CHEMINS_A_LIRE_ENTIERS, api_of: CHEMINS_EN_FICHE, api: 'given by `ouvrir_chantier`', count: arbre.lu ? arbre.fige.size : 0 },
    current_build: !arbre.lu ? `app.json does not hold: ${arbre.erreurs.join(' | ')}`
      : !build || !build.lu ? 'unknown' : !build.valeur ? 'not built yet: run `build_preview`'
        : build.valeur.vert ? { green: true, draft_url: urlDuBrouillon(c, a.project, arbre.empreinte), published: p.valeur.apercuEmpreinte === arbre.empreinte }
          : { green: false, errors: build.valeur.ecarts },
  });
}

export async function lireDesFichiers(c: Contexte, a: { project: string; paths: readonly string[] }): Promise<Rendu> {
  const p = await leProjet(c, a.project);
  if (!p.ok) return p.refus;
  const f = await lesFichiers(c, a.project);
  if (!f.ok) return f.refus;
  const arbre = lArbreDUnProjet(f.valeur);
  let lus = 0;
  const files = a.paths.map((chemin) => {
    const platform = estFige(chemin) && chemin !== 'app.json';
    const texte = platform ? (arbre.lu ? arbre.fige.get(chemin) : undefined) : f.valeur.get(chemin);
    if (texte === undefined) return { path: chemin, missing: true };
    if (lus + texte.length > MAX_LU) return { path: chemin, not_sent: 'too much text in one call: read this file in another call' };
    lus += texte.length;
    return { path: chemin, fingerprint: empreinteMontree(texte), ...(platform ? { platform: true } : {}), content: texte };
  });
  return fait({ version: p.valeur.version, files });
}

export async function ouvrirUnChantier(c: Contexte, a: { project: string; intention: string; resume?: boolean }): Promise<Rendu> {
  const p = await leProjet(c, a.project);
  if (!p.ok) return p.refus;
  const o = await c.projets.ouvrirChantier(c.compte, a.project, a.intention, Boolean(a.resume));
  if (!o.lu) return panne(o.pourquoi);
  if (!o.valeur.ouvert) {
    const x = o.valeur.autre;
    return refuser('chantier_ouvert', `A work session is already open: "${x.intention}" (opened ${x.ouvertLe}, last change ${x.dernierGesteLe}). Call again with \`resume: true\` to continue it here, or abandon it with \`abandonner_chantier\`.`);
  }
  c.suivis.set(cleDe(c, a.project), { rouges: 0, envoyes: 0 });
  const ch = (await leProjet(c, a.project));
  const note = ch.ok && ch.valeur.chantier ? { done: ch.valeur.chantier.fait, remaining: ch.valeur.chantier.reste } : null;
  return fait({
    work_session: o.valeur.chantier, resumed: o.valeur.repris, version: p.valeur.version, ...(o.valeur.repris ? { notes: note } : {}),
    // Une fois par chantier : la fiche des fichiers de la plateforme, à la place de leur lecture entière.
    platform_api: laFiche(),
    next: `Read with \`read_files\` ${CHEMINS_A_LIRE_ENTIERS.join(', ')} and the files your change touches.`,
  });
}

/** Ramène l'arbre stocké à `cible` en une version (rollback, abandon), par `lib/versions` ; traduit en refus de Claude. */
async function ramener(c: Contexte, id: string, chantier: string, cible: ReadonlyMap<string, string>, pourquoi: string): Promise<Etape<{ version: number; base: string | null }>> {
  const r = await revenirA(c, id, chantier, cible, pourquoi);
  if (!r.revenu) {
    return bloque(r.pourquoi === 'panne' ? panne(r.detail) : r.pourquoi === 'conflit' ? refuser('conflit', 'The project changed while going back.', { fichiers: r.fichiers })
      : refuser('chantier_requis', 'The work session was closed.'));
  }
  const base = r.base === null ? null : r.base.posee ? 'laid out again from the restored app.json; the data stays' : `not laid out again: ${r.base.motif}`;
  return passe({ version: r.version, base });
}

export async function abandonnerLeChantier(c: Contexte, a: { project: string; work_session: string }): Promise<Rendu> {
  const p = await leChantier(c, a.project, a.work_session);
  if (!p.ok) return p.refus;
  const ch = p.valeur.chantier!;
  const depart = await c.projets.arbreA(c.compte, a.project, ch.versionDeDepart);
  if (!depart.lu) return panne(depart.pourquoi);
  const r = await ramener(c, a.project, ch.id, depart.valeur, `abandon : ${ch.intention}`);
  if (!r.ok) return r.refus;
  const ferme = await c.projets.fermerChantier(c.compte, a.project, ch.id, 'abandonne');
  if (!ferme.lu) return panne(ferme.pourquoi);
  return fait({ abandoned: ch.intention, back_to_version: ch.versionDeDepart, version: r.valeur.version, database: r.valeur.base });
}

export async function revenirAUneVersion(c: Contexte, a: { project: string; work_session: string; version: number; why: string }): Promise<Rendu> {
  const p = await leChantier(c, a.project, a.work_session);
  if (!p.ok) return p.refus;
  const cible = await c.projets.arbreA(c.compte, a.project, a.version);
  if (!cible.lu) return refuser('projet_inconnu', `Version ${a.version} cannot be read (${cible.pourquoi}). Call \`history\` for the versions of this project.`);
  const r = await ramener(c, a.project, a.work_session, cible.valeur, `retour à la version ${a.version} : ${a.why}`);
  if (!r.ok) return r.refus;
  return fait({ restored: a.version, version: r.valeur.version, database: r.valeur.base, next: 'Run `build_preview` and show the person the preview.' });
}

export async function lHistorique(c: Contexte, a: { project: string; limit?: number }): Promise<Rendu> {
  const v = await c.projets.versions(c.compte, a.project, Math.min(Math.max(a.limit ?? 20, 1), 100));
  if (!v.lu) return v.pourquoi === 'projet inconnu' ? refuser('projet_inconnu', `No project "${a.project}" in this account.`) : panne(v.pourquoi);
  return fait({ versions: v.valeur.map((x) => ({ version: x.numero, why: x.pourquoi, at: x.creeLe, written: x.ecrits, deleted: x.supprimes })) });
}

export interface Changement {
  readonly path: string;
  readonly read_fingerprint?: string;
  readonly content?: string;
  readonly replace?: readonly { readonly passage: string; readonly by: string }[];
  readonly delete?: boolean;
}

/** Le nouveau texte d'un fichier : le contenu donné, ou chaque passage remplacé, cité une fois exactement. PURE. */
export function leNouveauTexte(chemin: string, actuel: string | undefined, ch: Changement): { texte: string } | Refus {
  if (ch.content !== undefined) return { texte: ch.content };
  if (actuel === undefined) return refuser('passage_introuvable', `${chemin} does not exist: send its whole \`content\` to create it.`, { fichier: chemin });
  let texte = actuel;
  for (const r of ch.replace ?? []) {
    const premier = texte.indexOf(r.passage);
    if (premier < 0) return refuser('passage_introuvable', `This passage is not in ${chemin}: "${r.passage.slice(0, 120)}".`, { fichier: chemin });
    if (texte.indexOf(r.passage, premier + 1) >= 0) return refuser('passage_ambigu', `This passage appears more than once in ${chemin}: "${r.passage.slice(0, 120)}".`, { fichier: chemin, ligne: texte.slice(0, premier).split('\n').length });
    texte = texte.slice(0, premier) + r.by + texte.slice(premier + r.passage.length);
  }
  return { texte };
}

export async function appliquerDesChangements(c: Contexte, a: { project: string; work_session: string; why: string; changes: readonly Changement[]; remaining?: string }): Promise<Rendu> {
  const p = await leChantier(c, a.project, a.work_session);
  if (!p.ok) return p.refus;
  const f = await lesFichiers(c, a.project);
  if (!f.ok) return f.refus;
  const ecrits = new Map<string, string>();
  const supprimes: string[] = [];
  const attendus: Record<string, string | null> = {};
  let taille = 0;
  for (const ch of a.changes) {
    const formes = [ch.content !== undefined, (ch.replace?.length ?? 0) > 0, ch.delete === true].filter(Boolean).length;
    if (formes !== 1) return refuser('chemin_refuse', `${ch.path}: give exactly one of \`content\`, \`replace\` or \`delete\`.`, { fichier: ch.path, geste: 'Send each change with exactly one of `content`, `replace` or `delete`.' });
    if (ecrits.has(ch.path) || supprimes.includes(ch.path)) return refuser('chemin_refuse', `${ch.path} appears twice in this call.`, { fichier: ch.path, geste: 'Send one change per file.' });
    const refus = cheminRefuse(ch.path);
    if (refus) return refus;
    const actuel = f.valeur.get(ch.path);
    if (actuel !== undefined && !concorde(ch.read_fingerprint, actuel)) {
      return refuser('conflit', ch.read_fingerprint ? `${ch.path} changed since you read it.` : `${ch.path} already exists: give the \`read_fingerprint\` that \`read_files\` returned for it.`, { fichier: ch.path, fichiers: [ch.path] });
    }
    if (actuel === undefined && ch.read_fingerprint) return refuser('conflit', `${ch.path} no longer exists.`, { fichier: ch.path, fichiers: [ch.path] });
    // La base compare l'empreinte entière : celle du texte que Claude a lu, puisqu'elle concorde.
    attendus[ch.path] = actuel === undefined ? null : empreinteDuFichier(actuel);
    if (ch.delete) {
      if (actuel === undefined) return refuser('chemin_refuse', `${ch.path} does not exist: there is nothing to delete.`, { fichier: ch.path });
      supprimes.push(ch.path);
      continue;
    }
    const nouveau = leNouveauTexte(ch.path, actuel, ch);
    if ('refuse' in nouveau) return nouveau;
    const interdit = texteRefuse(c, ch.path, nouveau.texte);
    if (interdit) return interdit;
    taille += nouveau.texte.length;
    if (taille > MAX_ECRIT) return refuser('chemin_refuse', 'This call writes more than 2 MB of text.', { geste: 'Send the changes in several calls.' });
    ecrits.set(ch.path, nouveau.texte);
  }
  const r = await c.projets.appliquer(c.compte, a.project, { chantier: a.work_session, attendus, ecrits, supprimes, pourquoi: a.why });
  if (!r.lu) return panne(r.pourquoi);
  if (!r.valeur.applique) {
    return 'conflit' in r.valeur ? refuser('conflit', `Someone changed the project since you read it (now version ${r.valeur.version}).`, { fichiers: r.valeur.conflit })
      : refuser('chantier_requis', 'The work session was closed.');
  }
  if (a.remaining !== undefined) await c.projets.noterLeReste(c.compte, a.project, a.work_session, a.remaining);
  const gestes = p.valeur.chantier!.gestes + 1;
  return fait({
    version: r.valeur.version,
    written: [...ecrits].map(([chemin, t]) => ({ path: chemin, fingerprint: empreinteMontree(t) })),
    deleted: supprimes,
    next: 'Run `build_preview` to check the change.',
    // Le compteur : Claude peut dire à la personne où en est la conversation (jetons : ce que vavi a envoyé, estimé).
    session: { changes: `${gestes}/${GESTES_D_UNE_LONGUE_CONVERSATION}`, tokens_sent_by_vavi_estimate: jetonsEstimes(leSuivi(c, a.project).envoyes) },
    ...(gestes >= GESTES_D_UNE_LONGUE_CONVERSATION ? { long_conversation: LONGUE } : {}),
  });
}

export async function configurerLeBackend(c: Contexte, a: { project: string; work_session: string; app_json: unknown; read_fingerprint: string; why: string }): Promise<Rendu> {
  const p = await leChantier(c, a.project, a.work_session);
  if (!p.ok) return p.refus;
  const f = await lesFichiers(c, a.project);
  if (!f.ok) return f.refus;
  const actuel = f.valeur.get('app.json');
  if (actuel !== undefined && !concorde(a.read_fingerprint, actuel)) {
    return refuser('conflit', 'app.json changed since you read it.', { fichier: 'app.json', fichiers: ['app.json'] });
  }
  const m = leManifesteEnvoye(a.app_json);
  if (!m.ok) return m.refus;
  // La base d'abord : une déclaration que la base refuse n'entre pas dans le projet.
  const pose = await poserLaBase(c.base, a.project, m.valeur, c.compte);
  if (!pose.posee) {
    return pose.motif.startsWith('create_app_schema') ? panne(pose.motif)
      : refuser('app_json_refuse', `The database refused this declaration: ${pose.motif}`, { fichier: 'app.json' });
  }
  const texte = derive('app.json', m.valeur);
  const r = await c.projets.appliquer(c.compte, a.project, { chantier: a.work_session, attendus: { 'app.json': actuel === undefined ? null : empreinteDuFichier(actuel) },
    ecrits: new Map([['app.json', texte]]), supprimes: [], pourquoi: a.why });
  if (!r.lu) return panne(r.pourquoi);
  if (!r.valeur.applique) return 'conflit' in r.valeur ? refuser('conflit', 'app.json changed while the database was laid out.', { fichiers: r.valeur.conflit }) : refuser('chantier_requis', 'The work session was closed.');
  await c.projets.marquerLaBase(c.compte, a.project, m.valeur.nom);
  return fait({
    version: r.valeur.version, app_json: { fingerprint: empreinteMontree(texte) }, database: `laid out (${pose.groupes} steps); the access rules come from app.json`,
    next: 'The types of the tables changed: read src/donnees/types.ts again with `read_files` before using them.',
    ...regles('configure_backend'),
  });
}

export async function poserUnSecret(c: Contexte, a: { project: string; name: string; value: string }): Promise<Rendu> {
  const p = await leProjet(c, a.project);
  if (!p.ok) return p.refus;
  const r = await c.projets.poserUnSecret(c.compte, a.project, a.name, c.scellerUnSecret(a.project, a.name, a.value));
  // La valeur n'est jamais répétée : ni ici, ni au journal.
  return r.lu ? fait({ stored: a.name, note: 'The value is stored encrypted and is never shown again. The app reaches it only through its capabilities, on the server.', ...regles('set_secret') }) : panne(r.pourquoi);
}

const ligneDe = (fait: string): number | undefined => { const m = /ligne (\d+)/.exec(fait); return m ? Number(m[1]) : undefined; };
const TEXTES_DU_DIST = /\.(js|mjs|css|html|json|txt|map)$/;

export async function construireLApercu(c: Contexte, a: { project: string }): Promise<Rendu> {
  const p = await leProjet(c, a.project);
  if (!p.ok) return p.refus;
  if (!c.magasin) return refuser('plateforme_en_panne', 'The storage of the builds is not configured on this vavi server.');
  const f = await lesFichiers(c, a.project);
  if (!f.ok) return f.refus;
  const arbre = lArbreDUnProjet(f.valeur);
  if (!arbre.lu) return refuser('app_json_refuse', `app.json does not hold: ${arbre.erreurs.join(' | ')}`, { fichier: 'app.json' });
  const deja = await c.projets.leBuild(c.compte, a.project, arbre.empreinte);
  if (deja.lu && deja.valeur?.vert) {
    return fait({ green: true, draft_url: urlDuBrouillon(c, a.project, arbre.empreinte), fingerprint: arbre.empreinte, rebuilt: false,
      note: 'Nothing changed since the last green build.' });
  }
  // Des chemins relatifs : le même build sert l'aperçu, le brouillon et le site public (`poserLEnvironnement`).
  const b = await c.construire(arbre.construit, './');
  if (!b.construite) {
    await c.projets.enregistrerUnBuild(c.compte, a.project, { empreinte: arbre.empreinte, vert: false, ecarts: b.ecarts });
    const premier = b.ecarts[0];
    const liste = b.ecarts.slice(0, 15).map((e) => `${e.fichier ?? '?'}: ${e.fait}`).join(' | ');
    const suivi = leSuivi(c, a.project);
    suivi.rouges += 1;
    const rouge = refuser('build_rouge', `The build failed at the ${b.etape === 'types' ? 'type check' : b.etape === 'build' ? 'bundling' : 'installation of the packages'} (${b.ecarts.length} error(s)): ${liste}`,
      { ...(premier?.fichier ? { fichier: premier.fichier } : {}), ...(premier && ligneDe(premier.fait) ? { ligne: ligneDe(premier.fait) } : {}) });
    // Une boucle de réparation qui change d'erreur à chaque tour échappe au « même refus deux fois » : elle se compte.
    return suivi.rouges >= ROUGES_D_AFFILEE ? { ...rouge, arreter: laBoucle(suivi.rouges) } : rouge;
  }
  leSuivi(c, a.project).rouges = 0;
  for (const [chemin, octets] of b.dist) {
    if (!TEXTES_DU_DIST.test(chemin)) continue;
    const s = unSecretDans(octets.toString('utf8'));
    if (s) return refuser('secret_dans_le_code', `The built app would ship what looks like a secret (${s.sorte}) in ${chemin}.`, { fichier: chemin });
  }
  // Les pages publiques, rendues en visiteur, s'ajoutent au dist à côté de la coquille : lisibles sans JavaScript.
  const pre = await c.preRendre(a.project, b.dist, arbre.manifeste).catch((e: unknown) => ({ erreur: String((e as Error)?.message ?? e) }));
  const dist = pre && 'fichiers' in pre ? new Map([...b.dist, ...pre.fichiers]) : b.dist;
  try {
    await publierLeDist(c.magasin, racineDuBuild(a.project, arbre.empreinte), dist);
  } catch (e) {
    return refuser('plateforme_en_panne', `The build is green but could not be stored (${(e as Error).message}).`);
  }
  await c.projets.enregistrerUnBuild(c.compte, a.project, { empreinte: arbre.empreinte, vert: true, ecarts: [] });
  return fait({
    green: true, draft_url: urlDuBrouillon(c, a.project, arbre.empreinte), fingerprint: arbre.empreinte, duration_ms: b.duree,
    checked: 'types (tsc strict) and the build', not_checked: 'how the screens look and behave: ask the person to open the draft and check.',
    prerendered: pre === null ? 'skipped: no browser on this vavi server, public pages need JavaScript to be read'
      : 'erreur' in pre ? `failed: ${pre.erreur.slice(0, 200)}` : { pages: pre.gardees, not_kept: pre.ecartees },
    // Des avertissements, jamais un refus : ce que les pages publiques montrent au bureau et au téléphone.
    ...(pre && 'mesures' in pre && pre.mesures.length ? { screen_checks: { warnings: lesLignesDesMesures(pre.mesures), note: 'Measured on the public pages, as a visitor. Fix what matters to the person; these never block.' } } : {}),
  });
}

export async function publierLApercu(c: Contexte, a: { project: string; work_session: string }): Promise<Rendu> {
  const p = await leChantier(c, a.project, a.work_session);
  if (!p.ok) return p.refus;
  const f = await lesFichiers(c, a.project);
  if (!f.ok) return f.refus;
  const arbre = lArbreDUnProjet(f.valeur);
  if (!arbre.lu) return refuser('app_json_refuse', `app.json does not hold: ${arbre.erreurs.join(' | ')}`, { fichier: 'app.json' });
  const b = await c.projets.leBuild(c.compte, a.project, arbre.empreinte);
  if (!b.lu) return panne(b.pourquoi);
  if (!b.valeur) return refuser('build_perime', 'The current version of the project has not been built.');
  if (!b.valeur.vert) return refuser('build_rouge', 'The last build of the current version is red.');
  const pub = await c.projets.publierLApercu(c.compte, a.project, arbre.empreinte);
  if (!pub.lu) return panne(pub.pourquoi);
  const ferme = await c.projets.fermerChantier(c.compte, a.project, a.work_session, 'publie');
  if (!ferme.lu) return panne(ferme.pourquoi);
  return fait({
    preview_url: urlDeLApercu(c, a.project), work_session: 'closed',
    note: 'The preview now shows this version. It is not online for the public: only the person puts it online, with the Publish button of the vavi console.',
    ...regles('publish'),
  });
}

/** Le refus passe par la mémoire du compte et du projet : le même deux fois de suite porte l'ordre d'arrêter. */
export function seSouvenir(c: Contexte, projet: string | undefined, r: Rendu): Rendu {
  const cle = cleDe(c, projet);
  if (projet) leSuivi(c, projet).envoyes += JSON.stringify(r).length;
  if (!estUnRefus(r)) { c.refusPrecedents.delete(cle); return r; }
  const suite = suiteDeRefus(c.refusPrecedents.get(cle) ?? null, r);
  c.refusPrecedents.set(cle, r);
  if (c.refusPrecedents.size > 10_000) c.refusPrecedents.delete(c.refusPrecedents.keys().next().value!);
  return suite;
}
