// Repris de constructor-v13@5bb786e : generateur-v2/app/les-ecrans.ts
/**
 * Ce que la personne demande, et les écrans qui le tiennent. Le cadrage recopie chaque demande mot pour mot (`demandes`)
 * et nomme ce qui la tient : un écran d'`ecrans`, un agent, une automatisation. Chaque écran dit pour qui il est et ce
 * qu'il montre. La construction bâtit ces écrans, la vérification les cherche, la livraison dit où est chaque demande.
 *
 * Ce qu'il remplace (interdit 9) : des écrans déduits des seules tables et des rôles, et la règle du cadrage qui voulait
 * « le produit entier » : une app élargie au-delà de la demande, où rien ne disait ce qui avait été demandé, ni où.
 */
import { z } from 'zod';
import { Identifiant } from './identifiant';

export const Ecran = z.object({
  nom: Identifiant,
  titre: z.string().min(1).describe('son titre au menu, dans la langue principale'),
  pour: z.array(Identifiant).min(1).describe('les rôles qui l’ouvrent ; `visiteur` : une page publique, sans compte'),
  montre: z.array(Identifiant).default([])
    .describe('ce qu’on y voit et y fait : les tables dont il liste ou crée les lignes, les indicateurs qu’il montre, les agents qu’on y lance'),
}).describe('un écran que la demande veut');
export type Ecran = z.infer<typeof Ecran>;

export const Demande = z.object({
  passage: z.string().min(1).max(600).describe('ce que la personne demande, recopié mot pour mot de sa demande ou d’un document joint'),
  tenuePar: z.array(Identifiant).min(1).describe('ce qui le tient : un écran d’`ecrans`, un agent, une automatisation'),
}).describe('une chose que la personne demande');
export type Demande = z.infer<typeof Demande>;

/**
 * Le parcours principal : pour qui l'app existe d'abord, ce qu'il vient faire, ce qu'il obtient, et l'écran où il le
 * fait. Il décide de l'accueil : qui arrive sans compte le fait depuis l'accueil public, sans se connecter ; qui
 * travaille arrive sur son écran. Ce qu'il remplace (interdit 9) : une app où rien ne disait qui venait d'abord, ni pour
 * quoi ; l'accueil pouvait mener chacun à la connexion, et le menu mêler ce que voit le visiteur et ce que fait l'équipe.
 */
export const Parcours = z.object({
  pour: Identifiant.describe('qui arrive d’abord : `visiteur`, sans compte, ou le rôle pour qui l’app existe'),
  fait: z.string().min(1).max(300).describe('ce qu’il vient faire, dans les mots de la demande'),
  obtient: z.string().min(1).max(300).describe('ce qu’il obtient à la fin'),
  ecran: Identifiant.optional().describe('l’écran d’`ecrans` où il le fait, ouvert à `pour`'),
}).describe('le parcours principal de la demande : la personne pour qui l’app existe d’abord, ce qu’elle vient faire et ce qu’elle obtient ; l’accueil l’y mène en un clic, sans connexion quand elle arrive sans compte');
export type Parcours = z.infer<typeof Parcours>;

interface TableLue {
  readonly nom: string; readonly parent?: string;
  readonly champs: ReadonlyArray<{ readonly type: string; readonly table?: string }>;
}
interface AppLue {
  readonly nature: string; readonly ecrans: readonly Ecran[]; readonly demandes: readonly Demande[]; readonly tables: readonly TableLue[];
  readonly roles: readonly { readonly nom: string }[]; readonly indicateurs: readonly { readonly nom: string }[];
  readonly agents: readonly { readonly nom: string; readonly reveil: unknown }[];
  readonly automatisations: readonly { readonly nom: string }[];
  readonly parcours?: Parcours;
}

/** Les tables qu'une déclaration nomme sous une clé `table`, à toute profondeur. PUR. */
function tablesNommees(x: unknown): string[] {
  if (Array.isArray(x)) return x.flatMap(tablesNommees);
  if (!x || typeof x !== 'object') return [];
  return Object.entries(x).flatMap(([k, v]) => (k === 'table' && typeof v === 'string' ? [v] : tablesNommees(v)));
}

/**
 * Les tables qui servent une demande : celles qu'un écran montre, dont la ligne réveille un agent, qu'une automatisation
 * nomme, puis celles qu'elles désignent ou dont elles font partie. PUR.
 */
export function lesTablesQuiServent(m: AppLue): Set<string> {
  const vues = new Set([...m.ecrans.flatMap((e) => e.montre), ...tablesNommees(m.agents.map((a) => a.reveil)), ...tablesNommees(m.automatisations)]);
  for (let ajoutee = true; ajoutee;) {
    ajoutee = false;
    for (const t of m.tables.filter((x) => vues.has(x.nom))) {
      for (const n of [...t.champs.filter((c) => c.type === 'reference' && c.table).map((c) => c.table!), ...(t.parent ? [t.parent] : [])]) {
        if (!vues.has(n)) { vues.add(n); ajoutee = true; }
      }
    }
  }
  return vues;
}

