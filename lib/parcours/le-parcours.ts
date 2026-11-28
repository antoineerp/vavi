/**
 * LE PARCOURS D'UN VISITEUR — Claude essaie l'app comme un visiteur, pas seulement la regarde (Antoine, 26/11, « Les trois
 * étapes » ; étape 2 : sans compte).
 *
 * Remplace, pour la voie MCP, les « marches » de constructor-v13 (entrer, cliquer, envoyer, jouées par l'oracle) : ici
 * c'est Claude qui décrit les étapes, et vavi les joue dans le navigateur du serveur sur le build vert servi par le
 * magasin. Un fait par étape : réussie, ou arrêtée avec sa raison (rien à cliquer, texte jamais affiché, erreur de la
 * page) et une capture de l'endroit. Jamais un refus : Claude lit et corrige au tour.
 *
 * Sans compte, RIEN N'EST ÉCRIT. Les écritures de la base (`voie_neuve_creer`, `_modifier`, `_supprimer`, `_appeler`) et l'envoi d'un
 * formulaire sont SIMULÉS : la page reçoit une réponse de succès, et le parcours dit ce qui aurait été écrit ou envoyé.
 * Les lectures passent (en visiteur, sous la RLS). Avec un compte (`la-copie.ts`, étape 3), le parcours tourne sur une
 * copie temporaire de la base, connecté au rôle demandé ou sans compte pour s'y inscrire, et ses écritures y sont réelles ;
 * l'inscription, la connexion et le panier y sont joués pour de vrai, le paiement simulé (`la-plateforme-de-la-copie.ts`).
 * Hors copie, les routes de la plateforme répondent « indisponible », et c'est dit. Même clôture du réseau que le pré-rendu, plus les images des hôtes de photos.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import { leDepotDuCorps } from './la-plateforme-de-la-copie';

export const BASE_DU_PARCOURS = '/__vavi_base__/';
export const ETAPES_MAX = 25;
const ATTENTE_MS = 5_000;

export type Etape =
  | { readonly action: 'open'; readonly path: string }
  | { readonly action: 'click'; readonly target: string }
  | { readonly action: 'fill'; readonly target: string; readonly value: string }
  | { readonly action: 'select'; readonly target: string; readonly value: string }
  | { readonly action: 'check'; readonly target: string }
  | { readonly action: 'expect'; readonly text: string }
  /** Photographier l'écran tel qu'il est (le kit App Store, `lib/app-store`) : jamais offert à `try_journey`. */
  | { readonly action: 'shoot'; readonly name: string };

/** L'écran du navigateur : sa taille en points et sa densité (3 : un iPhone, 1320 × 2868 pour 440 × 956). */
export interface EcranDuParcours { readonly width: number; readonly height: number; readonly echelle: number }
export interface Photo { readonly nom: string; readonly jpeg: Buffer }

export interface EtapeJouee { readonly n: number; readonly etape: string; readonly ok: boolean; readonly fait: string; readonly adresse: string }
export interface Parcours {
  readonly etapes: readonly EtapeJouee[];
  /** L'étape où le parcours s'est arrêté, sa capture (JPEG). */
  readonly arret: { readonly n: number; readonly capture: Buffer | null } | null;
  /** Ce qui aurait été écrit ou envoyé, dans l'ordre. */
  readonly simule: readonly string[];
  readonly erreursDeLaPage: readonly string[];
  /** Les écrans photographiés (`shoot`), dans l'ordre. */
  readonly photos?: readonly Photo[];
}

