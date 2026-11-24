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
import { avecUneMemoire, etatSurSupabase, type EtatDeLAcces } from './l-etat-de-l-acces';
import { configurationPublique } from '@/lib/supabase/configuration';
import { schemaDuProjet } from '@/lib/relais/le-schema-d-une-app';
import { ouvrirLeNavigateur, preRendre } from '@/lib/seo/le-pre-rendu';
import type { ContexteDuServeur } from './le-serveur';
import { abonnementsSurSupabase } from '@/lib/abonnements/sur-supabase';
import { lEtatDuCompte, laVueDeLAbonnement, leDroitDePublier } from '@/lib/abonnements/l-abonnement';
import { boiteSurSupabase, lesVisites } from '@/lib/formulaires/sur-supabase';
import { leManifesteStocke } from '@/lib/projets/l-arbre-d-un-projet';

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
      permis: lesPaquetsDuGabarit(leGabarit()),
      adresse: adresseDeLaPlateforme(),
      domaineDesApps: leDomaineDesApps(process.env),
      scellerUnSecret,
      refusPrecedents: REFUS_PRECEDENTS,
      async abonnement() {
        const e = await lEtatDuCompte({ ...abonnementsSurSupabase(base), maintenant: Date.now() }, compte);
        return e.lu ? laVueDeLAbonnement(e.valeur, `${adresseDeLaPlateforme()}/abonnement`) : null;
      },
      vue: {
        domaines: (() => {
          const pub = configurationPublique(process.env);
          const domaine = leDomaineDesApps(process.env);
          const ressources = domaine ? [`https://*.${domaine}`] : [new URL(adresseDeLaPlateforme()).origin];
          return { ressources, connexions: [...ressources, ...(pub.lue ? [new URL(pub.valeur.url).origin] : [])] };
        })(),
        async pageDeLApercu(projet, empreinte, adresse) {
          const pub = configurationPublique(process.env);
          const schema = schemaDuProjet(projet);
          if (!magasin.lu || !pub.lue || !schema) return null;
          const o = await magasin.magasin.lire(`${racineDuBuild(projet, empreinte)}/index.html`);
          if (o === 'absent') return null;
          const html = poserLEnvironnement(o.octets.toString('utf8'), { supabaseUrl: pub.valeur.url, cleAnonyme: pub.valeur.cleAnonyme, schema, base: '/', projet, console: adresseDeLaPlateforme() });
          // La base des fichiers : l'aperçu ; la base du routeur : là où la vue tourne (le chemin de son cadre).
          return html.replace('<base href="/">', `<base href="${adresse.replace(/"/g, '')}">`)
            .replace('</script>', 'window.__VAVI_BASENAME__=location.pathname;</script>');
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
