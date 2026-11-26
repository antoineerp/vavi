/** L'administration : qui l'ouvre, ce que le tableau calcule, chaque geste relu, appliqué et noté. */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { estAdministrateur, leTableau, lesTableauxDeBord, lEtatDesServices, type LeTableauBrut } from '@/lib/administration/le-tableau';
import { changerLesPrix, creerUneReduction, lesCentimes, offrir, retirerUneReduction, type DependancesDeLAdministration } from '@/lib/administration/les-gestes';
import { CHEMIN_DE_LA_MIGRATION_DE_L_ADMINISTRATION, laMigrationDeLAdministration } from '@/lib/administration/le-sql-de-l-administration';

const A = 'aaaaaaaa-0000-4000-8000-00000000000a';
const B = 'bbbbbbbb-0000-4000-8000-00000000000b';
const C = 'cccccccc-0000-4000-8000-00000000000c';
const JOUR = 24 * 3600 * 1000;
const T = Date.parse('2026-11-24T12:00:00Z');
const iso = (ms: number) => new Date(ms).toISOString();

it('la migration de l’administration est celle que sa source écrit', () => {
  expect(readFileSync(join(process.cwd(), CHEMIN_DE_LA_MIGRATION_DE_L_ADMINISTRATION), 'utf8')).toBe(laMigrationDeLAdministration());
});

describe('qui ouvre la page', () => {
  it('un identifiant, ou une adresse CONFIRMÉE de la liste ; liste vide ou absente : personne', () => {
    expect(estAdministrateur(`antoine@exemple.fr, ${B}`, { id: A, courriel: 'Antoine@Exemple.fr', confirme: true })).toBe(true);
    expect(estAdministrateur(`antoine@exemple.fr`, { id: A, courriel: 'antoine@exemple.fr', confirme: false })).toBe(false);
    expect(estAdministrateur(`${B}`, { id: B, courriel: null, confirme: false })).toBe(true);
    expect(estAdministrateur(`${B}`, { id: A, courriel: 'b@b.fr', confirme: true })).toBe(false);
    expect(estAdministrateur('', { id: A, courriel: 'a@a.fr', confirme: true })).toBe(false);
    expect(estAdministrateur(undefined, { id: A, courriel: 'a@a.fr', confirme: true })).toBe(false);
  });
});