/* ── Ce que le parcours emploie de Playwright (le paquet du serveur, chargé à l'exécution) ── */
interface Localisateur {
  first(): Localisateur;
  or(l: Localisateur): Localisateur;
  click(o: { timeout: number }): Promise<void>;
  fill(v: string, o: { timeout: number }): Promise<void>;
  selectOption(v: { label: string } | string, o: { timeout: number }): Promise<unknown>;
  check(o: { timeout: number }): Promise<void>;
  waitFor(o: { state: 'visible'; timeout: number }): Promise<void>;
}
interface Route {
  request(): { url(): string; method(): string; postData(): string | null; resourceType(): string };
  continue(): Promise<void>;
  abort(code?: string): Promise<void>;
  fulfill(o: { status: number; contentType: string; body: string }): Promise<void>;
}
interface PageJouee {
  route(motif: string, h: (r: Route) => unknown): Promise<unknown>;
  addInitScript(script: string): Promise<void>;
  on(e: 'pageerror', f: (e: Error) => void): void;
  goto(url: string, o: { waitUntil: 'networkidle'; timeout: number }): Promise<unknown>;
  waitForLoadState(s: 'networkidle', o: { timeout: number }): Promise<void>;
  url(): string;
  getByRole(role: 'button' | 'link' | 'checkbox' | 'radio', o: { name: string }): Localisateur;
  getByLabel(t: string): Localisateur;
  getByPlaceholder(t: string): Localisateur;
  getByText(t: string): Localisateur;
  screenshot(o: { type: 'jpeg'; quality: number }): Promise<Buffer>;
  close(): Promise<void>;
}
export interface NavigateurDuParcours {
  newPage(o: { viewport: { width: number; height: number }; locale: string; reducedMotion: 'reduce'; deviceScaleFactor?: number; isMobile?: boolean; hasTouch?: boolean }): Promise<PageJouee>;
  close(): Promise<void>;
}

/** Une étape dite en une ligne, pour le rapport. PUR. */
export function laLigne(e: Etape): string {
  switch (e.action) {
    case 'open': return `open ${e.path}`;
    case 'click': return `click « ${e.target} »`;
    case 'fill': return `fill « ${e.target} » with « ${e.value} »`;
    case 'select': return `select « ${e.value} » in « ${e.target} »`;
    case 'check': return `check « ${e.target} »`;
    case 'expect': return `expect « ${e.text} »`;
    case 'shoot': return `take the picture « ${e.name} »`;
  }
}

/** Les écritures de la base que le relais de l'app appelle : simulées. */
const ECRITURES = /\/rest\/v1\/rpc\/(voie_neuve_(?:creer|modifier|supprimer|appeler))$/;

/**
 * Ce qu'une requête de la page devient : servie (le site, une lecture de la base, une image permise), simulée (une
 * écriture, un formulaire), indisponible (une autre route de la plateforme), ou bloquée. PUR.
 */
export function leSortDeLaRequete(url: string, methode: string, sorte: string, o: { readonly site: string; readonly base: string; readonly images: readonly string[]; readonly copie?: boolean }):
  | { readonly sort: 'servie' }
  | { readonly sort: 'bloquee' }
  | { readonly sort: 'simulee'; readonly quoi: 'base' | 'formulaire' | 'depot' | 'occupations'; readonly fonction?: string }
  | { readonly sort: 'indisponible'; readonly chemin: string } {
  let u: URL;
  try { u = new URL(url); } catch { return { sort: 'bloquee' }; }
  if (url.startsWith('data:')) return { sort: 'servie' };
  if (u.origin === new URL(o.site).origin) {
    const api = /\/api\/(.+)$/.exec(u.pathname);
    if (api && api[1] === 'forms/submit') return { sort: 'simulee', quoi: 'formulaire' };
    // L'envoi sans compte : joué dans la copie (`la-plateforme-de-la-copie`), simulé sans elle.
    if (api && /^depot\/[^/]+$/.test(api[1]!) && !o.copie) return { sort: 'simulee', quoi: 'depot' };
    // Les places prises d'une période exclusive : aucune dans un parcours (les écritures n'y restent pas).
    if (api && /^occupations\/[^/]+$/.test(api[1]!)) return { sort: 'simulee', quoi: 'occupations' };
    if (api) return { sort: 'indisponible', chemin: `/api/${api[1]}` };
    return { sort: 'servie' };
  }
  if (u.origin === new URL(o.base).origin) {
    const e = ECRITURES.exec(u.pathname);
    // Sur une copie de la base (parcours avec compte), les écritures sont réelles : la copie est effacée à la fin.
    return e && methode === 'POST' && !o.copie ? { sort: 'simulee', quoi: 'base', fonction: e[1]! } : { sort: 'servie' };
  }
  if (sorte === 'image' && o.images.some((h) => new URL(h).origin === u.origin)) return { sort: 'servie' };
  return { sort: 'bloquee' };
}

