/**
 * LE CONTEXTE RÉEL DU SERVEUR MCP — les dépendances des gestes branchées sur la plateforme : la base sous la clé de
 * service (projets, pose de la base), le magasin des builds, l'atelier, les paquets du gabarit. Serveur seulement.
 */
import 'server-only';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { clientDeService } from '@/lib/supabase/service';
import { projetsSurSupabase } from '@/lib/projets/les-projets';
import { magasinS3 } from '@/lib/publication/le-magasin';
import { racineDuBuild } from '@/lib/publication/publier';
import { poserLEnvironnement, servirUnDist } from '@/lib/publication/servir';
import { leDomaineDesApps } from '@/lib/publication/les-adresses-des-apps';
import { construireLApp } from '@/lib/atelier/construire';
import { DOSSIER_DU_GABARIT } from '@/squelette/registre';
import { lesPaquetsDuGabarit, type Refus } from '@/lib/consignes';
import { adresseDeLaPlateforme } from './l-adresse';
import { scellerUnSecret } from './les-jetons';
import { lesFichiersDansLaPage, lesFichiersEnEntier } from './la-vue';
import { avecUneMemoire, etatSurSupabase, type EtatDeLAcces } from './l-etat-de-l-acces';
import { configurationPublique } from '@/lib/supabase/configuration';
import { schemaDuProjet } from '@/lib/relais/le-schema-d-une-app';
import { ouvrirLeNavigateur, preRendre } from '@/lib/seo/le-pre-rendu';
import { capturer, type NavigateurAPhotographier } from '@/lib/seo/les-captures';
import { jouerLeParcours, BASE_DU_PARCOURS, type NavigateurDuParcours } from '@/lib/parcours/le-parcours';
import { avecUneCopie } from '@/lib/parcours/la-copie';
import { laRouteDeLaCopie, type GestesDeLaCopie } from '@/lib/parcours/la-plateforme-de-la-copie';
import { entrer, envoyerUnLien, rafraichir, sInscrire, sortir, type Dependances as DependancesDesComptes, type Issue as IssueDesComptes } from '@/lib/comptes/les-comptes';
import { magasinSurSupabase } from '@/lib/comptes/sur-supabase';
import { chiffrerLePanier } from '@/lib/vente/la-vente';
import type { Manifeste } from '@/lib/backend/app/manifeste';
import { laCleDesComptes, signerUnJeton, DUREE_DU_JETON_S } from '@/lib/comptes/les-jetons';
import type { ContexteDuServeur } from './le-serveur';
import { abonnementsSurSupabase } from '@/lib/abonnements/sur-supabase';
import { lEtatDuCompte, laVueDeLAbonnement, leDroitDePublier } from '@/lib/abonnements/l-abonnement';
import { boiteSurSupabase, lesVisites } from '@/lib/formulaires/sur-supabase';
import { leManifesteStocke } from '@/lib/projets/l-arbre-d-un-projet';
import { banqueDeLaPlateforme } from '@/lib/images/la-banque';

const REFUS_PRECEDENTS = new Map<string, Refus>();
const LANGUES_DES_COMPTES = new Map<string, string>();
let gabarit: string | null = null;
const leGabarit = (): string => (gabarit ??= readFileSync(join(DOSSIER_DU_GABARIT, 'package.json'), 'utf8'));

/** La langue du compte (`user_metadata.langue`), lue une fois par processus ; `en` par défaut. */
async function laLangue(base: ReturnType<typeof clientDeService>, compte: string): Promise<string> {
  const connue = LANGUES_DES_COMPTES.get(compte);
  if (connue) return connue;
  const u = await base.auth.admin.getUserById(compte);
  const l = typeof u.data.user?.user_metadata?.langue === 'string' ? u.data.user.user_metadata.langue : 'en';
  if (!u.error) LANGUES_DES_COMPTES.set(compte, l);
  return l;
}

/** Les premières fois déjà notées par ce processus : la base n'est appelée qu'une fois par compte et par étape. */
const PREMIERES_FOIS_NOTEES = new Set<string>();

