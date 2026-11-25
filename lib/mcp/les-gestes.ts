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
import { lAdresseDeLApp } from '@/lib/publication/les-adresses-des-apps';
import { derive } from '@/squelette/poser';
import { lesFonctionsPasEncoreServies, ceQueClaudeEnFait } from '@/squelette/les-types-des-tables';
import { estFige, CHEMINS_MONTRES, POSES_PAR_UN_OUTIL } from '@/squelette/registre';
import { lireLeManifeste, type Manifeste } from '@/lib/backend/app/manifeste';
import { EXEMPLE_D_APP_JSON_TEXTE } from '@/lib/backend/app/l-exemple-d-app-json';
import { poserLaBase, type AppelDeLaBase } from '@/lib/relais/poser-la-base';
import type { Projets, Projet } from '@/lib/projets/les-projets';
import { empreinteDuFichier } from '@/lib/projets/les-empreintes';
import { MINUTES_DU_VERROU } from '@/lib/projets/le-sql-des-projets';
import type { Construction } from '@/lib/atelier/construire';
import type { Magasin } from '@/lib/publication/le-magasin';
import type { PreRendu } from '@/lib/seo/le-pre-rendu';
import { publierLeDist, racineDuBuild } from '@/lib/publication/publier';
import { refuser, suiteDeRefus, paquetInconnu, type Refus } from '@/lib/consignes';
import { estUnFichierDEnvironnement, unSecretDans } from './les-secrets';
import { connecteurDuSecret, PREFIXE_DU_SECRET } from '@/lib/connecteurs/les-connecteurs';
import { lArbreDUnProjet } from '@/lib/projets/l-arbre-d-un-projet';
import { revenirA } from '@/lib/versions/revenir';
import type { LecturesDeLaVue } from './les-gestes-de-la-vue';
import { leGuideDeDesign } from '@/lib/design/le-guide';
import { CHEMIN_DES_IMAGES, poserLesImages, type Banque, type DemandeDImage } from '@/lib/images/la-banque';
import { CHEMIN_DES_PAQUETS, PAQUETS_MAX, lesPaquetsAjoutes, leFichierDesPaquets, verifierAuRegistre } from '@/lib/paquets/les-paquets';

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
  /** Lance un travail après la réponse de l'outil (le pré-rendu) ; absent, l'outil l'attend (essais). */
  readonly enArrierePlan?: (nom: string, travail: () => Promise<void>) => void;
  /** Les paquets du gabarit verrouillé. */
  readonly permis: readonly string[];
  /** L'adresse publique de la plateforme, sans barre finale. */
  readonly adresse: string;
  /** Le domaine des apps (`VAVI_DOMAINE_DES_APPS`) : l'aperçu y a son hôte ; absent, il est servi sous `/p/` de la console. */
  readonly domaineDesApps?: string | null;
  readonly scellerUnSecret: (projet: string, nom: string, valeur: string) => string;
  /** Le dernier refus rendu, par compte et projet : le même deux fois de suite dit d'arrêter. */
  readonly refusPrecedents: Map<string, Refus>;
  /** L'abonnement du compte, tel que Claude le lit (l'offre, ce qu'elle publie, où la choisir) ; absent : non dit. */
  readonly abonnement?: () => Promise<Record<string, unknown> | null>;
  /** Ce que la vue de vavi dans Claude lit en plus (messages, visites, droit de publier) ; absent : « — ». */
  readonly vue?: LecturesDeLaVue;
  /** La banque de photos de la plateforme (`UNSPLASH_ACCESS_KEY`) ; absente : `search_images` le dit. */
  readonly banque?: Banque | null;
  /** L'appel au registre npm (`add_packages`) ; absent : `fetch`. Les essais passent un faux registre. */
  readonly registre?: typeof fetch;
}

export type Rendu = { readonly ok: true; readonly [champ: string]: unknown } | Refus;
const fait = (x: Record<string, unknown>): Rendu => ({ ok: true, ...x });
export const estUnRefus = (r: Rendu): r is Refus => (r as Refus).refuse === true;

/** Au-delà, la conversation est longue : l'outil le dit, et Claude propose « Reprendre » dans une nouvelle. */
export const GESTES_D_UNE_LONGUE_CONVERSATION = 40;
const LONGUE = 'This work session is getting long. Propose to the person to continue in a new conversation with the "Resume" prompt: vavi keeps the session notes.';
const MAX_ECRIT = 2_000_000;
const MAX_LU = 400_000;