/** Les écrans et les demandes nomment ce qui existe ; dès qu'une app déclare un écran, rien ne s'y déclare sans demande. */
export function lireLesEcrans(m: AppLue, ctx: z.RefinementCtx): void {
  const dire = (message: string) => ctx.addIssue({ code: 'custom', message });
  const ecrans = new Set(m.ecrans.map((e) => e.nom));
  const montrables = new Set([...m.tables.map((t) => t.nom), ...m.indicateurs.map((i) => i.nom), ...m.agents.map((a) => a.nom)]);
  const tenants = new Set([...ecrans, ...m.agents.map((a) => a.nom), ...m.automatisations.map((a) => a.nom)]);
  const roles = new Set(['visiteur', ...m.roles.map((r) => r.nom)]);
  const titres = m.ecrans.map((e) => e.titre.trim().toLowerCase());
  for (const [i, e] of m.ecrans.entries()) {
    const ici = `l’écran ${e.nom}`;
    if (m.ecrans.findIndex((x) => x.nom === e.nom) !== i) dire(`${ici} est déclaré deux fois`);
    if (titres.indexOf(titres[i]!) !== i) dire(`${ici} : le titre « ${e.titre} » est déjà celui d’un autre écran`);
    for (const r of e.pour.filter((x) => !roles.has(x))) dire(`${ici} : le rôle ${r} n’est pas déclaré`);
    for (const x of e.montre.filter((y) => !montrables.has(y))) dire(`${ici} montre ${x}, qui n’est ni une table, ni un indicateur, ni un agent déclaré`);
  }
  for (const d of m.demandes) {
    for (const x of d.tenuePar.filter((y) => !tenants.has(y))) dire(`la demande « ${d.passage.slice(0, 80)} » est tenue par ${x}, qui n’est ni un écran, ni un agent, ni une automatisation déclaré`);
  }
  const p = m.parcours, ouvert = p?.ecran ? m.ecrans.find((e) => e.nom === p.ecran) : undefined;
  if (p && !roles.has(p.pour)) dire(`le parcours principal : le rôle ${p.pour} n’est pas déclaré`);
  if (p?.ecran && !ouvert) dire(`le parcours principal se fait sur l’écran ${p.ecran}, qui n’est pas déclaré dans \`ecrans\``);
  if (p && ouvert && !ouvert.pour.includes(p.pour)) dire(`le parcours principal est pour ${p.pour}, mais l’écran ${ouvert.nom} ne s’ouvre qu’à ${ouvert.pour.join(', ')}`);
  if (p && !p.ecran && m.ecrans.length > 0) dire('le parcours principal nomme l’écran d’`ecrans` où il se fait (`ecran`)');
  if (m.ecrans.length === 0 || m.nature !== 'app') return;
  const tenus = new Set(m.demandes.flatMap((d) => d.tenuePar));
  for (const e of m.ecrans.filter((x) => !tenus.has(x.nom))) {
    dire(`l’écran ${e.nom} ne tient aucune demande : nommez-le dans le \`tenuePar\` du passage qui le veut, ou retirez-le`);
  }
  const servent = lesTablesQuiServent(m);
  for (const t of m.tables.filter((x) => !servent.has(x.nom))) {
    dire(`la table ${t.nom} ne sert aucune demande : nommez-la dans le \`montre\` de l’écran qui la tient, ou retirez-la si la demande ne la veut pas`);
  }
  const ouvrent = new Set(m.ecrans.flatMap((e) => e.pour));
  for (const r of m.roles.filter((x) => !ouvrent.has(x.nom))) {
    dire(`le rôle ${r.nom} n’ouvre aucun écran : nommez-le dans le \`pour\` des écrans qu’il ouvre, ou retirez-le si la demande ne le veut pas`);
  }
}

/**
 * Un texte réduit à ses lettres et ses chiffres, sans casse : un passage recopié se retrouve malgré les espaces, la
 * ponctuation, et les mots qu'un document coupe en fin de ligne. PUR.
 */
const aplati = (s: string): string => s.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

/** Les passages que ni la demande, ni ses documents, ni l'app d'avant ne portent : ils ne sont pas recopiés. PUR. */
export function lesPassagesIntrouvables(demandes: readonly Demande[], sources: readonly string[], avant: readonly Demande[] = []): Demande[] {
  const textes = sources.map(aplati);
  const deja = new Set(avant.map((d) => aplati(d.passage)));
  return demandes.filter((d) => {
    const p = aplati(d.passage);
    return p.length === 0 || (!deja.has(p) && !textes.some((t) => t.includes(p)));
  });
}

