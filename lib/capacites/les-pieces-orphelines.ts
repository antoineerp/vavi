// Repris de constructor-v13@5bb786e : lib/capabilities/les-pieces-orphelines.ts
/**
 * LES PIÈCES ORPHELINES — le fichier d'une ligne part avec elle.
 *
 * Le navigateur supprime une ligne PAR LE RELAIS, et la base supprime en cascade, efface un compte, vide une colonne :
 * la plateforme ne voit passer aucun de ces gestes. LA BASE DÉCIDE CE QUI RESTE : chaque app expose `pieces_citees()`
 * (les chemins que ses lignes portent, `sqlDesPieces`) ; la fonction de service `public.pieces_orphelines` rend les
 * fichiers du seau `pieces` que plus aucune ligne ne cite, passé un délai de grâce (un dépôt en cours n'est pas encore
 * cité). La plateforme les efface par l'API du stockage (une ligne de `storage.objects` supprimée en SQL laisserait
 * l'octet chez l'hébergeur).
 *
 * Ce qui ne se lit pas (schéma absent, `pieces_citees` absente) n'est JAMAIS effacé : il est DIT.
 * Quand : à l'effacement d'un compte (`app/_partage/la-conformite-reelle.ts`), et au plus toutes les 30 min, au passage
 * d'une pièce (`app/api/pieces`) : vavi n'a pas de worker.
 */
type Issue<T> = { readonly lu: true; readonly valeur: T } | { readonly lu: false; readonly pourquoi: string };
const lu = <T>(valeur: T): Issue<T> => ({ lu: true, valeur });
const pasLu = <T>(pourquoi: string): Issue<T> => ({ lu: false, pourquoi });

/** Le délai de grâce : un fichier déposé n'est cité qu'après son enregistrement en base. */
export const GRACE_DU_BALAYAGE_MIN = 10;
export const GRACE_D_UN_COMPTE_QUI_PART_MIN = 2;
const ORPHELINS_PAR_PASSE = 500;
const INTERVALLE_DU_BALAYAGE_MS = 30 * 60_000;

/** La forme d'un chemin de pièce (`cheminDeLaLigne` + l'aléa) — rien d'autre ne s'efface. */
const CHEMIN_D_UNE_PIECE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[a-z][a-z0-9_]{0,62}\/[A-Za-z0-9_-]{1,64}\/[0-9a-f]{24}$/;

export const SQL_DES_PIECES_ORPHELINES = String.raw`
-- ============================================================================
-- LES PIÈCES ORPHELINES — les fichiers du seau « pieces » que plus aucune ligne ne cite (service_role seul)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.pieces_orphelines(p_projet TEXT DEFAULT NULL, p_age_minutes INTEGER DEFAULT 10, p_limite INTEGER DEFAULT 500)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_projet TEXT;
  v_schema TEXT;
  v_copie TEXT;
  v_citees TEXT[];
  v_une TEXT[];
  v_orphelins TEXT[] := '{}';
  v_illisibles TEXT[] := '{}';
BEGIN
  IF p_projet IS NOT NULL AND p_projet !~ '^[0-9a-f-]{36}$' THEN
    RAISE EXCEPTION 'pièces : projet refusé (%)', p_projet USING ERRCODE = '22023';
  END IF;
  FOR v_projet IN
    SELECT DISTINCT split_part(o.name, '/', 1) FROM storage.objects o
     WHERE o.bucket_id = 'pieces' AND (p_projet IS NULL OR starts_with(o.name, p_projet || '/'))
  LOOP
    CONTINUE WHEN v_projet !~ '^[0-9a-f-]{36}$';
    v_schema := 'app_' || replace(left(v_projet, 20), '-', '_');
    -- CE QUI NE SE LIT PAS NE S'EFFACE PAS : la base réelle et sa fonction, sinon rien.
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc f JOIN pg_catalog.pg_namespace n ON n.oid = f.pronamespace
                    WHERE n.nspname = v_schema AND f.proname = 'pieces_citees') THEN
      v_illisibles := v_illisibles || v_projet;
      CONTINUE;
    END IF;
    v_citees := '{}';
    -- La base réelle ET ses copies (travail, marche, voir) : une ligne en cours de modification cite encore son fichier.
    FOR v_copie IN
      SELECT n.nspname FROM pg_catalog.pg_proc f JOIN pg_catalog.pg_namespace n ON n.oid = f.pronamespace
       WHERE f.proname = 'pieces_citees' AND (n.nspname = v_schema OR n.nspname ~ ('^' || v_schema || '_[a-z]+$'))
    LOOP
      EXECUTE format('SELECT coalesce(array_agg(c), ''{}'') FROM %I.pieces_citees() c', v_copie) INTO v_une;
      v_citees := v_citees || v_une;
    END LOOP;
    v_orphelins := v_orphelins || ARRAY(
      SELECT o.name FROM storage.objects o
       WHERE o.bucket_id = 'pieces' AND starts_with(o.name, v_projet || '/')
         AND o.created_at < now() - make_interval(mins => greatest(p_age_minutes, 0))
         AND NOT (o.name = ANY (v_citees))
       ORDER BY o.name
       LIMIT greatest(p_limite - cardinality(v_orphelins), 0));
    EXIT WHEN cardinality(v_orphelins) >= p_limite;
  END LOOP;
  RETURN jsonb_build_object('orphelins', to_jsonb(v_orphelins), 'illisibles', to_jsonb(v_illisibles));
END;
$$;
REVOKE ALL ON FUNCTION public.pieces_orphelines(TEXT, INTEGER, INTEGER) FROM PUBLIC;
DO $grant$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN REVOKE ALL ON FUNCTION public.pieces_orphelines(TEXT, INTEGER, INTEGER) FROM anon; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN REVOKE ALL ON FUNCTION public.pieces_orphelines(TEXT, INTEGER, INTEGER) FROM authenticated; END IF;
END $grant$;
GRANT EXECUTE ON FUNCTION public.pieces_orphelines(TEXT, INTEGER, INTEGER) TO service_role;
`;

