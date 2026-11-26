/**
 * LA PAGE D'ADMINISTRATION — qui l'ouvre, et ce qu'elle montre, calculé de ce que la base a agrégé. PUR.
 *   · `estAdministrateur` — le compte connecté est-il dans la liste que l'hébergeur pose (`VAVI_ADMINS` : des adresses ou
 *     des identifiants de compte, séparés par des virgules) ? Liste vide : personne ;
 *   · `leTableau` — comptes, abonnements et revenus du mois, projets et leurs visites, ventes par boutique, services.
 * Une mesure qui manque vaut `null` (« — »), jamais 0.
 *
 * Neuf dans vavi (lot 8, demande d'Antoine du 24/11).
 */
import { lEtat, lEtatAvecLOffert, estUneOffre, type EtatDeLAbonnement, type Grille, type Offert, laGrille } from '@/lib/abonnements/les-offres';

export const VARIABLE_DES_ADMINISTRATEURS = 'VAVI_ADMINS';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** PURE — le compte est-il administrateur ? Une adresse ne compte que confirmée par Supabase. */
export function estAdministrateur(liste: string | undefined, personne: { readonly id: string; readonly courriel: string | null; readonly confirme: boolean }): boolean {
  const entrees = (liste ?? '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
  return entrees.some((e) => (UUID.test(e) ? e === personne.id.toLowerCase() : personne.confirme && !!personne.courriel && e === personne.courriel.trim().toLowerCase()));
}

export interface UnCompte { readonly id: string; readonly courriel: string | null; readonly creeLe: string; readonly derniereConnexion: string | null }

/** Ce que `vavi_admin_le_tableau` rend (champs de la base, tels quels). */
export interface LeTableauBrut {
  readonly projets: readonly { id: string; proprietaire: string; nom: string; cree_le: string; en_ligne: boolean; en_ligne_le: string | null; modifie_le: string; nature: string | null; visites: number }[];
  readonly abonnements: readonly { compte: string; offre: string; projets_en_plus: number; statut: string; fin_de_periode: string | null; impaye_depuis: string | null;
    resilie_a_la_fin: boolean; montant_centimes: number | null; cree_le: string; modifie_le: string; abonnement_stripe: string | null }[];
  readonly offerts: readonly { compte: string; offre: string; projets_en_plus: number; jusqu_au: string; motif: string | null }[];
  readonly reductions: readonly { id: string; compte: string | null; pourcent: number; mois: number; coupon: string; valable_jusqu_au: string; retiree_le: string | null; cree_le: string }[];
  readonly tarifs: Readonly<Record<string, unknown>>;
  readonly ventes: readonly { schema: string; devise: string; nombre: number; centimes: number; recentes: number }[];
  readonly builds_en_echec: readonly { projet: string; le: string; ecarts: number }[];
  readonly gestes: readonly { geste: string; cible: string | null; detail: Record<string, unknown>; le: string }[];
}

export interface LigneDeCompte extends UnCompte {
  readonly projets: number; readonly enLigne: number;
  readonly etat: EtatDeLAbonnement;
  /** Ce que Stripe facture au compte par mois (avant réduction) ; `null` : offert, aucun, ou pas dit. */
  readonly montant: number | null;
}

export interface LeTableau {
  readonly comptes: readonly LigneDeCompte[];
  readonly grille: Grille;
  readonly revenus: {
    /** Revenu mensuel récurrent : la somme de ce que facturent les abonnements actifs ou en grâce, avant réductions. */
    readonly mensuel: number; readonly sansMontant: number;
    readonly abonnes: number; readonly offerts: number; readonly enGrace: number; readonly suspendus: number;
    readonly nouveauxCeMois: number; readonly resiliesCeMois: number;
  };
  readonly projets: readonly (LeTableauBrut['projets'][number] & { readonly courriel: string | null; readonly ventes: { readonly nombre: number; readonly recentes: number; readonly montants: string } | null })[];
  readonly visites: { readonly total: number; readonly parSite: readonly { readonly nom: string; readonly visites: number }[] };
  readonly reductions: LeTableauBrut['reductions'];
  readonly buildsEnEchec: LeTableauBrut['builds_en_echec'];
  readonly gestes: LeTableauBrut['gestes'];
}

/** PURE — le tableau, de la base agrégée et des comptes de Supabase. `schemaDe` : le schéma de la base d'un projet. */
export function leTableau(b: LeTableauBrut, comptes: readonly UnCompte[], maintenant: number, schemaDe: (projet: string) => string | null): LeTableau {
  const debutDuMois = (() => { const d = new Date(maintenant); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1); })();
  const abonnement = new Map(b.abonnements.map((a) => [a.compte, a]));
  const offert = new Map(b.offerts.flatMap((o): [string, Offert][] => (estUneOffre(o.offre) ? [[o.compte, { offre: o.offre, projetsEnPlus: o.projets_en_plus, jusquAu: o.jusqu_au }]] : [])));
  const courriel = new Map(comptes.map((c) => [c.id, c.courriel]));
  const lignes = comptes.map((c): LigneDeCompte => {
    const a = abonnement.get(c.id);
    const paye = lEtat(a && estUneOffre(a.offre) ? { offre: a.offre, projetsEnPlus: a.projets_en_plus, statut: a.statut, finDePeriode: a.fin_de_periode,
      impayeDepuis: a.impaye_depuis, resilieALaFin: a.resilie_a_la_fin } : null, maintenant);
    const etat = lEtatAvecLOffert(paye, offert.get(c.id) ?? null, maintenant);
    const siens = b.projets.filter((p) => p.proprietaire === c.id);
    const facture = (paye.etat === 'actif' || paye.etat === 'grace') && !(etat.etat === 'actif' && etat.offert);
    return { ...c, projets: siens.length, enLigne: siens.filter((p) => p.en_ligne).length, etat, montant: facture ? a?.montant_centimes ?? null : null };
  }).sort((x, y) => y.creeLe.localeCompare(x.creeLe));
  const factures = lignes.filter((l) => (l.etat.etat === 'actif' && !l.etat.offert) || l.etat.etat === 'grace');
  const ventes = new Map<string, LeTableauBrut['ventes'][number][]>();
  for (const v of b.ventes) ventes.set(v.schema, [...(ventes.get(v.schema) ?? []), v]);
  const projets = b.projets.map((p) => {
    const s = ventes.get(schemaDe(p.id) ?? '') ?? [];
    return { ...p, courriel: courriel.get(p.proprietaire) ?? null, ventes: s.length ? { nombre: s.reduce((n, v) => n + Number(v.nombre), 0), recentes: s.reduce((n, v) => n + Number(v.recentes), 0),
      montants: s.map((v) => `${(Number(v.centimes) / 100).toFixed(2)} ${v.devise.toUpperCase()}`).join(' + ') } : null };
  });
  return {
    comptes: lignes,
    grille: laGrille(b.tarifs),
    revenus: {
      mensuel: factures.reduce((n, l) => n + (l.montant ?? 0), 0), sansMontant: factures.filter((l) => l.montant === null).length,
      abonnes: factures.length, offerts: lignes.filter((l) => l.etat.etat === 'actif' && l.etat.offert).length,
      enGrace: lignes.filter((l) => l.etat.etat === 'grace').length, suspendus: lignes.filter((l) => l.etat.etat === 'suspendu').length,
      nouveauxCeMois: b.abonnements.filter((a) => Date.parse(a.cree_le) >= debutDuMois).length,
      resiliesCeMois: b.abonnements.filter((a) => a.statut === 'canceled' && Date.parse(a.modifie_le) >= debutDuMois).length,
    },
    projets,
    visites: { total: b.projets.reduce((n, p) => n + Number(p.visites), 0),
      parSite: b.projets.filter((p) => Number(p.visites) > 0).map((p) => ({ nom: p.nom, visites: Number(p.visites) })).sort((x, y) => y.visites - x.visites) },
    reductions: b.reductions, buildsEnEchec: b.builds_en_echec, gestes: b.gestes,
  };
}

