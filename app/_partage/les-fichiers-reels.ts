/** Les pièces jointes et le coffre branchés sur le réel : la base au nom du compte (`plateforme_pour`), les seaux privés de Supabase. */
import 'server-only';
import { clientDeService } from '@/lib/supabase/service';
import { plateformePour } from '@/lib/relais/agir-pour-un-compte';
import { schemaDuProjet } from '@/lib/relais/le-schema-d-une-app';
import { SEAU_DES_PIECES, type DependancesDesPieces } from '@/lib/capacites/les-pieces-jointes';
import type { DependancesDesOrphelines } from '@/lib/capacites/les-pieces-orphelines';
import { SEAU_DES_COFFRES, type DependancesDuCoffre } from '@/lib/capacites/le-coffre';

type Base = ReturnType<typeof clientDeService>;
const seauxPrets = new Map<string, Promise<string | null>>();

/** Le seau, privé, créé au premier dépôt. */
function leSeau(base: Base, nom: string): Promise<string | null> {
  const deja = seauxPrets.get(nom);
  if (deja) return deja;
  const pret = (async () => {
    const { data } = await base.storage.listBuckets();
    if ((data ?? []).some((b) => b.name === nom)) return null;
    const { error } = await base.storage.createBucket(nom, { public: false });
    return error && !/exist/i.test(error.message) ? error.message : null;
  })();
  seauxPrets.set(nom, pret);
  void pret.then((f) => { if (f) seauxPrets.delete(nom); });
  return pret;
}

function unSeau(base: Base, nom: string) {
  return {
    async deposer(chemin: string, octets: Uint8Array, type: string | null): Promise<string | null> {
      const pret = await leSeau(base, nom);
      if (pret) return pret;
      const { error } = await base.storage.from(nom).upload(chemin, octets, { contentType: type || 'application/octet-stream', upsert: false });
      return error ? error.message : null;
    },
    async lire(chemin: string): Promise<{ lu: true; valeur: Uint8Array | null } | { lu: false; pourquoi: string }> {
      const { data, error } = await base.storage.from(nom).download(chemin);
      if (error) return /not.?found|404|400/i.test(error.message) ? { lu: true, valeur: null } : { lu: false, pourquoi: error.message };
      return { lu: true, valeur: new Uint8Array(await data.arrayBuffer()) };
    },
    async lister(prefixe: string): Promise<{ lu: true; valeur: string[] } | { lu: false; pourquoi: string }> {
      const { data, error } = await base.storage.from(nom).list(prefixe, { limit: 1000 });
      return error ? { lu: false, pourquoi: error.message } : { lu: true, valeur: (data ?? []).map((o) => `${prefixe}/${o.name}`) };
    },
    async supprimer(chemins: readonly string[]): Promise<string | null> {
      if (chemins.length === 0) return null;
      const { error } = await base.storage.from(nom).remove([...chemins]);
      return error ? error.message : null;
    },
  };
}

const leSchema = async (projet: string) => {
  const s = schemaDuProjet(projet);
  return s ? { lu: true as const, valeur: s } : { lu: false as const, pourquoi: 'projet inconnu' };
};

export function lesPiecesReelles(): DependancesDesPieces {
  const base = clientDeService();
  const seau = unSeau(base, SEAU_DES_PIECES);
  return { schema: leSchema, base: (c, s, f, a) => plateformePour(base, c, s, f, a), deposer: seau.deposer, lire: seau.lire, supprimer: seau.supprimer };
}

export function lesOrphelinesReelles(): DependancesDesOrphelines {
  const base = clientDeService();
  return {
    async orphelins(projet, ageMinutes, limite) {
      const { data, error } = await base.rpc('pieces_orphelines', { p_projet: projet, p_age_minutes: ageMinutes, p_limite: limite });
      if (error) return { lu: false, pourquoi: error.message };
      const d = (data ?? {}) as { orphelins?: unknown; illisibles?: unknown };
      return { lu: true, valeur: { orphelins: d.orphelins ?? [], illisibles: d.illisibles ?? [] } };
    },
    supprimer: unSeau(base, SEAU_DES_PIECES).supprimer,
  };
}

export function leCoffreReel(): DependancesDuCoffre {
  const base = clientDeService();
  const s = unSeau(base, SEAU_DES_COFFRES);
  return { schema: leSchema, base: (c, sc, f, a) => plateformePour(base, c, sc, f, a),
    seau: { deposer: (chemin, octets) => s.deposer(chemin, octets, null), lire: s.lire, lister: s.lister, supprimer: s.supprimer } };
}

/** Un fichier rendu au navigateur, à télécharger, jamais affiché sous l'adresse de la plateforme. */
export function unFichier(f: { readonly nom: string; readonly type: string | null; readonly octets: Uint8Array }): Response {
  return new Response(Buffer.from(f.octets), {
    status: 200,
    headers: {
      'content-type': f.type || 'application/octet-stream',
      'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(f.nom)}`,
      'x-content-type-options': 'nosniff',
      'cache-control': 'no-store',
    },
  });
}

/**
 * Les fichiers déposés d'un projet, pour son export (`lib/export`) : les deux seaux, parcourus sous `<projet>/`, octet
 * pour octet, à leur chemin préfixé du seau. Au-delà du plafond, les fichiers restants sont comptés, jamais tus.
 * `null` : le stockage n'a pas pu être lu.
 */
export async function lesFichiersDeposes(projet: string, plafond: number, auPlus = 20_000): Promise<{ readonly fichiers: Map<string, Uint8Array>; readonly laisses: number } | null> {
  if (!/^[0-9a-f-]{36}$/i.test(projet)) return null;
  const base = clientDeService();
  const fichiers = new Map<string, Uint8Array>();
  let octets = 0, laisses = 0;
  const { data: seaux, error } = await base.storage.listBuckets();
  if (error) return null;
  for (const seau of [SEAU_DES_PIECES, SEAU_DES_COFFRES]) {
    if (!(seaux ?? []).some((b) => b.name === seau)) continue;
    const aVoir = [projet];
    while (aVoir.length) {
      const dossier = aVoir.pop()!;
      for (let depart = 0; ; depart += 1000) {
        const l = await base.storage.from(seau).list(dossier, { limit: 1000, offset: depart });
        if (l.error) return null;
        for (const o of l.data ?? []) {
          const chemin = `${dossier}/${o.name}`;
          if (o.id === null) { aVoir.push(chemin); continue; }
          const taille = Number((o.metadata as { size?: unknown } | null)?.size ?? 0);
          if (fichiers.size >= auPlus || octets + taille > plafond) { laisses += 1; continue; }
          const d = await base.storage.from(seau).download(chemin);
          if (d.error) return null;
          const b = new Uint8Array(await d.data.arrayBuffer());
          octets += b.length;
          fichiers.set(`${seau}/${chemin}`, b);
        }
        if ((l.data ?? []).length < 1000) break;
      }
    }
  }
  return { fichiers, laisses };
}
