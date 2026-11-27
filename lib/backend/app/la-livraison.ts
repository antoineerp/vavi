/**
 * LA LIVRAISON PAR ZONE ET AU POIDS d'une boutique (Antoine, 27/11 : « du fiable, pas du blabla »). Une zone nomme des
 * pays et son prix : le même quel que soit le colis, ou par tranche du poids du colis (la somme des poids des articles,
 * lus en base). Ici : sa forme, ce que la lecture d'app.json en ajuste (un pays d'une zone ajouté aux pays desservis),
 * et ce qu'elle refuse (un pays dans deux zones, des tranches sans poids sur un article). Le calcul est dans
 * `lib/vente/le-chiffrage.ts`. Ce qu'elle remplace : un seul prix d'envoi pour tous les pays et tous les colis.
 */
import { z } from 'zod';

const Pays = z.string().regex(/^[A-Z]{2}$/, 'un code de pays en deux majuscules (FR, BE, CH…)');
export const ZONES_AU_PLUS = 20;
export const TRANCHES_AU_PLUS = 20;

export const Zone = z.object({
  nom: z.string().min(1).max(60).describe('le nom que l’acheteur lit (France métropolitaine, Europe, Monde)'),
  pays: z.array(Pays).min(1).describe('les pays de la zone'),
  prix: z.number().min(0).optional().describe('le prix d’un envoi vers la zone, quel que soit le colis ; absent : le `prix` de la livraison'),
  tranches: z.array(z.object({
    jusqua: z.number().positive().describe('le poids du colis, en kg, jusqu’auquel ce prix vaut (inclus)'),
    prix: z.number().min(0).describe('le prix de l’envoi, dans la devise'),
  })).max(TRANCHES_AU_PLUS).default([]).describe('le prix selon le poids du colis : la première tranche qui le contient ; plus lourd que la dernière, la zone ne prend pas le colis et le panier le dit. Chaque table vendue déclare alors son `poids`'),
  offerteDes: z.number().positive().nullable().optional().describe('le montant du panier à partir duquel l’envoi vers la zone est offert ; absent : celui de la livraison ; `null` : jamais offert'),
});
export type Zone = z.infer<typeof Zone>;

/** Un pays dans deux zones, des tranches sans poids : ce qui n'a pas de sens, dit. PURE. */
export function lireLesZones(zones: readonly Zone[], tablesVendues: ReadonlyArray<{ readonly nom: string; readonly poids?: string }>, ctx: z.RefinementCtx): void {
  const dire = (message: string): void => { ctx.addIssue({ code: 'custom', path: ['vente', 'livraison', 'zones'], message }); };
  const vu = new Map<string, string>();
  for (const z of zones) for (const p of z.pays) {
    const avant = vu.get(p);
    if (avant !== undefined && avant !== z.nom) dire(`le pays ${p} est dans deux zones (${avant}, ${z.nom}) : un pays n’a qu’un prix d’envoi`);
    vu.set(p, z.nom);
  }
  if (zones.some((z) => z.tranches.length > 0)) {
    for (const t of tablesVendues.filter((x) => !x.poids)) dire(`la livraison se paie au poids : la table ${t.nom} déclare le champ du poids d’une unité (\`vente.poids\`, en kg)`);
  }
}

/**
 * Les pays des zones sont desservis : ceux qui manquent à `livraison.pays` y sont ajoutés, et c'est dit (le panier de
 * l'app propose `livraison.pays`). Le sens ne change pas : une zone qui nomme un pays l'envoie là. PURE.
 */
export function lesZonesReparees(json: unknown): { readonly valeur: unknown; readonly repare: readonly string[] } {
  const brut = json as { vente?: { livraison?: { pays?: unknown; zones?: unknown } } } | null;
  const l = brut?.vente?.livraison;
  if (!l || typeof l !== 'object' || !Array.isArray(l.zones)) return { valeur: json, repare: [] };
  const desservis = Array.isArray(l.pays) ? (l.pays as unknown[]).filter((p): p is string => typeof p === 'string') : [];
  const desZones = (l.zones as unknown[]).flatMap((z) => (z && typeof z === 'object' && Array.isArray((z as { pays?: unknown }).pays)
    ? ((z as { pays: unknown[] }).pays).filter((p): p is string => typeof p === 'string') : []));
  const manquent = [...new Set(desZones.filter((p) => !desservis.includes(p)))];
  if (manquent.length === 0) return { valeur: json, repare: [] };
  return {
    valeur: { ...brut, vente: { ...brut!.vente, livraison: { ...l, pays: [...desservis, ...manquent] } } },
    repare: [`les pays des zones de livraison sont desservis : ${manquent.join(', ')} ajouté(s) à \`vente.livraison.pays\``],
  };
}
