// Repris de constructor-v13@5bb786e : lib/bascule/la-vente.ts (`chiffrerLePanier`, `ouvrirLaVente`, `confirmerLaVente`, `lireLaFacture`)
/**
 * LA VENTE D'UNE APP — le prix lu en base, la commande payée par la confirmation signée, une fois par paiement.
 *   · `chiffrerLePanier` — le panier de l'app envoie des lignes ; la plateforme les chiffre en base et rend le récapitulatif ;
 *   · `ouvrirLaVente` — la commande naît au prix lu, à son acheteur (ou au propriétaire, pour un achat sans compte), puis
 *     la page de paiement de Stripe s'ouvre, SUR LE COMPTE STRIPE DU PROPRIÉTAIRE, que vavi lui a ouvert (Stripe Connect,
 *     `lib/stripe-connect`) : l'argent va chez lui, jamais chez vavi ;
 *   · `confirmerLaVente` — le webhook SIGNÉ de vavi (un seul, pour tous les comptes reliés), venu du compte du projet : le
 *     montant encaissé est relu contre celui de la commande, et la BASE la fait
 *     payée (`commande_par_paiement`, que seule la plateforme exécute) ; rejoué, il ne refait rien ;
 *   · `lireLaFacture` — la facture, à qui porte le jeton de la commande.
 * L'accès payé (un rôle acheté) passe par le même webhook : `l-acces-paye.ts`.
 * Ce module ne lit ni le réseau ni les secrets lui-même : ses dépendances le font (`DependancesDeLaVente`), la route les
 * branche, les essais les jouent.
 */
import { lAdresseDeLApp, lAppDeLHote } from '@/lib/publication/les-adresses-des-apps';
import { timingSafeEqual } from 'node:crypto';
import { lireLeManifeste } from '@/lib/backend/app/manifeste';
import type { AppelDeLaBase } from '@/lib/relais/poser-la-base';
import { schemaDuProjet } from '@/lib/relais/le-schema-d-une-app';
import { laBoutique, lesMots, type Boutique } from './la-boutique';
import { chiffrer, laDestination, lePanierMontre, lesArticlesAPayer, lireLeCode, lireLesCoordonnees, lireLesLignes, type ArticleLu, type Refus, type RemiseLue } from './le-chiffrage';
import { lePaiementDeLEvenement, ouvrirUneSessionStripe, verifierLaSignature, type AppelStripe } from './stripe';
import { laFacture, type CommandeFacturee } from './la-facture';
import { leXmlFacturX, type FactureElectronique } from './le-factur-x';
import { accorderLAcces } from './l-acces-paye';

export interface DependancesDeLaVente {
  readonly rpc: AppelDeLaBase['rpc'];
  /** app.json du projet et son propriétaire ; `null` : ce projet n'existe pas. */
  leProjet(id: string): Promise<{ readonly lu: true; readonly valeur: { readonly proprietaire: string; readonly appJson: string | undefined } | null } | { readonly lu: false; readonly pourquoi: string }>;
  /**
   * Comment ce projet encaisse : la clé de vavi et le compte Stripe relié du propriétaire (`acct_…`), qui peut payer.
   * `null` : aucun compte relié qui encaisse (ou vavi n'est pas relié à Stripe).
   */
  leCompte(id: string): Promise<{ readonly cle: string; readonly compte: string } | null>;
  /** Le secret du webhook Connect de vavi ; `null` : pas posé chez l'hébergeur. */
  readonly secretDuWebhook: string | null;
  readonly stripe: AppelStripe;
  /** Ce que la vente dit au journal : l'étape et la cause, jamais une donnée de l'acheteur. */
  journal(ligne: string): void;
}

export type Reponse = { readonly statut: number; readonly corps: Record<string, unknown> };
const non = (r: Refus): Reponse => ({ statut: r.statut, corps: { error: r.raison } });
const refus = (statut: number, raison: string): Refus => ({ forme: 'refus', statut, raison });

interface Ouverte { readonly boutique: Boutique; readonly schema: string; readonly proprietaire: string }

