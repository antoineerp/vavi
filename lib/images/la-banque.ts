// Repris de constructor-v13@32d18f3 : generateur-v2/pipeline/images.ts (la banque, la photo du sujet, l'image posée), sans l'image
// générée (vavi n'en génère pas).
/**
 * Les photos de l'app : l'agent dit un sujet, la banque de la plateforme rend des images qui existent, et l'outil les
 * pose dans `src/images.json`, que l'agent ne peut pas écrire. Une page ne montre une photo que par `<Photo nom>` : un
 * nom qui n'est pas posé ne compile pas. Le modèle n'écrit jamais une adresse d'image.
 */
export interface ImageTrouvee {
  /** L'adresse du CDN sans paramètre, relevée dans la réponse de la banque. */
  readonly source: string;
  readonly largeur: number;
  readonly hauteur: number;
  readonly decrit: string;
  readonly auteur: string;
  readonly profil: string;
  readonly banque: string;
  readonly lienBanque: string;
  /** L'adresse que la banque demande d'appeler quand une image est retenue. */
  readonly signalement?: string;
}

export interface Banque {
  /** Au plus `combien` images ; une liste vide est un fait, une panne est une exception dite à l'agent. */
  chercher(sujet: string, combien: number, ecartees: ReadonlySet<string>): Promise<readonly ImageTrouvee[]>;
  signaler(image: ImageTrouvee): Promise<void>;
}

/** Une image posée, telle que `src/images.json` la porte et que `<Photo>` la lit. */
export interface ImagePosee {
  readonly alt: string;
  readonly largeur: number;
  readonly hauteur: number;
  /** Une adresse par largeur servie, du plus petit au plus grand. */
  readonly sources: readonly (readonly [number, string])[];
  readonly auteur: string;
  readonly profil: string;
  readonly banque: string;
  readonly lienBanque: string;
}

export const CHEMIN_DES_IMAGES = 'src/images.json';
const LARGEURS = [640, 1280, 1920] as const;
const MINIMUM = { largeur: 1200, hauteur: 800 } as const;
const DELAI_MS = 8000;

export function lireLesImages(texte: string | undefined): Record<string, ImagePosee> {
  try { const o = JSON.parse(texte ?? '{}') as unknown; return o && typeof o === 'object' && !Array.isArray(o) ? o as Record<string, ImagePosee> : {}; } catch { return {}; }
}

export function poser(trouvee: ImageTrouvee, alt: string): ImagePosee {
  const largeurs = LARGEURS.filter((l) => l <= trouvee.largeur);
  return {
    alt, largeur: trouvee.largeur, hauteur: trouvee.hauteur,
    sources: largeurs.map((l) => [l, `${trouvee.source}?w=${l}&q=80&auto=format&fit=crop`] as const),
    auteur: trouvee.auteur, profil: trouvee.profil, banque: trouvee.banque, lienBanque: trouvee.lienBanque,
  };
}

/** Les mots qui portent le sens d'un sujet ou d'une description, au singulier, en minuscules. */
const VIDES = new Set(['with', 'from', 'that', 'this', 'into', 'onto', 'over', 'under', 'near', 'some', 'their', 'there', 'while', 'very',
  'and', 'the', 'for', 'its', 'are', 'has', 'have', 'photo', 'image', 'picture', 'view', 'close', 'shot', 'background']);
function motsPleins(texte: string): Set<string> {
  return new Set(texte.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/[^a-z]+/)
    .filter((m) => m.length >= 3 && !VIDES.has(m)).map((m) => m.replace(/(ies)$/, 'y').replace(/(?<=[^s])s$/, '')));
}

/**
 * La part des mots du sujet que la description de la banque nomme : 0 quand elle n'en nomme aucun ou n'en donne pas.
 * C'est le seul fait que la banque rend sur ce que la photo montre.
 */
export function partDuSujet(sujet: string, decrit: string): number {
  const voulus = motsPleins(sujet);
  const vus = motsPleins(decrit);
  if (voulus.size === 0 || vus.size === 0) return 0;
  return [...voulus].filter((m) => vus.has(m)).length / voulus.size;
}

/** Parmi les photos trouvées, celle dont la description nomme le plus du sujet ; aucune si aucune n'en nomme rien. */
export function laPhotoDuSujet(sujet: string, trouvees: readonly ImageTrouvee[]): ImageTrouvee | null {
  let meilleure: ImageTrouvee | null = null;
  let part = 0;
  for (const t of trouvees) { const p = partDuSujet(sujet, t.decrit); if (p > part) { meilleure = t; part = p; } }
  return meilleure;
}

async function avecDelai(url: string, cle: string): Promise<Response> {
  const stop = new AbortController();
  const minuteur = setTimeout(() => stop.abort(), DELAI_MS);
  try { return await fetch(url, { headers: { Authorization: `Client-ID ${cle}`, 'Accept-Version': 'v1' }, signal: stop.signal }); }
  finally { clearTimeout(minuteur); }
}

