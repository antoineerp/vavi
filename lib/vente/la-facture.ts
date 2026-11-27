// Repris de constructor-v13@5bb786e : lib/bascule/la-facture.ts (`laFacture`)
/**
 * LA PAGE DE LA FACTURE — PUR. Ce que la commande payée porte (son numéro posé en base, ses lignes au prix payé, l'envoi,
 * la ventilation de la TVA calculée à l'ouverture, l'acheteur) et le vendeur tel qu'app.json le déclare ; « — » ce qui
 * manque, jamais inventé. Servie par la plateforme à qui porte le jeton de la commande.
 */
import type { Boutique } from './la-boutique';
import { lesMots } from './la-boutique';
import type { Ventilation } from './le-chiffrage';

/** La commande telle que la base la rend (`app_lire_une_commande`). */
export interface CommandeFacturee {
  readonly id: string;
  readonly vente_facture: { readonly numero: string; readonly emise_le: string };
  readonly vente_lignes?: ReadonlyArray<{ readonly libelle?: unknown; readonly centimes?: unknown; readonly quantite?: unknown; readonly taux?: unknown }> | null;
  readonly vente_livraison_centimes?: number | null;
  readonly vente_montant_centimes?: number | null;
  readonly vente_devise?: string | null;
  readonly vente_nom?: string | null;
  readonly vente_courriel?: string | null;
  readonly vente_adresse?: Readonly<Record<string, unknown>> | null;
  readonly vente_tva?: Ventilation | null;
  readonly vente_mode?: string | null;
}

const echapper = (t: string): string => t.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Un montant dans la langue de l'app ; une mesure absente : « — », jamais 0. */
export const enDevise = (langue: string, devise: string) => (centimes: number | null | undefined): string => {
  if (typeof centimes !== 'number') return '—';
  try { return new Intl.NumberFormat(langue, { style: 'currency', currency: devise }).format(centimes / 100); } catch { return `${(centimes / 100).toFixed(2)} ${devise}`; }
};

/** `electronique` : l'adresse relative du XML Factur-X de cette facture, offerte en lien ; absente : aucun lien. */
export function laFacture(b: Boutique, c: CommandeFacturee, electronique?: string): string {
  const M = lesMots(b.langue);
  const prix = enDevise(b.langue, c.vente_devise ?? b.devise);
  const a = c.vente_adresse ?? {};
  const texte = (xs: unknown[]): string[] => xs.filter((x): x is string => typeof x === 'string' && x.trim() !== '');
  const acheteur = texte([a.societe, c.vente_nom, typeof a.siren === 'string' ? `SIREN ${a.siren}` : null, typeof a.tva === 'string' ? `TVA ${a.tva}` : null, a.line1, a.line2, [a.postal_code, a.city].filter((x) => typeof x === 'string').join(' '), a.country, c.vente_courriel]);
  const v = c.vente_tva ?? null;
  const lignes = (c.vente_lignes ?? []).map((l) => {
    const q = typeof l.quantite === 'number' ? l.quantite : 1;
    const u = typeof l.centimes === 'number' ? l.centimes : null;
    return [String(l.libelle ?? ''), String(q), prix(u), typeof l.taux === 'number' && v?.nonApplicable === null ? `${l.taux} %` : '—', prix(u === null ? null : u * q)];
  });
  if (c.vente_mode === 'retrait') lignes.push([M.retrait, '1', prix(0), '—', prix(0)]);
  else if ((c.vente_livraison_centimes ?? 0) > 0) lignes.push([M.livraison, '1', prix(c.vente_livraison_centimes), '—', prix(c.vente_livraison_centimes)]);
  const somme = (k: 'htCentimes' | 'tvaCentimes') => (v && v.nonApplicable === null ? v.parTaux.reduce((t, x) => t + x[k], 0) : null);
  const tableau = (tete: readonly string[], corps: ReadonlyArray<readonly string[]>) => `<table><thead><tr>${tete.map((t) => `<th>${echapper(t)}</th>`).join('')}</tr></thead>`
    + `<tbody>${corps.map((r) => `<tr>${r.map((x) => `<td>${echapper(x)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  const ventilation = v === null ? `<p>${echapper(M.tvaNonCalculable)}</p>` : v.nonApplicable !== null ? `<p>${echapper(v.nonApplicable)}</p>`
    : tableau([M.taux, M.horsTaxe, M.tva, M.ttc], v.parTaux.map((x) => [`${x.taux} %`, prix(x.htCentimes), prix(x.tvaCentimes), prix(x.ttcCentimes)]));
  const titre = `${M.facture} ${c.vente_facture.numero}`;
  const date = new Date(c.vente_facture.emise_le);
  return `<!doctype html><html lang="${echapper(b.langue)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">`
    + `<title>${echapper(titre)}</title><style>body{font:14px/1.5 system-ui,sans-serif;color:#111;background:#fff;max-width:820px;margin:0 auto;padding:24px 16px}`
    + 'table{width:100%;border-collapse:collapse;margin:12px 0}th,td{text-align:left;padding:6px 8px;border-bottom:1px solid #ddd}'
    + '.colonnes{display:grid;gap:24px;grid-template-columns:repeat(auto-fit,minmax(220px,1fr))}</style></head><body>'
    + `<h1>${echapper(titre)}</h1><p>${echapper(M.emiseLe)} ${echapper(Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString(b.langue))}</p>`
    + `<div class="colonnes"><section><h2>${echapper(M.vendeur)}</h2><p>${b.vendeur.map(echapper).join('<br>') || '—'}</p></section>`
    + `<section><h2>${echapper(M.factureA)}</h2><p>${acheteur.map(echapper).join('<br>') || '—'}</p></section></div>`
    + tableau([M.article, M.quantite, M.prixUnitaire, M.taux, M.montant], lignes) + ventilation
    + tableau([M.horsTaxe, M.tva, M.ttc], [[prix(somme('htCentimes')), prix(somme('tvaCentimes')), prix(c.vente_montant_centimes)]])
    + (electronique ? `<p><a href="${echapper(electronique)}" download>${echapper(M.factureElectronique)}</a></p>` : '')
    + '</body></html>';
}