const urlDeLApercu = (c: Contexte, id: string): string => lAdresseDeLApp(id, 'apercu', { console: c.adresse, domaine: c.domaineDesApps ?? null });
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
export function cheminRefuse(chemin: string, pourSupprimer = false): Refus | null {
  const parts = chemin.split('/');
  if (chemin.startsWith('/') || chemin.includes('\\') || chemin.includes('\0') || parts.some((p) => p === '' || p === '.' || p === '..')
    || chemin.length > 300 || parts[0] === 'node_modules' || parts[0] === 'dist') {
    return refuser('chemin_refuse', `"${chemin}" is not a path inside the project.`, { fichier: chemin });
  }
  if (chemin === 'app.json') return refuser('fichier_du_cadre', 'app.json is written only by `configure_backend`, which also lays out the database.', { fichier: chemin });
  if ((POSES_PAR_UN_OUTIL as readonly string[]).includes(chemin)) return refuser('fichier_du_cadre', `${chemin} is written by a vavi tool (photos: \`search_images\`, packages: \`add_packages\`) or the console (search settings), not by you.`, { fichier: chemin });
  if (estFige(chemin)) return refuser('fichier_du_cadre', `${chemin} belongs to the platform: it comes from the template or from app.json. Read it with \`read_files\`; write your own file next to it. To change the data, use \`configure_backend\`.`, { fichier: chemin });
  if (estUnFichierDEnvironnement(chemin)) return refuser('secret_dans_le_code', `${chemin} is an environment file: secrets are stored with \`set_secret\`, never in a file.`, { fichier: chemin });
  if (!pourSupprimer && !dansLePerimetre(chemin)) {
    return refuser('chemin_refuse', `"${chemin}" is outside src/ and public/: the build only takes your screens, code and assets from there (a configuration file at the root would run on the build server).`, { fichier: chemin, geste: 'Write this file under src/ (code, styles) or public/ (images, fonts, static files).' });
  }
  return null;
}

/** Ce que Claude écrit vit sous `src/` ou `public/` : la racine (configurations que Vite, PostCSS, Babel chargent et
 * exécutent d'eux-mêmes) appartient au gabarit. Vague 0, audit du 24/11 : un `postcss.config.cjs` posé à la racine
 * s'exécutait au build. */
export const dansLePerimetre = (chemin: string): boolean => /^(src|public)\/./.test(chemin);

/** Ce qu'un texte ne doit pas porter : une clé secrète, un paquet ni du gabarit ni ajouté par `add_packages`. */
function texteRefuse(permis: readonly string[], chemin: string, texte: string): Refus | null {
  const secret = unSecretDans(texte);
  if (secret) return refuser('secret_dans_le_code', `${chemin} contains what looks like a secret (${secret.sorte}).`, { fichier: chemin, ligne: secret.ligne });
  return /\.(tsx?|jsx?|mjs)$/.test(chemin) ? paquetInconnu(chemin, texte, permis) : null;
}

/** Les paquets qu'une page de CE projet peut importer : ceux du gabarit, plus ceux qu'`add_packages` a vérifiés. */
const lesPermisDuProjet = (c: Contexte, fichiers: ReadonlyMap<string, string>): readonly string[] =>
  [...c.permis, ...Object.keys(lesPaquetsAjoutes(fichiers.get(CHEMIN_DES_PAQUETS)))];

/** Ce que l'outil dit de plus quand il reçoit app.json : ce qu'il a ajusté, ce que vavi ne sert pas encore. */
interface Recu { readonly manifeste: Manifeste; readonly dit: Record<string, unknown> }

/**
 * app.json tel que Claude l'envoie. Ce que la lecture du manifeste sait ajuster sans rien perdre du sens (un lien en
 * double, un exemple qui ne nomme rien, une transition que la base tient déjà) est ajusté et DIT (`adjusted`) : app.json
 * est de toute façon réécrit par vavi depuis le manifeste lu (`derive`), et Claude ne refait pas un tour pour écrire ce que
 * vavi sait déjà (décision d'Antoine : réparer plutôt que refuser ; 25/11 : « une modification ne doit jamais être
 * refusée »). Seul ce qui n'a pas de sens est refusé, chaque écart dit.
 */