/**
 * Les routes de la plateforme jouées sur une copie de parcours : ses comptes (inscription sans validation, aucun
 * courriel envoyé), son panier chiffré au prix de la copie, sous l'app.json joué (`la-plateforme-de-la-copie`).
 */
function lesGestesDeLaCopie(base: ReturnType<typeof clientDeService>, cle: NonNullable<ReturnType<typeof laCleDesComptes>>, id: string, schema: string, m: Manifeste, proprietaire: string): GestesDeLaCopie {
  const d: DependancesDesComptes = { magasin: magasinSurSupabase(base), cle, maintenant: () => Date.now(), courrier: async () => true };
  const ctx = { app: schema, nomDeLApp: m.nom, langue: m.langues.principale, retour: '/' };
  const rendu = <T,>(r: IssueDesComptes<T>) => (r.ok ? { statut: 200, corps: r.valeur as unknown } : { statut: 400, corps: { error: r.refus } });
  const texte = (x: unknown, max = 300) => (typeof x === 'string' ? x.slice(0, max) : '');
  return {
    async comptes(geste, c) {
      switch (geste) {
        case 'inscrire': return rendu(await sInscrire(d, { ...ctx, email: texte(c.email), motDePasse: texte(c.motDePasse, 200), sansValidation: true }));
        case 'entrer': return rendu(await entrer(d, { app: schema, email: texte(c.email), motDePasse: texte(c.motDePasse, 200), sansValidation: true }));
        case 'lien': return rendu(await envoyerUnLien(d, { ...ctx, email: texte(c.email), nature: 'entrer' }));
        case 'oublie': return rendu(await envoyerUnLien(d, { ...ctx, email: texte(c.email), nature: 'mot_de_passe' }));
        case 'rafraichir': return rendu(await rafraichir(d, { app: schema, rafraichir: texte(c.rafraichir, 200) }));
        default: return rendu(await sortir(d, { rafraichir: texte(c.rafraichir, 200) }));
      }
    },
    panier: (c) => chiffrerLePanier({
      rpc: (f, a) => base.rpc(f, a), leProjet: async () => ({ lu: true, valeur: { proprietaire, appJson: JSON.stringify(m) } }),
      leCompte: async () => null, secretDuWebhook: null, stripe: () => Promise.reject(new Error('no Stripe in a journey')), journal: (l) => console.error(l),
    }, id, c),
  };
}