/** La réponse simulée d'une écriture, et ce qu'elle dit au rapport. PUR. */
export function laReponseSimulee(quoi: 'base' | 'formulaire' | 'depot' | 'occupations', fonction: string | undefined, corps: string | null): { readonly corps: unknown; readonly dit: string } {
  if (quoi === 'occupations') return { corps: { capacite: null, occupations: [] }, dit: 'the taken slots were read: none during a journey' };
  if (quoi === 'depot') {
    const d = leDepotDuCorps(corps) as { table?: unknown; ligne?: unknown } | null;
    return { corps: { id: randomUUID(), ligne: d?.ligne ?? {} }, dit: `a visitor's row would be saved without an account in « ${String(d?.table ?? '?')} »: ${JSON.stringify(d?.ligne ?? {}).slice(0, 300)}` };
  }
  let a: Record<string, unknown> = {};
  try { a = JSON.parse(corps ?? '{}') as Record<string, unknown>; } catch { /* corps illisible : dit tel quel */ }
  const court = (v: unknown) => JSON.stringify(v ?? {}).slice(0, 300);
  if (quoi === 'formulaire') return { corps: { ok: true }, dit: `form « ${String(a.formKey ?? '?')} » would be sent to the owner: ${court(a.data)}` };
  const table = String(a.p_table ?? a.p_fonction ?? '?');
  switch (fonction) {
    case 'voie_neuve_creer': return { corps: { id: randomUUID(), ...(a.p_valeurs as object ?? {}) }, dit: `a row would be created in « ${table} »: ${court(a.p_valeurs)}` };
    case 'voie_neuve_modifier': return { corps: [], dit: `rows of « ${table} » would be changed: ${court(a.p_valeurs)}` };
    case 'voie_neuve_supprimer': return { corps: [], dit: `rows of « ${table} » would be deleted: ${court(a.p_egal)}` };
    default: return { corps: null, dit: `the function « ${table} » would be called: ${court(a.p_arguments)}` };
  }
}

const message = (e: unknown) => String((e as Error)?.message ?? e).split('\n')[0]!.replace(/\s+/g, ' ').slice(0, 200);

/** Sert le build vert, requête par requête, depuis le magasin (`lire` rend le corps et le type d'un chemin du dist). */
function servirLeBuild(lire: (segments: readonly string[]) => Promise<{ statut: number; type: string; corps: Buffer }>): Promise<{ adresse: string; serveur: Server }> {
  const serveur = createServer((q, r) => {
    const segments = decodeURIComponent((q.url ?? '/').split('?')[0]!).replace(BASE_DU_PARCOURS, '').split('/').filter(Boolean);
    void lire(segments).then((x) => { r.writeHead(x.statut, { 'content-type': x.type }); r.end(x.corps); }, () => { r.writeHead(500); r.end(); });
  });
  return new Promise((ok) => serveur.listen(0, '127.0.0.1', () => ok({ adresse: `http://127.0.0.1:${(serveur.address() as AddressInfo).port}`, serveur })));
}