/** Ce que la personne a demandé, et où c'est : dit à la livraison, une ligne par demande. PUR. */
export function ceQueTuAsDemande(m: {
  readonly demandes: readonly Demande[]; readonly ecrans: readonly Ecran[]; readonly parcours?: Parcours; readonly roles?: readonly { readonly nom: string; readonly libelle: string }[];
  readonly agents: readonly { readonly nom: string; readonly libelle: string }[];
  readonly automatisations: readonly { readonly nom: string; readonly dit: string }[];
}): string[] {
  const ou = (n: string): string => {
    const e = m.ecrans.find((x) => x.nom === n);
    if (e) return `l’écran « ${e.titre} »`;
    const a = m.agents.find((x) => x.nom === n);
    if (a) return `l’agent « ${a.libelle} »`;
    const au = m.automatisations.find((x) => x.nom === n);
    return au ? `une automatisation (${au.dit.replace(/\.$/, '')})` : n;
  };
  const p = m.parcours;
  const qui = p ? (p.pour === 'visiteur' ? 'un visiteur, sans compte,' : `« ${m.roles?.find((r) => r.nom === p.pour)?.libelle ?? p.pour} »`) : '';
  return [...(p ? [`D’abord, ${qui} vient ${p.fait.replace(/\.$/, '')} et obtient ${p.obtient.replace(/\.$/, '')}${p.ecran ? `, sur ${ou(p.ecran)}` : ''}`] : []),
    ...m.demandes.map((d) => `« ${d.passage.length > 140 ? `${d.passage.slice(0, 140)}…` : d.passage} » : ${d.tenuePar.map(ou).join(', ')}`)];
}

/**
 * LES DEMANDES RÉPARÉES (Antoine, 26/11 : « fais page hello » refusé, Claude avait écrit `tenuePar: ["Accueil"]`) : un
 * `tenuePar` qui nomme un écran par son titre est lu comme cet écran ; un `tenuePar` qui ne nomme rien de déclaré est
 * retiré, et une demande qui ne garde rien est retirée : elle ne tenait rien. Chaque ajustement est dit. Ce qu'il
 * remplace : le refus de tout app.json pour un nom de `demandes`, qui ne décide rien de la base. PURE.
 */
export function lesDemandesReparees(json: unknown): { readonly valeur: unknown; readonly repare: readonly string[] } {
  const brut = json as Record<string, unknown> | null;
  if (!brut || typeof brut !== 'object' || !Array.isArray(brut.demandes)) return { valeur: json, repare: [] };
  const noms = (k: string) => (Array.isArray(brut[k]) ? (brut[k] as unknown[]) : []).flatMap((x) => (x && typeof x === 'object' && typeof (x as { nom?: unknown }).nom === 'string' ? [x as { nom: string; titre?: unknown }] : []));
  const ecrans = noms('ecrans');
  const tenants = new Set([...ecrans, ...noms('agents'), ...noms('automatisations')].map((x) => x.nom));
  const parTitre = new Map(ecrans.filter((e) => typeof e.titre === 'string').map((e) => [String(e.titre).trim().toLowerCase(), e.nom]));
  const repare: string[] = [];
  const demandes = brut.demandes.flatMap((d) => {
    if (!d || typeof d !== 'object') return [d];
    const x = d as { passage?: unknown; tenuePar?: unknown };
    const cite = `« ${String(x.passage ?? '').slice(0, 80)} »`;
    // Rien de nommé (INCIDENT 26/11, la scierie : `tenuePar: []` sur un site) : la demande ne tient rien, elle part.
    if (!Array.isArray(x.tenuePar) || x.tenuePar.length === 0) {
      repare.push(`la demande ${cite} ne nomme ni écran, ni agent, ni automatisation qui la tienne : retirée de \`demandes\``);
      return [];
    }
    const tenue = (x.tenuePar as unknown[]).flatMap((t) => {
      if (typeof t !== 'string') return [];
      if (tenants.has(t)) return [t];
      const lu = parTitre.get(t.trim().toLowerCase()) ?? (tenants.has(t.trim().toLowerCase()) ? t.trim().toLowerCase() : undefined);
      repare.push(lu ? `la demande ${cite} : « ${t} » lu comme l’écran ${lu}` : `la demande ${cite} : « ${t} » ne nomme aucun écran, agent ni automatisation déclaré : retiré`);
      return lu ? [lu] : [];
    });
    if (tenue.length) return [{ ...x, tenuePar: [...new Set(tenue)] }];
    repare.push(`la demande ${cite} n’est tenue par rien de déclaré : retirée de \`demandes\``);
    return [];
  });
  return repare.length ? { valeur: { ...brut, demandes }, repare } : { valeur: json, repare: [] };
}