function leManifesteEnvoye(brut: unknown): Etape<Recu> {
  let json = brut;
  if (typeof brut === 'string') {
    try { json = JSON.parse(brut); } catch (e) { return bloque(refuser('app_json_refuse', `app.json is not valid JSON: ${(e as Error).message}.`, { fichier: 'app.json' })); }
  }
  const r = lireLeManifeste(json);
  // La forme attendue, entière, avec le refus : Claude corrige d'après elle, sans lire un autre projet (essai du 25/11).
  if (!r.ok) return bloque(refuser('app_json_refuse', `app.json does not hold: ${r.erreurs.slice(0, 20).join(' | ')}`, { fichier: 'app.json',
    geste: `Fix app.json at the places given in \`fait\`, then send it whole again. A complete valid app.json, to follow for its shape (never read another project of the person for it): ${EXEMPLE_D_APP_JSON_TEXTE}` }));
  const pasEncore = lesFonctionsPasEncoreServies(r.manifeste);
  return passe({ manifeste: r.manifeste, dit: {
    ...(r.repare.length ? { adjusted: `vavi adjusted app.json (nothing else to do): ${r.repare.join(' | ')}` } : {}),
    ...(pasEncore.length ? { not_available_yet: ceQueClaudeEnFait(pasEncore) } : {}),
  } });
}

/* ── Les gestes ────────────────────────────────────────────────────────── */

const vueDuProjet = (c: Contexte, p: Projet) => ({
  id: p.id, name: p.nom, version: p.version, modified_at: p.modifieLe,
  preview_url: p.apercuEmpreinte ? urlDeLApercu(c, p.id) : null,
  work_session: p.chantier ? { id: p.chantier.id, intention: p.chantier.intention, opened_at: p.chantier.ouvertLe, last_change_at: p.chantier.dernierGesteLe } : null,
});

export async function listerLesProjets(c: Contexte): Promise<Rendu> {
  const l = await c.projets.lister(c.compte);
  if (!l.lu) return panne(l.pourquoi);
  const plan = c.abonnement ? await c.abonnement() : null;
  return fait({ projects: l.valeur.map((p) => vueDuProjet(c, p)), ...(plan ? { plan } : {}) });
}

export async function creerUnProjet(c: Contexte, a: { app_json: unknown }): Promise<Rendu> {
  const recu = leManifesteEnvoye(a.app_json);
  if (!recu.ok) return recu.refus;
  const m = recu.valeur.manifeste;
  const p = await c.projets.creer(c.compte, m.nom, derive('app.json', m));
  if (!p.lu) return panne(p.pourquoi);
  const pose = await poserLaBase(c.base, p.valeur.id, m, c.compte);
  if (pose.posee) await c.projets.marquerLaBase(c.compte, p.valeur.id, m.nom);
  return fait({
    project: p.valeur.id, name: m.nom, version: 1, ...recu.valeur.dit,
    database: pose.posee ? 'laid out from app.json' : `not laid out: ${pose.motif}. Send app.json again with \`configure_backend\`.`,
    next: `Open a work session with \`ouvrir_chantier\`, then read with \`read_files\` the platform files you build on: ${CHEMINS_MONTRES.join(', ')}.`,
  });
}

/**
 * Ce que Claude fait d'un chantier qu'il trouve ouvert (INCIDENT 25/11, Cap Équipage : Claude demandait à la personne s'il
 * pouvait reprendre « la session de l'autre conversation », alors que le projet est le sien et que ce chantier dormait
 * depuis une heure). Un chantier est celui de la personne : il se reprend sans question, ses notes avec lui. PURE.
 */
export function commentContinuer(dernierGesteLe: string, maintenant: number): string {
  const minutes = Math.max(0, Math.round((maintenant - Date.parse(dernierGesteLe)) / 60_000));
  return minutes >= MINUTES_DU_VERROU
    ? `Idle for ${minutes} min, so released: call \`ouvrir_chantier\` with \`resume: true\` to continue it with its notes, or with a new intention. Nothing to ask the person.`
    : `Last change ${minutes} min ago, perhaps from another conversation of the same person. If the person asks you to work on this project here, call \`ouvrir_chantier\` with \`resume: true\`; ask them only if their request contradicts its intention.`;
}