/** Les secrets dont vavi a besoin, par service : leur NOM seul, jamais leur valeur. */
export const LES_SERVICES: readonly { readonly service: string; readonly secrets: readonly string[] }[] = [
  { service: 'Supabase', secrets: ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'] },
  // « A|B » : l'un ou l'autre ; le second est le nom que Fly pose en attachant un stockage Tigris.
  { service: 'Stockage des sites (S3)', secrets: ['S3_ENDPOINT|AWS_ENDPOINT_URL_S3', 'S3_BUCKET|BUCKET_NAME', 'S3_ACCESS_KEY|AWS_ACCESS_KEY_ID', 'S3_SECRET_KEY|AWS_SECRET_ACCESS_KEY'] },
  { service: 'Stripe (ventes des apps)', secrets: ['VAVI_STRIPE_SECRET_KEY', 'VAVI_STRIPE_WEBHOOK_SECRET'] },
  { service: 'Stripe (abonnements à vavi)', secrets: ['VAVI_STRIPE_SECRET_KEY', 'VAVI_STRIPE_WEBHOOK_ABONNEMENTS'] },
  { service: 'Courriel (Resend)', secrets: ['RESEND_API_KEY', 'VAVI_EXPEDITEUR'] },
  { service: 'Connecteur Claude (jetons)', secrets: ['VAVI_CLE_DES_JETONS'] },
  { service: 'Administration', secrets: [VARIABLE_DES_ADMINISTRATEURS] },
];

/**
 * PURE — les tableaux de bord de l'hébergement, tirés de la configuration du serveur : le projet Supabase (de son
 * adresse), l'app Fly (`FLY_APP_NAME`, que Fly pose), Stripe (test ou réel selon la clé). Aucun secret n'en sort.
 */
export function lesTableauxDeBord(env: Readonly<Record<string, string | undefined>>): readonly { readonly service: string; readonly liens: readonly { readonly libelle: string; readonly url: string }[]; readonly detail?: string }[] {
  const ref = /^https:\/\/([a-z0-9]{10,40})\.supabase\.co\/?$/.exec(env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? '')?.[1];
  const fly = /^[a-z0-9-]{1,63}$/.exec(env.FLY_APP_NAME?.trim() ?? '')?.[0];
  const cle = env.VAVI_STRIPE_SECRET_KEY?.trim() ?? '';
  const stripe = cle ? `https://dashboard.stripe.com/${cle.startsWith('sk_test_') || cle.startsWith('rk_test_') ? 'test/' : ''}` : null;
  return [
    ...(ref ? [{ service: 'Supabase', detail: `projet ${ref}`, liens: [
      { libelle: 'Tableau de bord', url: `https://supabase.com/dashboard/project/${ref}` },
      { libelle: 'Comptes', url: `https://supabase.com/dashboard/project/${ref}/auth/users` },
      { libelle: 'Éditeur SQL', url: `https://supabase.com/dashboard/project/${ref}/sql/new` },
      { libelle: 'Tables', url: `https://supabase.com/dashboard/project/${ref}/editor` },
      { libelle: 'Journaux', url: `https://supabase.com/dashboard/project/${ref}/logs/explorer` },
    ] }] : []),
    ...(fly ? [{ service: 'Fly.io', detail: `app ${fly}${env.FLY_REGION ? `, région ${env.FLY_REGION}` : ''}${env.FLY_IMAGE_REF ? `, image ${env.FLY_IMAGE_REF.split(':').pop()}` : ''}`, liens: [
      { libelle: 'Tableau de bord', url: `https://fly.io/apps/${fly}` },
      { libelle: 'Journaux', url: `https://fly.io/apps/${fly}/monitoring` },
      { libelle: 'Secrets', url: `https://fly.io/apps/${fly}/secrets` },
      { libelle: 'Certificats', url: `https://fly.io/apps/${fly}/certificates` },
    ] }] : []),
    ...(stripe ? [{ service: 'Stripe', detail: stripe.endsWith('test/') ? 'mode test' : 'mode réel', liens: [
      { libelle: 'Paiements', url: `${stripe}payments` },
      { libelle: 'Abonnements', url: `${stripe}subscriptions` },
      { libelle: 'Clients', url: `${stripe}customers` },
      { libelle: 'Comptes connectés', url: `${stripe}connect/accounts/overview` },
    ] }] : []),
  ];
}

/** PURE — chaque service et les secrets qui lui manquent. */
export const lEtatDesServices = (env: Readonly<Record<string, string | undefined>>) =>
  LES_SERVICES.map((s) => ({ service: s.service, manquent: s.secrets.filter((n) => !n.split('|').some((u) => env[u]?.trim())).map((n) => n.split('|')[0]!) }));
