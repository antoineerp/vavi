/**
 * LES GESTES DE LA VUE — ce que la vue de vavi dans Claude (`la-vue.ts`) demande au serveur : la fiche d'un projet, et
 * « Publier ». Neuf dans vavi (24/11, décision d'Antoine : un maximum dans Claude, Publier aussi, cliqué par lui seul).
 *
 * Les deux exigent le jeton de la vue (`geste`), posé dans le HTML de la vue et jamais rendu au modèle : sans lui, refus.
 * Ainsi le modèle ne met jamais en ligne, même s'il appelait l'outil réservé à la vue. « Publier » est le même geste que
 * celui de la console (`app/projets/[id]/gestes.ts`) : le droit de l'offre vérifié par le serveur, puis
 * `mettreLApercuEnLigne`, qui désigne le build vert de l'aperçu sans rien construire ni toucher.
 */
import { lEtatDeLaMiseEnLigne, mettreLApercuEnLigne, uneAUneParCompte } from '@/lib/projets/la-mise-en-ligne';
import { lAdresseDeLApp } from '@/lib/publication/les-adresses-des-apps';
import { refuser } from '@/lib/consignes';
import { lireUnJetonDeVue } from './les-jetons';
import type { Contexte, Rendu } from './les-gestes';

/** Ce que la fiche lit hors des projets ; chaque lecture rend `null` quand elle n'a pas pu lire (« — » à l'écran, jamais 0). */
export interface LecturesDeLaVue {
  messages(projet: string): Promise<number | null>;
  visites(projet: string): Promise<number | null>;
  /** Le droit de l'offre, vérifié par le serveur ; `null` : illisible. */
  droitDePublier(projet: string): Promise<{ readonly permis: true } | { readonly permis: false; readonly pourquoi: string } | null>;
  /** ESSAI du 24/11 : la page de l'aperçu, son environnement posé et sa base absolue, que la vue exécute elle-même
   * (Claude.ai n'encadre pas un site extérieur) ; `null` : illisible. */
  pageDeLApercu?(projet: string, empreinte: string, adresse: string): Promise<string | null>;
  /** Les domaines que la vue charge (le code de l'app) et joint (sa base) pour l'exécuter. */
  readonly domaines?: { readonly ressources: readonly string[]; readonly connexions: readonly string[] };
}

const SANS_JETON = 'This tool is reserved to the vavi view, clicked by the person. You cannot call it: tell the person to use the Publish button in the vavi card, or in the vavi console.';

export async function laFicheDuProjet(c: Contexte, a: { project: string; geste: string }): Promise<Rendu> {
  if (!lireUnJetonDeVue(a.geste, c.compte)) return refuser('confirmation_requise', SANS_JETON);
  return laFiche(c, a.project);
}

export async function mettreEnLigneDepuisLaVue(c: Contexte, a: { project: string; geste: string }): Promise<Rendu> {
  if (!lireUnJetonDeVue(a.geste, c.compte)) return refuser('confirmation_requise', SANS_JETON);
  const vue = c.vue;
  if (!vue) return refuser('plateforme_en_panne', 'The subscription of this account could not be read on this vavi server.');
  // Le quota et la mise en ligne, sans qu'un autre « Publier » du compte s'intercale (comme la console).
  const r = await uneAUneParCompte(c.compte, async () => {
    const droit = await vue.droitDePublier(a.project);
    if (!droit) return refuser('plateforme_en_panne', 'The subscription of this account could not be read.');
    if (!droit.permis) return refuser('confirmation_requise', `Publishing needs a plan (${droit.pourquoi}): ${c.adresse}/abonnement`);
    return mettreLApercuEnLigne(c.projets, c.compte, a.project);
  });
  if ('refuse' in r) return r;
  if (!r.publie) {
    return r.pourquoi === 'projet_inconnu' ? refuser('projet_inconnu', `No project "${a.project}" in this account.`)
      : r.pourquoi === 'rien_a_publier' ? refuser('build_perime', 'There is no preview yet: build it first.')
        : r.pourquoi === 'build_rouge' ? refuser('build_rouge', 'The preview is not a green build.')
          : refuser('base_illisible', `The project database did not answer (${r.detail ?? 'panne'}).`);
  }
  console.log(`[vue] ${a.project.slice(0, 8)} mis en ligne depuis Claude (${r.empreinte.slice(0, 12)})`);
  const f = await laFiche(c, a.project);
  return 'refuse' in f ? f : { ok: true, published: true, fiche: f };
}

async function laFiche(c: Contexte, id: string): Promise<Rendu> {
  const p = await c.projets.lire(c.compte, id);
  if (!p.lu) return refuser('base_illisible', `The project database did not answer (${p.pourquoi}).`);
  if (!p.valeur) return refuser('projet_inconnu', `No project "${id}" in this account.`);
  const projet = p.valeur;
  const [versions, messages, visites, droit] = await Promise.all([
    c.projets.versions(c.compte, id, 5), c.vue?.messages(id) ?? null, c.vue?.visites(id) ?? null, c.vue?.droitDePublier(id) ?? null]);
  const etat = lEtatDeLaMiseEnLigne(projet);
  const adresses = { console: c.adresse, domaine: c.domaineDesApps ?? null };
  return {
    ok: true, id, project: id, name: projet.nom, version: projet.version, state: etat,
    work_session: projet.chantier?.intention ?? null,
    preview_url: projet.apercuEmpreinte ? lAdresseDeLApp(id, 'apercu', adresses) : null,
    online_url: projet.enLigneEmpreinte ? lAdresseDeLApp(id, 'en_ligne', adresses) : null,
    console_url: `${c.adresse}/projets/${id}`, plan_url: `${c.adresse}/abonnement`,
    can_publish: droit ? droit.permis : null,
    versions: versions.lu ? versions.valeur.map((v) => ({ version: v.numero, why: v.pourquoi, at: v.creeLe })) : null,
    messages, visits: visites,
    app_html: projet.apercuEmpreinte && c.vue?.pageDeLApercu
      ? await c.vue.pageDeLApercu(id, projet.apercuEmpreinte, lAdresseDeLApp(id, 'apercu', adresses)).catch(() => null) : null,
  };
}