describe('le tableau', () => {
  const brut: LeTableauBrut = {
    projets: [
      { id: '11111111-1111-4111-8111-111111111111', proprietaire: A, nom: 'Vélos', cree_le: iso(T - 40 * JOUR), en_ligne: true, en_ligne_le: iso(T - JOUR), modifie_le: iso(T), nature: 'boutique', visites: 12 },
      { id: '22222222-2222-4222-8222-222222222222', proprietaire: B, nom: 'Cabinet', cree_le: iso(T - 5 * JOUR), en_ligne: false, en_ligne_le: null, modifie_le: iso(T), nature: 'site', visites: 0 },
    ],
    abonnements: [
      { compte: A, offre: 'boutique', projets_en_plus: 1, statut: 'active', fin_de_periode: iso(T + 10 * JOUR), impaye_depuis: null, resilie_a_la_fin: false, montant_centimes: 6400, cree_le: iso(T - 2 * JOUR), modifie_le: iso(T), abonnement_stripe: 'sub_A000001' },
      { compte: B, offre: 'site', projets_en_plus: 0, statut: 'past_due', fin_de_periode: iso(T - 2 * JOUR), impaye_depuis: iso(T - 2 * JOUR), resilie_a_la_fin: false, montant_centimes: 1900, cree_le: iso(T - 60 * JOUR), modifie_le: iso(T), abonnement_stripe: 'sub_B000001' },
      { compte: C, offre: 'site', projets_en_plus: 0, statut: 'canceled', fin_de_periode: null, impaye_depuis: null, resilie_a_la_fin: false, montant_centimes: 1900, cree_le: iso(T - 90 * JOUR), modifie_le: iso(T - 3 * JOUR), abonnement_stripe: 'sub_C000001' },
    ],
    offerts: [{ compte: C, offre: 'pro', projets_en_plus: 0, jusqu_au: iso(T + 30 * JOUR), motif: 'ami' }],
    reductions: [], tarifs: { site: 2400 },
    ventes: [{ schema: 'app_11111111_1111_4111_8', devise: 'eur', nombre: 3, centimes: 15000, recentes: 2 }],
    builds_en_echec: [], gestes: [],
  };
  const comptes = [A, B, C].map((id, i) => ({ id, courriel: `${'abc'[i]}@x.fr`, creeLe: iso(T - i * JOUR), derniereConnexion: null }));
  const t = leTableau(brut, comptes, T, (p) => `app_${p.slice(0, 20).replace(/-/g, '_')}`);
  it('le revenu mensuel : ce que facturent les abonnements actifs et en grâce, jamais l’offert ni le résilié', () => {
    expect(t.revenus).toMatchObject({ mensuel: 8300, abonnes: 2, offerts: 1, enGrace: 1, suspendus: 0, nouveauxCeMois: 1, resiliesCeMois: 1, sansMontant: 0 });
    expect(t.comptes.find((c) => c.id === C)).toMatchObject({ etat: { etat: 'actif', offre: 'pro', offert: true }, montant: null });
  });
  it('les ventes rangées sous leur boutique, les visites par site, la grille changée', () => {
    expect(t.projets[0]!.ventes).toEqual({ nombre: 3, recentes: 2, montants: '150.00 EUR' });
    expect(t.projets[1]!.ventes).toBeNull();
    expect(t.visites).toEqual({ total: 12, parSite: [{ nom: 'Vélos', visites: 12 }] });
    expect(t.grille.site).toBe(2400);
  });
  it('les services : le nom des secrets qui manquent, jamais leur valeur', () => {
    const s = lEtatDesServices({ RESEND_API_KEY: 're_secret', VAVI_EXPEDITEUR: 'vavi@exemple.fr', VAVI_ADMINS: ' ' });
    expect(s.find((x) => x.service === 'Courriel (Resend)')?.manquent).toEqual([]);
    expect(s.find((x) => x.service === 'Administration')?.manquent).toEqual(['VAVI_ADMINS']);
    expect(JSON.stringify(s)).not.toContain('re_secret');
  });
  it('le stockage posé par Fly (noms AWS_*) compte comme posé', () => {
    const tigris = { AWS_ENDPOINT_URL_S3: 'https://fly.storage.tigris.dev', AWS_ACCESS_KEY_ID: 'tid', AWS_SECRET_ACCESS_KEY: 'tsec', BUCKET_NAME: 'b' };
    expect(lEtatDesServices(tigris).find((x) => x.service === 'Stockage des sites (S3)')?.manquent).toEqual([]);
    expect(lEtatDesServices({}).find((x) => x.service === 'Stockage des sites (S3)')?.manquent).toEqual(['S3_ENDPOINT', 'S3_BUCKET', 'S3_ACCESS_KEY', 'S3_SECRET_KEY']);
  });
});