export interface DependancesDesOrphelines {
  /** `public.pieces_orphelines` — les chemins que plus aucune ligne ne cite, et les projets illisibles. */
  orphelins(projet: string | null, ageMinutes: number, limite: number): Promise<Issue<{ orphelins: unknown; illisibles: unknown }>>;
  supprimer(chemins: readonly string[]): Promise<string | null>;
}

export interface CeQuiAEteEfface { readonly effaces: number; readonly illisibles: readonly string[] }

/**
 * EFFACER LES ORPHELINES d'un projet (ou de tous) — ce que la base dit ne plus citer, dans la forme d'un chemin de pièce
 * et sous le préfixe du projet demandé ; le reste est écarté. Ne lève pas.
 */
export async function effacerLesPiecesOrphelines(
  projet: string | null, d: DependancesDesOrphelines, ageMinutes: number = GRACE_DU_BALAYAGE_MIN,
): Promise<Issue<CeQuiAEteEfface>> {
  const r = await d.orphelins(projet, ageMinutes, ORPHELINS_PAR_PASSE);
  if (!r.lu) return pasLu(r.pourquoi);
  const chaines = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
  const aEffacer = chaines(r.valeur.orphelins)
    .filter((c) => CHEMIN_D_UNE_PIECE.test(c) && (projet === null || c.startsWith(`${projet}/`)));
  if (aEffacer.length > 0) {
    const f = await d.supprimer(aEffacer);
    if (f) return pasLu(`${aEffacer.length} fichier(s) de pièces jointes que plus aucune ligne ne cite, non effacé(s) : ${f}`);
  }
  return lu({ effaces: aEffacer.length, illisibles: chaines(r.valeur.illisibles) });
}

let dernierBalayage = 0;
/** Le balayage de tous les projets, au plus toutes les 30 min par instance. Jamais bloquant ; DIT. */
export async function effacerLesPiecesOrphelinesSiDu(d: DependancesDesOrphelines, maintenant: number = Date.now()): Promise<boolean> {
  if (maintenant - dernierBalayage < INTERVALLE_DU_BALAYAGE_MS) return false;
  dernierBalayage = maintenant;
  try {
    const r = await effacerLesPiecesOrphelines(null, d);
    if (!r.lu) { console.warn(`[Pièces] ⚠️ balayage non abouti (non bloquant) : ${r.pourquoi}`); return false; }
    if (r.valeur.effaces > 0) console.log(`[Pièces] 🧹 ${r.valeur.effaces} fichier(s) que plus aucune ligne ne cite, effacé(s) du seau`);
    if (r.valeur.illisibles.length > 0) {
      console.warn(`[Pièces] ⚠️ ${r.valeur.illisibles.length} projet(s) dont la base ne dit pas ce qu'elle cite — rien n'y est effacé : `
        + r.valeur.illisibles.map((p) => p.slice(0, 8)).join(', '));
    }
    return true;
  } catch (e: unknown) {
    console.warn(`[Pièces] ⚠️ balayage non abouti (non bloquant) : ${(e as Error)?.message || e}`);
    return false;
  }
}