async function laBoutiqueDuProjet(d: DependancesDeLaVente, id: string): Promise<Ouverte | Refus> {
  const schema = schemaDuProjet(id);
  if (!schema) return refus(404, 'unknown project');
  const p = await d.leProjet(id);
  if (!p.lu) { d.journal(`[vente] ${id.slice(0, 8)} — le projet ne se lit pas : ${p.pourquoi}`); return refus(503, 'try again in a moment'); }
  if (!p.valeur) return refus(404, 'unknown project');
  let json: unknown = null;
  try { json = JSON.parse(p.valeur.appJson ?? 'null'); } catch { json = null; }
  const m = lireLeManifeste(json);
  const b = m.ok ? laBoutique(m.manifeste) : null;
  return b ? { boutique: b, schema, proprietaire: p.valeur.proprietaire } : refus(404, 'this app does not sell');
}

type Panier = Extract<ReturnType<typeof chiffrer>, { forme: 'chiffre' }>['panier'];

/** Le panier chiffré en base : les articles de chaque table, puis la remise du code saisi. */
async function chiffrerEnBase(d: DependancesDeLaVente, o: Ouverte, corps: Record<string, unknown>): Promise<Panier | Refus> {
  const lignes = lireLesLignes(corps.lignes);
  if (typeof lignes === 'string') return refus(400, lignes);
  const lues = new Map<string, readonly ArticleLu[]>();
  for (const table of new Set(lignes.map((l) => l.table))) {
    const a = o.boutique.articles.get(table);
    if (!a) continue;
    const r = await d.rpc('app_articles_a_vendre', { p_schema: o.schema, p_table: table, p_prix: a.prix, p_libelle: a.libelle, p_stock: a.stock ?? null,
      p_tva: a.tva ?? null, p_poids: a.poids ?? null, p_options: a.options ?? null, p_categorie: a.categorie ?? null, p_ids: [...new Set(lignes.filter((l) => l.table === table).map((l) => l.id))] });
    if (r.error) { d.journal(`[vente] ${o.schema} — les articles de ${table} : ${r.error.message}`); return refus(503, 'try again in a moment'); }
    lues.set(table, (r.data ?? []) as ArticleLu[]);
  }
  const code = lireLeCode(corps.code);
  let remise: RemiseLue | null | undefined;
  const R = o.boutique.remise;
  if (code && R) {
    const r = await d.rpc('app_remise_du_code', { p_schema: o.schema, p_table: R.table, p_champ: R.code, p_code: code,
      p_pourcentage: R.pourcentage ?? null, p_montant: R.montant ?? null, p_actif: R.actif ?? null, p_fin: R.fin ?? null,
      p_minimum: R.minimum ?? null, p_utilisations: R.utilisations ?? null, p_premiere: R.premiere ?? null, p_cible: R.cible ?? null });
    if (r.error) { d.journal(`[vente] ${o.schema} — le code de remise : ${r.error.message}`); return refus(503, 'try again in a moment'); }
    remise = ((r.data ?? []) as RemiseLue[])[0] ?? null;
  }
  const c = chiffrer(o.boutique, lignes, lues, code, remise);
  return c.forme === 'chiffre' ? c.panier : c;
}

/** POST /api/pay/<projet>/panier — `{ lignes, destination, code }` : le panier au prix de la base. */
export async function chiffrerLePanier(d: DependancesDeLaVente, id: string, corps: Record<string, unknown>): Promise<Reponse> {
  const o = await laBoutiqueDuProjet(d, id);
  if ('forme' in o) return non(o);
  const p = await chiffrerEnBase(d, o, corps);
  if ('forme' in p) return non(p);
  return { statut: 200, corps: lePanierMontre(o.boutique, p, laDestination(corps.destination, o.boutique.livraison)) };
}

/**
 * L'adresse de retour : une page de ce projet, servie par vavi (l'aperçu ou le site, à leur hôte quand les apps ont leur
 * domaine, sinon sous `/p/` ou `/s/` de la console) ; sinon l'accueil du site.
 */
export function leRetour(brut: unknown, adresse: string, id: string, paye: boolean, domaine: string | null = null, nom: string | null = null): string {
  const accueil = new URL(lAdresseDeLApp(id, 'en_ligne', { console: adresse, domaine, nom }));
  let u: URL;
  try { u = new URL(typeof brut === 'string' ? brut : '', accueil); } catch { u = accueil; }
  const aSonHote = u.protocol === 'https:' && lAppDeLHote(u.host, domaine, nom ? new Map([[nom, id]]) : undefined)?.projet === id;
  const sousLaConsole = u.origin === new URL(adresse).origin && (u.pathname.startsWith(`/s/${id}/`) || u.pathname.startsWith(`/p/${id}/`));
  if (!aSonHote && !sousLaConsole) u = new URL(accueil);
  u.hash = '';
  if (paye) u.searchParams.set('payment', 'success'); else u.searchParams.delete('payment');
  return u.toString();
}