describe('les gestes', () => {
  const d = (x: Partial<DependancesDeLAdministration> = {}) => {
    const notes: unknown[] = []; const appels: { url: string; body?: string }[] = []; const poses: unknown[] = [];
    const deps: DependancesDeLAdministration = { admin: B, cle: 'sk_test_vavi', maintenant: T,
      stripe: async (url, init) => { appels.push({ url, body: init.body }); return { ok: !url.includes('sub_REFUSE1'), json: async () => (url.endsWith('/coupons') ? { id: 'cpn_noel' } : { error: { message: 'non' } }) }; },
      existe: async (c) => c === A,
      poserLOffert: async (c, o) => { poses.push({ c, ...o }); return null; }, retirerLOffert: async () => null,
      poserLesTarifs: async (t) => { poses.push(t); return null; },
      ajouterLaReduction: async (r) => { poses.push(r); return null; }, retirerLaReduction: async () => null,
      lesAbonnementsEnCours: async (c) => ({ lu: true, valeur: c ? [{ compte: A, abonnement: 'sub_A000001' }] : [{ compte: A, abonnement: 'sub_A000001' }, { compte: B, abonnement: 'sub_REFUSE1' }] }),
      noter: async (geste, cible, detail) => { notes.push({ geste, cible, detail }); }, ...x };
    return { deps, notes, appels, poses };
  };
  it('offrir : un compte qui existe, une offre de la grille, une durée bornée ; noté au journal', async () => {
    const x = d();
    expect(await offrir(x.deps, { compte: A, offre: 'pro', enPlus: '2', mois: '3', motif: ' partenaire ' })).toEqual({ fait: true, dit: `offert jusqu’au ${iso(T + 90 * JOUR).slice(0, 10)}` });
    expect(x.poses).toEqual([{ c: A, offre: 'pro', projetsEnPlus: 2, jusquAu: iso(T + 90 * JOUR), motif: 'partenaire' }]);
    expect(x.notes).toMatchObject([{ geste: 'offrir', cible: A }]);
    expect(await offrir(x.deps, { compte: C, offre: 'pro', enPlus: '0', mois: '1', motif: '' })).toEqual({ fait: false, pourquoi: 'compte inconnu' });
    expect(await offrir(x.deps, { compte: A, offre: 'gratuit_a_vie', enPlus: '0', mois: '1', motif: '' })).toMatchObject({ fait: false });
    expect(await offrir(x.deps, { compte: A, offre: 'site', enPlus: '0', mois: '0', motif: '' })).toMatchObject({ fait: false });
    expect(x.notes).toHaveLength(1);
  });
  it('les prix saisis en euros, lus au centime ; un prix illisible n’écrit rien', async () => {
    expect([lesCentimes('19'), lesCentimes('19,9'), lesCentimes('19.95 €'), lesCentimes(''), lesCentimes('-3'), lesCentimes('1e3')]).toEqual([1900, 1990, 1995, undefined, null, null]);
    const x = d();
    expect(await changerLesPrix(x.deps, { site: '24', boutique: '', pro: '119,5', enPlus: undefined })).toMatchObject({ fait: true });
    expect(x.poses).toEqual([{ site: 2400, pro: 11950 }]);
    expect(await changerLesPrix(x.deps, { site: 'gratuit' })).toEqual({ fait: false, pourquoi: 'prix illisible : site' });
    expect(await changerLesPrix(x.deps, {})).toMatchObject({ fait: false });
  });
  it('une réduction pour tous : un coupon Stripe, posé sur chaque abonnement en cours, un refus compté sans arrêter les autres', async () => {
    const x = d();
    const r = await creerUneReduction(x.deps, { compte: 'tous', pourcent: '20', mois: '3', jours: '' });
    expect(r).toMatchObject({ fait: true });
    expect(r.fait && r.dit).toContain('posée sur 1 abonnement(s) en cours sur 2');
    expect(new URLSearchParams(x.appels[0]!.body).get('percent_off')).toBe('20');
    expect(new URLSearchParams(x.appels[0]!.body).get('duration_in_months')).toBe('3');
    expect(x.appels.slice(1).map((a) => [a.url.split('/').pop(), new URLSearchParams(a.body).get('discounts[0][coupon]')])).toEqual([['sub_A000001', 'cpn_noel'], ['sub_REFUSE1', 'cpn_noel']]);
    expect(x.poses).toEqual([{ compte: null, pourcent: 20, mois: 3, coupon: 'cpn_noel', valableJusquAu: iso(T + 30 * JOUR) }]);
    expect(x.notes).toMatchObject([{ geste: 'creer_une_reduction', detail: { posees: 1, echecs: 1 } }]);
  });
  it('une réduction refusée avant Stripe : compte inconnu, pourcentage ou durée hors bornes, clé absente', async () => {
    const x = d();
    expect(await creerUneReduction(x.deps, { compte: C, pourcent: '20', mois: '3', jours: '' })).toEqual({ fait: false, pourquoi: 'compte inconnu' });
    expect(await creerUneReduction(x.deps, { compte: A, pourcent: '120', mois: '3', jours: '' })).toMatchObject({ fait: false });
    expect(await creerUneReduction(x.deps, { compte: A, pourcent: '20', mois: '40', jours: '' })).toMatchObject({ fait: false });
    expect(await creerUneReduction(d({ cle: null }).deps, { compte: A, pourcent: '20', mois: '3', jours: '' })).toMatchObject({ fait: false });
    expect(x.appels).toHaveLength(0);
    expect(await retirerUneReduction(x.deps, 'pas-un-id')).toMatchObject({ fait: false });
  });
});