export async function jouerLeParcours(navigateur: NavigateurDuParcours, etapes: readonly Etape[], o: {
  readonly lire: (segments: readonly string[]) => Promise<{ statut: number; type: string; corps: Buffer }>;
  readonly base: string; readonly images: readonly string[]; readonly langue: string;
  /** Un parcours avec compte : la session posée dans le navigateur avant la première page, sur une copie de la base. */
  readonly session?: { readonly cle: string; readonly valeur: unknown };
  /** Sur une copie, les routes de la plateforme qu'elle joue (comptes, panier, paiement simulé, `la-plateforme-de-la-copie`) ; `null` : indisponible. */
  readonly plateforme?: (chemin: string, corps: string | null) => Promise<{ readonly statut: number; readonly corps: unknown; readonly dit?: string } | null>;
  /** Sur une copie, les écritures sont réelles (même sans session : on s'y inscrit). */
  readonly copie?: boolean;
  /** L'écran joué ; absent : un ordinateur (1280 × 800). Plus étroit qu'un ordinateur, il est tactile. */
  readonly ecran?: EcranDuParcours;
}): Promise<Parcours> {
  const { adresse: site, serveur } = await servirLeBuild(o.lire);
  const jouees: EtapeJouee[] = [];
  const simule: string[] = [];
  const erreurs: string[] = [];
  const photos: Photo[] = [];
  let arret: Parcours['arret'] = null;
  try {
    const ecran = o.ecran ?? { width: 1280, height: 800, echelle: 1 };
    const tactile = ecran.width < 1100;
    const page = await navigateur.newPage({ viewport: { width: ecran.width, height: ecran.height }, locale: o.langue, reducedMotion: 'reduce',
      ...(o.ecran ? { deviceScaleFactor: ecran.echelle, isMobile: tactile, hasTouch: tactile } : {}) });
    page.on('pageerror', (e) => { if (erreurs.length < 10) erreurs.push(message(e)); });
    // En texte : une fonction compilée porterait des aides du compilateur que la page n'a pas (`les-captures.ts`).
    if (o.session) await page.addInitScript(`try { localStorage.setItem(${JSON.stringify(o.session.cle)}, ${JSON.stringify(JSON.stringify(o.session.valeur))}); } catch (e) {}`);
    await page.route('**/*', async (r) => {
      const q = r.request();
      const s = leSortDeLaRequete(q.url(), q.method(), q.resourceType(), { site, base: o.base, images: o.images, copie: Boolean(o.session) || o.copie === true });
      if (s.sort === 'servie') return r.continue();
      if (s.sort === 'bloquee') return r.abort('blockedbyclient');
      if (s.sort === 'indisponible') {
        const jouee = o.plateforme ? await o.plateforme(s.chemin, q.postData()).catch((e: unknown) => ({ statut: 503, corps: { error: 'panne' }, dit: `${s.chemin} failed: ${message(e)}` })) : null;
        if (jouee) {
          if (jouee.dit) simule.push(jouee.dit);
          return r.fulfill({ status: jouee.statut, contentType: 'application/json', body: JSON.stringify(jouee.corps) });
        }
        simule.push(`${s.chemin} was called: not played in a journey (accounts, payment), it answered « unavailable »`);
        return r.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'not available in a vavi journey' }) });
      }
      const rep = laReponseSimulee(s.quoi, s.fonction, q.postData());
      simule.push(rep.dit);
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rep.corps) });
    });
    const ici = () => { try { return `/${new URL(page.url()).pathname.slice(BASE_DU_PARCOURS.length)}`; } catch { return '?'; } };
    const cible = (t: string) => page.getByRole('button', { name: t }).or(page.getByRole('link', { name: t })).or(page.getByText(t)).first();
    const champ = (t: string) => page.getByLabel(t).or(page.getByPlaceholder(t)).first();
    try {
      for (const [i, e] of etapes.entries()) {
        const n = i + 1;
        try {
          if (e.action === 'open') await page.goto(`${site}${BASE_DU_PARCOURS}${e.path.replace(/^\/+/, '')}`, { waitUntil: 'networkidle', timeout: 15_000 });
          else if (e.action === 'click') await cible(e.target).click({ timeout: ATTENTE_MS });
          else if (e.action === 'fill') await champ(e.target).fill(e.value, { timeout: ATTENTE_MS });
          else if (e.action === 'select') await champ(e.target).selectOption({ label: e.value }, { timeout: ATTENTE_MS });
          else if (e.action === 'check') await page.getByRole('checkbox', { name: e.target }).or(page.getByRole('radio', { name: e.target })).or(page.getByLabel(e.target)).first().check({ timeout: ATTENTE_MS });
          else if (e.action === 'expect') await page.getByText(e.text).first().waitFor({ state: 'visible', timeout: ATTENTE_MS });
          else {
            // JPEG : Apple refuse une capture à couche alpha, et le JPEG n'en a pas.
            await page.waitForLoadState('networkidle', { timeout: 3_000 }).catch(() => undefined);
            photos.push({ nom: e.name, jpeg: await page.screenshot({ type: 'jpeg', quality: 90 }) });
          }
          if (e.action === 'click') await page.waitForLoadState('networkidle', { timeout: 3_000 }).catch(() => undefined);
          jouees.push({ n, etape: laLigne(e), ok: true, fait: 'done', adresse: ici() });
        } catch (err) {
          const pourquoi = /Timeout|waiting for/i.test(message(err))
            ? (e.action === 'expect' ? 'this text never appeared' : e.action === 'open' ? 'the page did not finish loading' : 'nothing on the page matches it (or it stayed hidden or disabled)')
            : message(err);
          jouees.push({ n, etape: laLigne(e), ok: false, fait: pourquoi, adresse: ici() });
          arret = { n, capture: await page.screenshot({ type: 'jpeg', quality: 60 }).catch(() => null) };
          break;
        }
      }
    } finally {
      await page.close().catch(() => undefined);
    }
  } finally {
    await navigateur.close().catch(() => undefined);
    serveur.close();
  }
  return { etapes: jouees, arret, simule, erreursDeLaPage: erreurs, photos };
}