/**
 * POST /api/pay/<projet>/checkout — `{ lignes, acheteur, successUrl, cancelUrl, code }`. `compte` : l'acheteur connecté ;
 * `null` : un achat sans compte, rangé au propriétaire, qui le traite.
 */
export async function ouvrirLaVente(d: DependancesDeLaVente, id: string, corps: Record<string, unknown>, compte: string | null, adresse: string, domaine: string | null = null, nom: string | null = null): Promise<Reponse> {
  const o = await laBoutiqueDuProjet(d, id);
  if ('forme' in o) return non(o);
  const fr = o.boutique.langue === 'fr';
  const p = await chiffrerEnBase(d, o, corps);
  if ('forme' in p) return non(p);
  if (p.retirees.length > 0) return non(refus(409, fr ? 'Un article du panier n’existe plus : retirez-le, puis recommencez.' : 'An item in the cart no longer exists: remove it, then try again.'));
  if (p.remise && 'refusee' in p.remise) return non(refus(409, `${p.remise.raison ?? (fr ? `Le code « ${p.remise.code} » ne vaut pas` : `The code “${p.remise.code}” is not valid`)}${fr ? ' : retirez-le, puis recommencez.' : ': remove it, then try again.'}`));
  const acheteur = lireLesCoordonnees(corps.acheteur, o.boutique.livraison);
  if (typeof acheteur === 'string') return { statut: 400, corps: { error: fr ? 'Vos coordonnées sont incomplètes.' : 'Your details are incomplete.', detail: acheteur, code: 'coordonnees' } };
  const destination = acheteur.retrait ? { pays: null, retrait: true } : { pays: acheteur.adresse?.country ?? null, retrait: false };
  if (p.remise && 'premiere' in p.remise && p.remise.premiere) {
    const n = await d.rpc('app_commandes_du_courriel', { p_schema: o.schema, p_courriel: acheteur.courriel });
    if (n.error) { d.journal(`[vente] ${o.schema} — les commandes du courriel : ${n.error.message}`); return non(refus(503, fr ? 'Réessayez dans un instant.' : 'Try again in a moment.')); }
    if (Number(n.data) > 0) return non(refus(409, `${lesMots(o.boutique.langue).remisePremiere.replace('{code}', p.remise.code)}${fr ? ' : retirez-le, puis recommencez.' : ': remove it, then try again.'}`));
  }
  const encaisse = await d.leCompte(id);
  if (!encaisse) return { statut: 503, corps: { error: fr ? 'Le paiement n’est pas encore configuré pour cette boutique.' : 'Payment is not set up for this shop yet.', code: 'paiement-non-configure' } };
  const a = lesArticlesAPayer(o.boutique, p, destination);
  if ('impossible' in a.envoi) return non(refus(409, `${a.envoi.impossible}.`));
  const r = await d.rpc('app_ouvrir_une_commande', { p_schema: o.schema, p_compte: compte ?? o.proprietaire, p_lignes: a.lignes, p_montant: a.montant,
    p_livraison: a.frais, p_devise: o.boutique.devise, p_courriel: acheteur.courriel, p_nom: acheteur.nom, p_adresse: acheteur.adresse, p_tva: a.tva,
    p_mode: o.boutique.livraison.pays.length > 0 || acheteur.retrait ? (acheteur.retrait ? 'retrait' : 'expedition') : null,
    p_code: p.remise && 'centimes' in p.remise ? p.remise.code : null });
  const vendue = r.error && /« [^»]+ » ne se paie plus[^\n]*/.exec(r.error.message);
  if (vendue) return non(refus(409, `${vendue[0]}.`));
  if (r.error || typeof r.data !== 'string') {
    d.journal(`[vente] ${o.schema} — commande non ouverte : ${r.error?.message ?? 'aucun identifiant rendu'}`);
    return non(refus(503, fr ? 'La commande n’a pas pu être enregistrée ; rien n’a été encaissé, réessayez.' : 'The order could not be saved; nothing was charged, try again.'));
  }
  const s = await ouvrirUneSessionStripe(d.stripe, encaisse.cle, encaisse.compte, {
    devise: o.boutique.devise, articles: a.items, courriel: acheteur.courriel,
    metadonnees: { vavi_projet: id, vavi_commande: r.data, vavi_montant: String(a.montant), vavi_devise: o.boutique.devise },
    retourOk: leRetour(corps.successUrl, adresse, id, true, domaine, nom), retourAnnule: leRetour(corps.cancelUrl, adresse, id, false, domaine, nom),
  });
  if (!s.ouverte) { d.journal(`[vente] ${o.schema} — Stripe a refusé la session : ${s.pourquoi}`); return non(refus(502, fr ? 'Le paiement n’a pas pu s’ouvrir ; réessayez.' : 'Payment could not open; try again.')); }
  return { statut: 200, corps: { url: s.url } };
}