// INCIDENT 26/11 (Antoine) : le lien de l'administration menait à la console : la connexion ne reconnaissait pas `/admin`
// comme suite et renvoyait à « Mes projets ». Et la page ne montrait ni Supabase, ni Fly, ni Stripe.
describe('INCIDENT 26/11 — l’administration s’atteint, et mène à l’hébergement', () => {
  it('la connexion reprend `/admin` comme suite ; la barre du compte y mène l’administrateur', () => {
    const connexion = readFileSync(join(process.cwd(), 'app', 'connexion', 'page.tsx'), 'utf8');
    const suite = new RegExp(/test\((\/\^.*\$\/)\.test|(\/\^\\\/\(projets[^\n]*\$\/)/.exec(connexion)![2]!.slice(1, -1));
    expect(suite.test('/admin')).toBe(true);
    expect(readFileSync(join(process.cwd(), 'app', '_partage', 'la-barre-du-compte.tsx'), 'utf8')).toContain("lien('/admin', 'admin'");
  });
  it('les tableaux de bord tirés de la configuration, sans aucun secret', () => {
    const t = lesTableauxDeBord({ NEXT_PUBLIC_SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co', FLY_APP_NAME: 'vavi-essai', FLY_REGION: 'cdg', VAVI_STRIPE_SECRET_KEY: 'sk_test_SECRET' });
    expect(t.map((x) => x.service)).toEqual(['Supabase', 'Fly.io', 'Stripe']);
    expect(t[0]!.liens[0]!.url).toBe('https://supabase.com/dashboard/project/abcdefghijklmnopqrst');
    expect(t[1]!.liens[0]!.url).toBe('https://fly.io/apps/vavi-essai');
    expect(t[2]!.liens[0]!.url).toBe('https://dashboard.stripe.com/test/payments');
    expect(JSON.stringify(t)).not.toContain('SECRET');
    expect(lesTableauxDeBord({})).toEqual([]);
  });
});

describe('INCIDENT 26/11 — la clé publiable de Stripe posée à la place de la secrète', () => {
  it('dite « mal posée », sans répéter la valeur', () => {
    const s = lEtatDesServices({ VAVI_STRIPE_SECRET_KEY: 'pk_test_VALEUR', VAVI_STRIPE_WEBHOOK_SECRET: 'whsec_x' });
    const ventes = s.find((x) => x.service === 'Stripe (ventes des apps)')!;
    expect(ventes.malFormes).toHaveLength(1);
    expect(ventes.malFormes[0]).toContain('VAVI_STRIPE_SECRET_KEY');
    expect(JSON.stringify(s)).not.toContain('VALEUR');
    expect(lEtatDesServices({ VAVI_STRIPE_SECRET_KEY: 'sk_test_x' }).every((x) => x.malFormes.length === 0)).toBe(true);
  });
});
