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
import { poserLEnvironnement } from '@/lib/publication/servir';
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

export async function leContexteReel(compte: string): Promise<ContexteDuServeur> {
  const base = clientDeService();
  const projets = projetsSurSupabase(base);
  const magasin = magasinS3();
  return {
    langue: await laLangue(base, compte),
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