/**
 * POST /api/pay/webhook — le webhook Connect de vavi : les octets reçus et l'en-tête `stripe-signature`. Le projet est dans
 * les métadonnées que vavi a posées, et l'évènement doit venir du compte relié à CE projet (un autre compte ne paie pas
 * la commande d'un autre). 200 : fait, déjà fait, ou sans objet (Stripe ne rejoue pas) ; 400 : signature fausse ;
 * 500/503 : à rejouer (Stripe rejoue).
 */
export async function confirmerLaVente(d: DependancesDeLaVente, corps: string, signature: string | null): Promise<Reponse> {
  if (!d.secretDuWebhook) return { statut: 503, corps: { error: 'the Stripe webhook secret of vavi is not set' } };
  const v = verifierLaSignature(corps, signature, d.secretDuWebhook);
  if (!v.valide) { d.journal(`[vente] webhook refusé : ${v.motif}`); return { statut: 400, corps: { error: 'invalid signature' } }; }
  let e: { type?: unknown; account?: unknown; data?: { object?: Record<string, unknown> } };
  try { e = JSON.parse(corps) as typeof e; } catch { return { statut: 400, corps: { error: 'invalid body' } }; }
  const objet = e.data?.object ?? {};
  if (lePaiementDeLEvenement(String(e.type ?? ''), objet) !== 'paye') return { statut: 200, corps: { recu: true } };
  const meta = (objet.metadata ?? {}) as Record<string, unknown>;
  const id = typeof meta.vavi_projet === 'string' ? meta.vavi_projet.toLowerCase() : '';
  const schema = schemaDuProjet(id);
  const commande = typeof meta.vavi_commande === 'string' ? meta.vavi_commande : null;
  const attendu = Number(meta.vavi_montant);
  const acces = typeof meta.vavi_acces === 'string';
  if (!schema || (!acces && (!commande || !Number.isInteger(attendu)))) return { statut: 200, corps: { recu: true, sansObjet: true } };
  const compte = await d.leCompte(id);
  if (!compte || e.account !== compte.compte) {
    d.journal(`[vente] ${schema} — webhook d'un autre compte que celui du projet (${String(e.account ?? 'aucun')})`);
    return { statut: 200, corps: { recu: true, refusee: 'compte' } };
  }
  // UN ACCÈS PAYÉ (un rôle, pas une commande) : relu contre l'offre d'app.json, posé une fois.
  if (acces) return accorderLAcces(d, id, objet);
  if (!commande) return { statut: 200, corps: { recu: true, sansObjet: true } };
  const paye = typeof objet.amount_total === 'number' ? objet.amount_total : null;
  const devise = String(objet.currency ?? '').toUpperCase();
  if (paye === null || paye < attendu || devise !== meta.vavi_devise) {
    d.journal(`[vente] ${schema} — commande ${commande.slice(0, 8)} : encaissé ${paye ?? '?'} ${devise || '?'}, attendu ${attendu} ${String(meta.vavi_devise)}`);
    return { statut: 200, corps: { recu: true, refusee: 'montant' } };
  }
  const r = await d.rpc('app_confirmer_une_vente', { p_session: String(objet.id ?? ''), p_schema: schema, p_id: commande, p_montant: paye, p_devise: devise });
  if (r.error) {
    const code = (r.error as { code?: string }).code ?? '';
    d.journal(`[vente] ${schema} — confirmation de ${commande.slice(0, 8)} : ${r.error.message}`);
    return ['P0001', 'P0002', '22023'].includes(code) ? { statut: 200, corps: { recu: true, refusee: r.error.message } } : { statut: 500, corps: { error: 'retry' } };
  }
  const fait = (r.data ?? {}) as { deja?: boolean };
  if (fait.deja !== true) await apresLePaiement(d, id, schema, commande, objet);
  return { statut: 200, corps: { recu: true, deja: fait.deja === true } };
}