interface ReponseUnsplash {
  readonly results?: ReadonlyArray<{
    readonly width?: number; readonly height?: number; readonly alt_description?: string | null;
    readonly urls?: { readonly raw?: string }; readonly user?: { readonly name?: string; readonly links?: { readonly html?: string } };
    readonly links?: { readonly download_location?: string };
  }>;
}

/** Unsplash, avec la provenance que ses règles d'usage demandent sur chaque lien de crédit. */
export class Unsplash implements Banque {
  constructor(private readonly cle: string, private readonly application: string) {}

  private provenance(url: string): string {
    return this.application ? `${url}${url.includes('?') ? '&' : '?'}utm_source=${encodeURIComponent(this.application)}&utm_medium=referral` : url;
  }

  async chercher(sujet: string, combien: number, ecartees: ReadonlySet<string>): Promise<readonly ImageTrouvee[]> {
    const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(sujet)}&per_page=${Math.min(24, combien * 4)}`
      + '&content_filter=high&orientation=landscape&order_by=relevant';
    const r = await avecDelai(url, this.cle);
    if (!r.ok) throw new Error(`la banque d’images a répondu ${r.status} sur « ${sujet} »`);
    const charge = await r.json() as ReponseUnsplash;
    const trouvees: ImageTrouvee[] = [];
    for (const x of charge.results ?? []) {
      const source = /^https:\/\/images\.unsplash\.com\/[A-Za-z0-9._-]+/.exec(x.urls?.raw ?? '')?.[0];
      const largeur = x.width ?? 0;
      const hauteur = x.height ?? 0;
      if (!source || ecartees.has(source) || largeur < MINIMUM.largeur || hauteur < MINIMUM.hauteur) continue;
      trouvees.push({
        source, largeur, hauteur, decrit: (x.alt_description ?? '').trim(), auteur: (x.user?.name ?? '').trim(),
        profil: this.provenance(x.user?.links?.html ?? ''), banque: 'Unsplash', lienBanque: this.provenance('https://unsplash.com/'),
        ...(x.links?.download_location ? { signalement: x.links.download_location } : {}),
      });
      if (trouvees.length >= combien) break;
    }
    return trouvees;
  }

  async signaler(image: ImageTrouvee): Promise<void> {
    if (image.signalement) await avecDelai(image.signalement, this.cle).catch(() => undefined);
  }
}

/** La banque de la plateforme, ou `null` quand aucune n'est branchée : l'outil le dit alors à l'agent. */
export function banqueDeLaPlateforme(env: NodeJS.ProcessEnv = process.env): Banque | null {
  const cle = (env.UNSPLASH_ACCESS_KEY ?? '').trim();
  return cle ? new Unsplash(cle, (env.UNSPLASH_APPLICATION ?? '').trim()) : null;
}

export interface DemandeDImage { readonly nom: string; readonly sujet: string; readonly alt: string }

/**
 * Les photos demandées, posées dans `src/images.json` (son texte actuel, ou `undefined`) : chacune quand la banque dit y
 * voir le sujet ; un nom déjà posé est gardé ; un sujet qu'aucune ne montre est dit, rien n'est posé. Rend le nouveau
 * texte (`null` : rien n'a changé) et ce qui est dit pour chaque nom.
 */
export async function poserLesImages(actuel: string | undefined, demandes: readonly DemandeDImage[], banque: Banque): Promise<{ readonly texte: string | null; readonly dits: readonly string[] }> {
  const posees = lireLesImages(actuel);
  const ecartees = new Set(Object.values(posees).flatMap((i) => (i.sources ?? []).map(([, s]) => s.split('?')[0]!)));
  const dits: string[] = [];
  let change = false;
  for (const d of demandes) {
    if (posees[d.nom]) { dits.push(`${d.nom}: already set, kept.`); continue; }
    const candidates = await banque.chercher(d.sujet, 6, ecartees);
    const trouvee = laPhotoDuSujet(d.sujet, candidates);
    if (!trouvee) {
      const vues = candidates.map((c) => c.decrit).filter(Boolean).slice(0, 3);
      dits.push(`${d.nom}: no photo shows "${d.sujet}"${vues.length ? ` (the bank sees: ${vues.join('; ')})` : ''}; name the thing shown in one or two concrete English words, or write the page without this photo.`);
      continue;
    }
    posees[d.nom] = poser(trouvee, d.alt);
    ecartees.add(trouvee.source);
    change = true;
    await banque.signaler(trouvee);
    dits.push(`${d.nom}: set${trouvee.decrit ? ` (the bank sees: ${trouvee.decrit})` : ''}.`);
  }
  return { texte: change ? `${JSON.stringify(posees, null, 2)}\n` : null, dits };
}