export async function leContexteReel(compte: string): Promise<ContexteDuServeur> {
  const base = clientDeService();
  const projets = projetsSurSupabase(base);
  const magasin = magasinS3();
  return {
    langue: await laLangue(base, compte),
    noter(etape) {
      const cle = `${compte}|${etape}`;
      if (PREMIERES_FOIS_NOTEES.has(cle)) return;
      void Promise.resolve(base.rpc('vavi_noter_une_premiere_fois', { p_compte: compte, p_etape: etape })).then((r) => {
        if (r.error) console.error(`[premier-site] ${etape} non notée : ${r.error.message}`); else PREMIERES_FOIS_NOTEES.add(cle);
      }, (e: unknown) => console.error(`[premier-site] ${etape} non notée : ${String(e)}`));
    },
    gabaritPackageJson: leGabarit(),
    async noteDuChantier(id) {
      const p = await projets.lire(compte, id);
      const ch = p.lu ? p.valeur?.chantier : null;
      if (!ch) return null;
      return [`# ${ch.intention}`, '', `Opened ${ch.ouvertLe}, ${ch.gestes} change(s), last at ${ch.dernierGesteLe}.`, '',
        '## Done', ...(ch.fait.length ? ch.fait.map((f) => `- ${f}`) : ['- nothing yet']), '', '## Still to do', ch.reste ?? 'not noted'].join('\n');
    },
    outils: {
      compte, projets, base, magasin: magasin.lu ? magasin.magasin : null,
      construire: (arbre, b) => construireLApp(arbre, b),
      async preRendre(projet, dist, m) {
        const publique = configurationPublique(process.env);
        const schema = schemaDuProjet(projet);
        if (!publique.lue || !schema) return null;
        const o = await ouvrirLeNavigateur([publique.valeur.url]);
        // La raison remonte au résultat de `build_preview` (« failed: … ») : sans elle, rien ne dit pourquoi le pré-rendu manque.
        if ('raison' in o) throw new Error(`no browser: ${o.raison}`);
        return preRendre(o.navigateur, dist, { env: { supabaseUrl: publique.valeur.url, cleAnonyme: publique.valeur.cleAnonyme, schema, projet },
          app: { nom: m.nom, description: m.description, langue: m.langues.principale, autres: m.langues.autres, editeur: m.editeur ?? null } });
      },
      async capturer(projet, dist, m) {
        const publique = configurationPublique(process.env);
        const schema = schemaDuProjet(projet);
        if (!publique.lue || !schema) return null;
        const images = [new URL(adresseDeLaPlateforme()).origin, 'https://images.unsplash.com'];
        const o = await ouvrirLeNavigateur([publique.valeur.url, ...images]);
        if ('raison' in o) return { captures: [], manquees: [o.raison] };
        return capturer(o.navigateur as unknown as NavigateurAPhotographier, dist, {
          env: { supabaseUrl: publique.valeur.url, cleAnonyme: publique.valeur.cleAnonyme, schema, projet }, langue: m.langues.principale, hotesDesImages: images });
      },
      async jouer(projet, empreinte, m, etapes, { copie: surCopie, role }) {
        const publique = configurationPublique(process.env);
        const schema = schemaDuProjet(projet);
        if (!publique.lue || !schema) return { raison: 'the database of the app is not configured' };
        if (!magasin.lu) return { raison: 'the storage of the builds is not configured' };
        const cle = surCopie ? laCleDesComptes(process.env) : null;
        if (surCopie && !cle) return { raison: 'the key of the app accounts is not set on this vavi server' };
        const images = [new URL(adresseDeLaPlateforme()).origin, 'https://images.unsplash.com'];
        const o = await ouvrirLeNavigateur([publique.valeur.url, ...images]);
        if ('raison' in o) return { raison: o.raison };
        const racine = racineDuBuild(projet, empreinte);
        const jouer = (s: string, plus: { session?: { cle: string; valeur: unknown }; plateforme?: (chemin: string, corps: string | null) => ReturnType<typeof laRouteDeLaCopie> } = {}) => {
          const env = { supabaseUrl: publique.valeur.url, cleAnonyme: publique.valeur.cleAnonyme, schema: s, projet, base: BASE_DU_PARCOURS };
          return jouerLeParcours(o.navigateur as unknown as NavigateurDuParcours, etapes, {
            lire: (segments) => servirUnDist(magasin.magasin, racine, segments, env), base: publique.valeur.url, images, langue: m.langues.principale,
            copie: surCopie, ...plus });
        };
        if (!surCopie || !cle) return jouer(schema);
        // Sur une copie : ses comptes, son panier, le paiement simulé (`la-plateforme-de-la-copie`) ; avec un rôle, la session
        // d'un compte d'essai signée par vavi (`lib/comptes`).
        const r = await avecUneCopie(base, m, compte, role, (c) => {
          const t = Math.floor(Date.now() / 1000);
          const gestes = lesGestesDeLaCopie(base, cle, c.id, c.schema, m, compte);
          return jouer(c.schema, { plateforme: (chemin, corps) => laRouteDeLaCopie(gestes, chemin, corps),
            ...(c.essai ? { session: { cle: `vavi-session-${c.schema}`, valeur: {
              jeton: signerUnJeton(cle, { compte: c.essai.compte, app: c.schema, email: c.essai.email }, t), rafraichir: 'parcours', expire: t + DUREE_DU_JETON_S,
              compte: { id: c.essai.compte, email: c.essai.email, confirme: true } } } } : {}) });
        });
        if (!r.ok) await o.navigateur.close().catch(() => undefined);
        return r.ok ? r.valeur : { raison: r.raison };
      },
      // Après la réponse de l'outil : le serveur de vavi est un processus qui dure (Fly), le travail va au bout.
      enArrierePlan(nom, travail) { void travail().catch((e: unknown) => console.error(`[arrière-plan] ${nom} : ${(e as Error)?.message ?? e}`)); },
      permis: lesPaquetsDuGabarit(leGabarit()),
      adresse: adresseDeLaPlateforme(),
      domaineDesApps: leDomaineDesApps(process.env),
      scellerUnSecret,
      refusPrecedents: REFUS_PRECEDENTS,
      banque: banqueDeLaPlateforme(),
      async abonnement() {
        const e = await lEtatDuCompte({ ...abonnementsSurSupabase(base), maintenant: Date.now() }, compte);
        return e.lu ? laVueDeLAbonnement(e.valeur, `${adresseDeLaPlateforme()}/abonnement`) : null;
      },
      vue: {
        domaines: (() => {
          const pub = configurationPublique(process.env);
          const domaine = leDomaineDesApps(process.env);
          // Les photos de la banque (`search_images`) et celles que la personne a fournies (servies par la console) s'affichent
          // aussi dans l'app montrée par la vue.
          const ressources = [...(domaine ? [`https://*.${domaine}`] : []), new URL(adresseDeLaPlateforme()).origin, 'https://images.unsplash.com'];
          return { ressources, connexions: [...ressources, ...(pub.lue ? [new URL(pub.valeur.url).origin] : [])] };
        })(),
        async pageDeLApercu(projet, empreinte, adresse) {
          const pub = configurationPublique(process.env);
          const schema = schemaDuProjet(projet);
          if (!magasin.lu || !pub.lue || !schema) return null;
          const o = await magasin.magasin.lire(`${racineDuBuild(projet, empreinte)}/index.html`);
          if (o === 'absent') return null;
          const html = poserLEnvironnement(o.octets.toString('utf8'), { supabaseUrl: pub.valeur.url, cleAnonyme: pub.valeur.cleAnonyme, schema, base: '/', projet, console: adresseDeLaPlateforme(), api: new URL(adresse).origin });
          // Claude.ai refuse un `<base>` d'une autre origine (base-uri 'self', essai d'Antoine du 25/11) : les fichiers de
          // la page sont nommés en entier, à l'aperçu ; ceux qu'ils chargent suivent leur propre adresse. Le routeur
          // monte là où la vue tourne (le chemin de son cadre).
          const page = lesFichiersEnEntier(html.replace('<base href="/">', ''), adresse)
            .replace('</script>', 'window.__VAVI_BASENAME__=location.pathname;</script>');
          return lesFichiersDansLaPage(page, adresse, async (chemin) => {
            if (chemin.split('/').some((x) => x === '..' || x === '')) return null;
            const f = await magasin.magasin.lire(`${racineDuBuild(projet, empreinte)}/${chemin}`);
            return f === 'absent' ? null : f.octets.toString('utf8');
          });
        },
        async messages(projet) { const m = await boiteSurSupabase(base).lister(projet, 100); return m.lu ? m.valeur.length : null; },
        async visites(projet) { const v = await lesVisites(base, projet, 30); return v.lu ? v.valeur.length : null; },
        async droitDePublier(projet) {
          const f = await projets.fichiers(compte, projet);
          const m = f.lu ? leManifesteStocke(f.valeur.get('app.json')) : null;
          const d = await leDroitDePublier({ ...abonnementsSurSupabase(base), maintenant: Date.now() }, compte, projet, m?.lu ? m.manifeste : null);
          return !d.lu ? null : d.valeur.permis ? { permis: true } : { permis: false, pourquoi: d.valeur.detail };
        },
      },
    },
  };
}

/** Le compte d'une session vavi (le jeton d'accès Supabase de la page « Autoriser ») ; `null` sinon. */
export async function compteDeLaSession(jeton: string): Promise<string | null> {
  const u = await clientDeService().auth.getUser(jeton);
  return u.error || !u.data.user ? null : u.data.user.id;
}

let etat: EtatDeLAcces | null = null;
/** Les codes échangés et les déconnexions de Claude, en base ; la révocation lue au plus toutes les 30 s par compte. */
export const etatDeLAccesReel = (): EtatDeLAcces => (etat ??= avecUneMemoire(etatSurSupabase(clientDeService())));