export async function lEtatDuProjet(c: Contexte, a: { project: string }): Promise<Rendu> {
  const p = await leProjet(c, a.project);
  if (!p.ok) return p.refus;
  const f = await lesFichiers(c, a.project);
  if (!f.ok) return f.refus;
  const arbre = lArbreDUnProjet(f.valeur);
  const build = arbre.lu ? await c.projets.leBuild(c.compte, a.project, arbre.empreinte) : null;
  const ch = p.valeur.chantier;
  const plan = c.abonnement ? await c.abonnement() : null;
  // Les connecteurs branchés par la personne, par leur nom seul (ce que la page passe à `capacites.connecteur.appeler`).
  const secrets = await c.projets.nomsDesSecrets(c.compte, a.project);
  const connecteurs = secrets.lu ? secrets.valeur.map(connecteurDuSecret).filter((n): n is string => n !== null) : null;
  return fait({
    ...vueDuProjet(c, p.valeur),
    ...(plan ? { plan } : {}),
    connectors: connecteurs ?? 'unknown',
    work_session: ch ? { id: ch.id, intention: ch.intention, opened_at: ch.ouvertLe, last_change_at: ch.dernierGesteLe, changes: ch.gestes, done: ch.fait, remaining: ch.reste,
      how_to_continue: commentContinuer(ch.dernierGesteLe, Date.now()) } : null,
    database_laid_out_at: p.valeur.basePoseeLe,
    your_files: [...f.valeur].filter(([chemin]) => chemin !== 'app.json').map(([chemin, t]) => ({ path: chemin, fingerprint: empreinteDuFichier(t), size: t.length })),
    app_json: f.valeur.has('app.json') ? { fingerprint: empreinteDuFichier(f.valeur.get('app.json')!) } : null,
    platform_files: { read_first: CHEMINS_MONTRES, all: arbre.lu ? [...arbre.fige.keys()] : [] },
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
    // Ce qu'un outil pose pour l'app (ses photos, son référencement) se lit tel qu'il est posé, sinon le fichier vide du cadre.
    const pose = (POSES_PAR_UN_OUTIL as readonly string[]).includes(chemin) ? f.valeur.get(chemin) : undefined;
    const texte = platform ? (pose ?? (arbre.lu ? arbre.fige.get(chemin) : undefined)) : f.valeur.get(chemin);
    if (texte === undefined) return { path: chemin, missing: true };
    if (lus + texte.length > MAX_LU) return { path: chemin, not_sent: 'too much text in one call: read this file in another call' };
    lus += texte.length;
    return { path: chemin, fingerprint: empreinteDuFichier(texte), ...(platform ? { platform: true } : {}), content: texte };
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
  const ch = (await leProjet(c, a.project));
  const note = ch.ok && ch.valeur.chantier ? { done: ch.valeur.chantier.fait, remaining: ch.valeur.chantier.reste } : null;
  return fait({ work_session: o.valeur.chantier, resumed: o.valeur.repris, version: p.valeur.version, ...(o.valeur.repris ? { notes: note } : {}) });
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
  const permis = lesPermisDuProjet(c, f.valeur);
  for (const ch of a.changes) {
    const formes = [ch.content !== undefined, (ch.replace?.length ?? 0) > 0, ch.delete === true].filter(Boolean).length;
    if (formes !== 1) return refuser('chemin_refuse', `${ch.path}: give exactly one of \`content\`, \`replace\` or \`delete\`.`, { fichier: ch.path, geste: 'Send each change with exactly one of `content`, `replace` or `delete`.' });
    if (ecrits.has(ch.path) || supprimes.includes(ch.path)) return refuser('chemin_refuse', `${ch.path} appears twice in this call.`, { fichier: ch.path, geste: 'Send one change per file.' });
    const refus = cheminRefuse(ch.path, ch.delete === true);
    if (refus) return refus;
    const actuel = f.valeur.get(ch.path);
    if (actuel !== undefined && ch.read_fingerprint !== empreinteDuFichier(actuel)) {
      return refuser('conflit', ch.read_fingerprint ? `${ch.path} changed since you read it.` : `${ch.path} already exists: give the \`read_fingerprint\` that \`read_files\` returned for it.`, { fichier: ch.path, fichiers: [ch.path] });
    }
    if (actuel === undefined && ch.read_fingerprint) return refuser('conflit', `${ch.path} no longer exists.`, { fichier: ch.path, fichiers: [ch.path] });
    attendus[ch.path] = actuel === undefined ? null : ch.read_fingerprint!;
    if (ch.delete) {
      if (actuel === undefined) return refuser('chemin_refuse', `${ch.path} does not exist: there is nothing to delete.`, { fichier: ch.path });
      supprimes.push(ch.path);
      continue;
    }
    const nouveau = leNouveauTexte(ch.path, actuel, ch);
    if ('refuse' in nouveau) return nouveau;
    const interdit = texteRefuse(permis, ch.path, nouveau.texte);
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
    written: [...ecrits].map(([chemin, t]) => ({ path: chemin, fingerprint: empreinteDuFichier(t) })),
    deleted: supprimes,
    next: 'Run `build_preview` to check the change.',
    ...(gestes >= GESTES_D_UNE_LONGUE_CONVERSATION ? { long_conversation: LONGUE } : {}),
  });
}

export async function configurerLeBackend(c: Contexte, a: { project: string; work_session: string; app_json: unknown; read_fingerprint: string; why: string }): Promise<Rendu> {
  const p = await leChantier(c, a.project, a.work_session);
  if (!p.ok) return p.refus;
  const f = await lesFichiers(c, a.project);
  if (!f.ok) return f.refus;
  const actuel = f.valeur.get('app.json');
  if (actuel !== undefined && a.read_fingerprint !== empreinteDuFichier(actuel)) {
    return refuser('conflit', 'app.json changed since you read it.', { fichier: 'app.json', fichiers: ['app.json'] });
  }
  const recu = leManifesteEnvoye(a.app_json);
  if (!recu.ok) return recu.refus;
  const m = recu.valeur.manifeste;
  // La base d'abord : une déclaration que la base refuse n'entre pas dans le projet.
  const pose = await poserLaBase(c.base, a.project, m, c.compte);
  if (!pose.posee) {
    return pose.motif.startsWith('create_app_schema') ? panne(pose.motif)
      : refuser('app_json_refuse', `The database refused this declaration: ${pose.motif}`, { fichier: 'app.json' });
  }
  const texte = derive('app.json', m);
  const r = await c.projets.appliquer(c.compte, a.project, { chantier: a.work_session, attendus: { 'app.json': actuel === undefined ? null : a.read_fingerprint },
    ecrits: new Map([['app.json', texte]]), supprimes: [], pourquoi: a.why });
  if (!r.lu) return panne(r.pourquoi);
  if (!r.valeur.applique) return 'conflit' in r.valeur ? refuser('conflit', 'app.json changed while the database was laid out.', { fichiers: r.valeur.conflit }) : refuser('chantier_requis', 'The work session was closed.');
  await c.projets.marquerLaBase(c.compte, a.project, m.nom);
  return fait({
    ...recu.valeur.dit,
    version: r.valeur.version, app_json: { fingerprint: empreinteDuFichier(texte) }, database: `laid out (${pose.groupes} steps); the access rules come from app.json`,
    next: 'The types of the tables changed: read src/donnees/types.ts again with `read_files` before using them.',
  });
}

/**
 * Le guide de design de l'app (`lib/design/le-guide`) : ce que les pages doivent être et les règles qui la concernent, en
 * mots seuls. INCIDENT 25/11 (essai « Thème astral ») : le guide joignait des captures (des sites de marque, un projet
 * généré par constructor), que Claude.ai montrait à la personne en vignettes ; Claude conçoit seul (Antoine, 25/11 15h30).
 */
export async function leGuideDuDesign(c: Contexte, a: { project: string }): Promise<Rendu> {
  const p = await leProjet(c, a.project);
  if (!p.ok) return p.refus;
  const f = await lesFichiers(c, a.project);
  if (!f.ok) return f.refus;
  const arbre = lArbreDUnProjet(f.valeur);
  if (!arbre.lu) return refuser('app_json_refuse', `app.json does not hold: ${arbre.erreurs.join(' | ')}`, { fichier: 'app.json' });
  const g = leGuideDeDesign(arbre.manifeste);
  return fait({ guide: g.guide, rules: g.regles.map((r) => r.texte) });
}

/**
 * Des photos réelles pour l'app : la banque de la plateforme cherche chaque sujet, la photo retenue est posée sous son nom
 * dans `src/images.json` (que Claude n'écrit pas), en une version ; une page la montre par `<Photo nom="…" />`.
 */
export async function chercherDesImages(c: Contexte, a: { project: string; work_session: string; images: readonly { name: string; subject: string; alt: string }[] }): Promise<Rendu> {
  const p = await leChantier(c, a.project, a.work_session);
  if (!p.ok) return p.refus;
  if (!c.banque) return refuser('plateforme_en_panne', 'No photo bank is plugged into this vavi server yet.', { geste: 'Write the pages without photos for now (a drawing, a colour block), and tell the person photos will come.' });
  const f = await lesFichiers(c, a.project);
  if (!f.ok) return f.refus;
  const actuel = f.valeur.get(CHEMIN_DES_IMAGES);
  const demandes: DemandeDImage[] = a.images.map((x) => ({ nom: x.name, sujet: x.subject, alt: x.alt }));
  const r = await poserLesImages(actuel, demandes, c.banque).catch((e: unknown) => ({ erreur: String((e as Error)?.message ?? e).slice(0, 200) }));
  if ('erreur' in r) return refuser('plateforme_en_panne', `The photo bank did not answer (${r.erreur}).`, { geste: 'Try again in a moment, or write the page without photos.' });
  if (r.texte === null) return fait({ images: r.dits, written: false });
  const w = await c.projets.appliquer(c.compte, a.project, { chantier: a.work_session, attendus: { [CHEMIN_DES_IMAGES]: actuel === undefined ? null : empreinteDuFichier(actuel) },
    ecrits: new Map([[CHEMIN_DES_IMAGES, r.texte]]), supprimes: [], pourquoi: 'photos chosen for the pages' });
  if (!w.lu) return panne(w.pourquoi);
  if (!w.valeur.applique) return 'conflit' in w.valeur ? refuser('conflit', 'The photos changed while they were searched.', { fichiers: w.valeur.conflit }) : refuser('chantier_requis', 'The work session was closed.');
  return fait({ version: w.valeur.version, images: r.dits, next: 'Show each set photo with `<Photo nom="…" />` from `@/briques/Photo` (a name not set does not compile), then run `build_preview`.' });
}

/**
 * Des paquets npm pour l'app (décision d'Antoine du 25/11 : « Ouverts, vérifiés au build ») : chacun vérifié au registre
 * (existe, version exacte, non déprécié, sans script d'installation, de taille bornée), puis posé dans
 * `vavi-paquets.json` (que Claude n'écrit pas), en une version ; le build l'installe sans scripts, hors du bac à sable.
 * Remplace le refus `paquet_inconnu` de tout paquet hors du gabarit.
 */
export async function ajouterDesPaquets(c: Contexte, a: { project: string; work_session: string; packages: readonly { name: string; version?: string }[] }): Promise<Rendu> {
  const p = await leChantier(c, a.project, a.work_session);
  if (!p.ok) return p.refus;
  const f = await lesFichiers(c, a.project);
  if (!f.ok) return f.refus;
  const actuel = f.valeur.get(CHEMIN_DES_PAQUETS);
  const deja = lesPaquetsAjoutes(actuel);
  const v = await verifierAuRegistre(a.packages, c.permis, c.registre ?? fetch);
  if (!v.lu) return refuser('paquet_inconnu', v.pourquoi, { geste: 'Choose another package (pure JavaScript, maintained), or another exact version, and call `add_packages` again; or build that part yourself.' });
  const tous = { ...deja, ...v.valeur };
  if (Object.keys(tous).length > PAQUETS_MAX) return refuser('paquet_inconnu', `An app holds at most ${PAQUETS_MAX} added packages (it would have ${Object.keys(tous).length}).`, { geste: 'Build the smaller parts yourself instead of adding a package for each.' });
  const dejaDansLeGabarit = a.packages.map((x) => x.name.trim().toLowerCase()).filter((n) => c.permis.includes(n));
  const dit = { added: v.valeur, ...(dejaDansLeGabarit.length ? { already_in_the_template: dejaDansLeGabarit } : {}) };
  const texte = leFichierDesPaquets(tous);
  if (texte === actuel || Object.keys(v.valeur).length === 0) return fait({ ...dit, written: false, next: 'Import them in your pages, then run `build_preview`.' });
  const w = await c.projets.appliquer(c.compte, a.project, { chantier: a.work_session, attendus: { [CHEMIN_DES_PAQUETS]: actuel === undefined ? null : empreinteDuFichier(actuel) },
    ecrits: new Map([[CHEMIN_DES_PAQUETS, texte]]), supprimes: [], pourquoi: `packages added: ${Object.entries(v.valeur).map(([n, x]) => `${n}@${x}`).join(', ')}` });
  if (!w.lu) return panne(w.pourquoi);
  if (!w.valeur.applique) return 'conflit' in w.valeur ? refuser('conflit', 'The packages changed while they were checked.', { fichiers: w.valeur.conflit }) : refuser('chantier_requis', 'The work session was closed.');
  return fait({ version: w.valeur.version, ...dit, next: 'Import them in your pages (their types come with them, or write a small `declare module` in src/), then run `build_preview`. The build installs them without install scripts.' });
}

export async function poserUnSecret(c: Contexte, a: { project: string; name: string; value: string }): Promise<Rendu> {
  const p = await leProjet(c, a.project);
  if (!p.ok) return p.refus;
  // Un connecteur (son adresse, sa clé) ne se branche que dans la console, par la personne : jamais une adresse choisie ici.
  if (a.name.startsWith(PREFIXE_DU_SECRET)) {
    return refuser('confirmation_requise', `A connector is plugged in by the person in the vavi console: ${c.adresse}/projets/${a.project}/connecteurs. The page then calls \`capacites.connecteur.appeler('<name>', { chemin })\`.`);
  }
  const r = await c.projets.poserUnSecret(c.compte, a.project, a.name, c.scellerUnSecret(a.project, a.name, a.value));
  // La valeur n'est jamais répétée : ni ici, ni au journal.
  return r.lu ? fait({ stored: a.name, note: 'The value is stored encrypted and is never shown again. The app reaches it only through its capabilities, on the server.' }) : panne(r.pourquoi);
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
  // Un fichier hors de src/ et public/, écrit avant la vague 0, n'entre jamais dans un build : Claude le retire.
  const dehors = [...f.valeur.keys()].filter((ch) => ch !== 'app.json' && !estFige(ch) && !dansLePerimetre(ch));
  if (dehors.length) {
    return refuser('chemin_refuse', `These files are outside src/ and public/ and cannot be built: ${dehors.slice(0, 20).join(', ')}.`,
      { fichier: dehors[0]!, fichiers: dehors.slice(0, 20), geste: 'Move their content under src/ or public/ if you need it, then delete them with `apply_changes` (`delete: true`).' });
  }
  const deja = await c.projets.leBuild(c.compte, a.project, arbre.empreinte);
  if (deja.lu && deja.valeur?.vert) {
    const designe = await c.projets.publierLApercu(c.compte, a.project, arbre.empreinte);
    return fait({ project: a.project, green: true, preview_url: urlDeLApercu(c, a.project), draft_url: urlDuBrouillon(c, a.project, arbre.empreinte), fingerprint: arbre.empreinte, rebuilt: false,
      preview_updated: designe.lu, note: 'Nothing changed since the last green build.' });
  }
  // Des chemins relatifs : le même build sert l'aperçu, le brouillon et le site public (`poserLEnvironnement`).
  const b = await c.construire(arbre.construit, './');
  if (!b.construite && b.etape === 'bac_a_sable') {
    console.error(`[build] bac à sable fermé : ${b.ecarts[0]?.fait ?? ''}`);
    return refuser('plateforme_en_panne', 'The isolated build environment could not start on this vavi server; nothing was built. This is not caused by your files.');
  }
  if (!b.construite) {
    await c.projets.enregistrerUnBuild(c.compte, a.project, { empreinte: arbre.empreinte, vert: false, ecarts: b.ecarts });
    const premier = b.ecarts[0];
    const liste = b.ecarts.slice(0, 15).map((e) => `${e.fichier ?? '?'}: ${e.fait}`).join(' | ');
    return refuser('build_rouge', `The build failed at the ${b.etape === 'types' ? 'type check' : b.etape === 'build' ? 'bundling' : 'installation of the packages'} (${b.ecarts.length} error(s)): ${liste}`,
      { ...(premier?.fichier ? { fichier: premier.fichier } : {}), ...(premier && ligneDe(premier.fait) ? { ligne: ligneDe(premier.fait) } : {}) });
  }
  for (const [chemin, octets] of b.dist) {
    if (!TEXTES_DU_DIST.test(chemin)) continue;
    const s = unSecretDans(octets.toString('utf8'));
    if (s) return refuser('secret_dans_le_code', `The built app would ship what looks like a secret (${s.sorte}) in ${chemin}.`, { fichier: chemin });
  }
  // Les pages publiques, rendues en visiteur, s'ajoutent au dist à côté de la coquille : lisibles sans JavaScript. Ce
  // rendu ne sert qu'aux moteurs de recherche, et l'aperçu n'est jamais référencé : sur le serveur, il se fait APRÈS la
  // réponse (25/11 : « le succès passe aussi par la rapidité »), et ses pages rejoignent le même build. Le temps de chaque
  // étape est dit.
  const racine = racineDuBuild(a.project, arbre.empreinte);
  const magasin = c.magasin;
  const preRendre = async () => {
    const pre = await c.preRendre(a.project, b.dist, arbre.manifeste).catch((e: unknown) => ({ erreur: String((e as Error)?.message ?? e) }));
    if (pre && 'fichiers' in pre && pre.fichiers.size > 0) await publierLeDist(magasin, racine, new Map([...b.dist, ...pre.fichiers]));
    return pre;
  };
  const t0 = Date.now();
  let pre: Awaited<ReturnType<typeof preRendre>> | 'en_fond' = 'en_fond';
  try {
    await publierLeDist(magasin, racine, b.dist);
    if (c.enArrierePlan) {
      c.enArrierePlan(`pré-rendu ${a.project}`, async () => {
        const t = Date.now(); const r = await preRendre();
        console.log(`[build_preview] ${a.project} pré-rendu ${Date.now() - t} ms${r && 'erreur' in r ? ` : ${r.erreur.slice(0, 200)}` : ''}`);
      });
    } else pre = await preRendre();
  } catch (e) {
    return refuser('plateforme_en_panne', `The build is green but could not be stored (${(e as Error).message}).`);
  }
  const temps = { build: b.duree, store: Date.now() - t0 };
  console.log(`[build_preview] ${a.project} build ${temps.build} ms, envoi ${temps.store} ms`);
  await c.projets.enregistrerUnBuild(c.compte, a.project, { empreinte: arbre.empreinte, vert: true, ecarts: [] });
  // Un build vert DEVIENT l'aperçu (24/11, retour d'Antoine : la console disait « pas encore d'aperçu » après un build
  // vert) : la console et le lien montrent la dernière version qui se construit ; `publish` ferme le chantier.
  const designe = await c.projets.publierLApercu(c.compte, a.project, arbre.empreinte);
  return fait({
    project: a.project, green: true, preview_url: urlDeLApercu(c, a.project), draft_url: urlDuBrouillon(c, a.project, arbre.empreinte), fingerprint: arbre.empreinte, duration_ms: b.duree, timings_ms: temps,
    preview_updated: designe.lu,
    next: 'When the person’s request is done, call `publish` to close the work session: until then the person cannot change texts or appearance in the console.',
    checked: 'types (tsc strict) and the build', not_checked: 'how the screens look and behave: ask the person to open the preview and check.',
    prerendered: pre === 'en_fond' ? 'running in the background: the public pages are rendered for search engines after this answer'
      : pre === null ? 'skipped: no browser on this vavi server, public pages need JavaScript to be read'
        : 'erreur' in pre ? `failed: ${pre.erreur.slice(0, 200)}` : { pages: pre.gardees, not_kept: pre.ecartees },
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
    project: a.project, preview_url: urlDeLApercu(c, a.project), work_session: 'closed',
    note: 'The work session is closed; the preview shows this version. It is not online for the public: only the person puts it online, with the Publish button.',
  });
}

/** Le refus passe par la mémoire du compte et du projet : le même deux fois de suite porte l'ordre d'arrêter. */
export function seSouvenir(c: Contexte, projet: string | undefined, r: Rendu): Rendu {
  const cle = `${c.compte}|${projet ?? ''}`;
  if (!estUnRefus(r)) { c.refusPrecedents.delete(cle); return r; }
  const suite = suiteDeRefus(c.refusPrecedents.get(cle) ?? null, r);
  c.refusPrecedents.set(cle, r);
  if (c.refusPrecedents.size > 10_000) c.refusPrecedents.delete(c.refusPrecedents.keys().next().value!);
  return suite;
}