/** Une fois par paiement : les coordonnées recueillies par Stripe, la facture, le stock. Un manque est dit au journal ; le paiement reste confirmé. */
async function apresLePaiement(d: DependancesDeLaVente, id: string, schema: string, commande: string, objet: Record<string, unknown>): Promise<void> {
  const client = (objet.customer_details ?? {}) as Record<string, unknown>;
  const texte = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  const c = await d.rpc('app_completer_une_commande', { p_schema: schema, p_id: commande, p_courriel: texte(client.email), p_nom: texte(client.name), p_adresse: null, p_session: String(objet.id ?? '') });
  const manques: string[] = c.error ? [`coordonnées : ${c.error.message}`] : [];
  const f = await d.rpc('app_facturer_une_commande', { p_schema: schema, p_id: commande });
  if (f.error) manques.push(`facture : ${f.error.message}`);
  const o = await laBoutiqueDuProjet(d, id);
  const lignes = ((c.data ?? {}) as { vente_lignes?: unknown }).vente_lignes;
  if ('forme' in o) manques.push('stock : la boutique ne se lit plus');
  else for (const l of Array.isArray(lignes) ? lignes as { table?: unknown; id?: unknown; quantite?: unknown }[] : []) {
    const a = typeof l.table === 'string' ? o.boutique.articles.get(l.table) : undefined;
    if (!a?.stock || typeof l.id !== 'string' || typeof l.quantite !== 'number') continue;
    const s = await d.rpc('app_decompter_le_stock', { p_schema: schema, p_table: a.table, p_stock: a.stock, p_id: l.id, p_quantite: l.quantite });
    if (s.error) manques.push(`stock de ${a.table} : ${s.error.message}`);
  }
  if (manques.length > 0) d.journal(`[vente] ${schema} — commande ${commande.slice(0, 8)} payée ; ${manques.join(' ; ')}`);
}

/** Le jeton de la commande, comparé à temps constant ; un jeton court ou absent ne vaut rien. */
const leJetonEst = (attendu: unknown, recu: string): boolean => {
  if (typeof attendu !== 'string' || attendu.length < 32) return false;
  const [a, b] = [Buffer.from(attendu), Buffer.from(recu)];
  return a.length === b.length && timingSafeEqual(a, b);
};

/** GET /api/pay/<projet>/facture?commande=&jeton= — la page de la facture ; `null` : aucune facture à ce jeton. */
export async function lireLaFacture(d: DependancesDeLaVente, id: string, commande: string, jeton: string): Promise<string | null> {
  const o = await laBoutiqueDuProjet(d, id);
  if ('forme' in o || !commande || commande.length > 64) return null;
  const r = await d.rpc('app_lire_une_commande', { p_schema: o.schema, p_id: commande });
  if (r.error) { d.journal(`[vente] ${o.schema} — la facture : ${r.error.message}`); return null; }
  const c = (r.data ?? {}) as Partial<CommandeFacturee> & { readonly vente_jeton?: unknown };
  if (!leJetonEst(c.vente_jeton, jeton) || !c.vente_facture) return null;
  const xml = `?${new URLSearchParams({ commande, jeton, format: 'xml' }).toString()}`;
  return laFacture(o.boutique, c as CommandeFacturee, xml);
}

/**
 * GET /api/pay/<projet>/facture?commande=&jeton=&format=xml — la facture électronique (Factur-X, profil EN 16931) de la même
 * commande, à qui porte son jeton ; ou ce qui lui manque pour être conforme. `null` : aucune facture à ce jeton.
 */
export async function lireLaFactureElectronique(d: DependancesDeLaVente, id: string, commande: string, jeton: string): Promise<(FactureElectronique & { readonly numero: string }) | null> {
  const o = await laBoutiqueDuProjet(d, id);
  if ('forme' in o || !commande || commande.length > 64) return null;
  const r = await d.rpc('app_lire_une_commande', { p_schema: o.schema, p_id: commande });
  if (r.error) { d.journal(`[vente] ${o.schema} — la facture électronique : ${r.error.message}`); return null; }
  const c = (r.data ?? {}) as Partial<CommandeFacturee> & { readonly vente_jeton?: unknown };
  if (!leJetonEst(c.vente_jeton, jeton) || !c.vente_facture) return null;
  return { ...leXmlFacturX(o.boutique, o.boutique.electronique, c as CommandeFacturee, lesMots(o.boutique.langue).livraison), numero: c.vente_facture.numero };
}
