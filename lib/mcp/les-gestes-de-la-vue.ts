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
  droitDePublier(projet: string): Promise<{ readonly permis: true } | { readonly permis: false; readonly pourquoi: string; readonly raison?: string } | null>;
  /** ESSAI du 24/11 : la page de l'aperçu, son environnement posé et sa base absolue, que la vue exécute elle-même
   * (Claude.ai n'encadre pas un site extérieur) ; `null` : illisible. */
  pageDeLApercu?(projet: string, empreinte: string, adresse: string): Promise<string | null>;
  /** Les domaines que la vue charge (le code de l'app) et joint (sa base) pour l'exécuter. */
  readonly domaines?: { readonly ressources: readonly string[]; readonly connexions: readonly string[] };
}

const SANS_JETON = 'This tool is reserved to the vavi view, clicked by the person. You cannot call it: tell the person to use the Publish button in the vavi card, or in the vavi console.';

/** `known` : l'empreinte de l'aperçu que la vue montre déjà ; la même, la page n'est pas relue (la vue la redemande
 * toutes les quelques secondes pendant que Claude construit). */
export async function laFicheDuProjet(c: Contexte, a: { project: string; geste: string; known?: string }): Promise<Rendu> {
  if (!lireUnJetonDeVue(a.geste, c.compte)) return refuser('confirmation_requise', SANS_JETON);
  return laFiche(c, a.project, a.known);
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

/**
 * LES BOUTONS DE LA FICHE, DÉCIDÉS ICI (Antoine, 26/11 16h51 : la fiche corrigée restait l'ancienne chez lui). Claude.ai
 * garde la page de la vue et la liste des outils d'une conversation à l'autre : un bouton écrit dans la page ne change
 * qu'à son rafraîchissement. La page ne fait plus que les dessiner ; les changer ne touche qu'au serveur. Gestes connus
 * de la page : `link` (ouvre `url`), `publish` (deux clics, jeton de la vue), `panel` (demande le panneau à l'hôte).
 */
/** L'icône d'un bouton (Antoine, 27/11 : « des boutons visibles », une icône devant chaque mot) ; la page la dessine. */
export type IconeDuBouton = 'panneau' | 'apercu' | 'publier' | 'offre' | 'site' | 'domaine' | 'console';
/** `note` : l'état qui accompagne le bouton (l'offre pleine…), dit à côté de lui en petit, jamais dans son libellé (28/11). */
export interface BoutonDeLaFiche { readonly do: 'link' | 'publish' | 'panel'; readonly label: { readonly fr: string; readonly en: string }; readonly url?: string; readonly main?: boolean; readonly icon?: IconeDuBouton; readonly note?: { readonly fr: string; readonly en: string } }

export function lesBoutonsDeLaFiche(f: { readonly preview_url: string | null; readonly state: string; readonly console_url: string;
  readonly can_publish?: boolean | null; readonly plan_url?: string; readonly raison?: string | null; readonly online_url?: string | null }): BoutonDeLaFiche[] {
  // Sans offre, « Publier » ne pourrait que refuser (Antoine, 27/11 : le refus passait inaperçu) : le bouton mène à l'offre,
  // et dit pourquoi (« est-ce que l'utilisateur aura un message lui donnant la raison ? », 27/11). Le libellé reste
  // « Publier » ; la raison est sa note, dite à côté (Antoine, 28/11 : « Publier : votre offre est pleine… » cassait la barre).
  const sansOffre = f.state === 'a_publier' && f.can_publish === false && f.plan_url;
  const POURQUOI: Record<string, { fr: string; en: string }> = {
    nature: { fr: 'Une app demande l’offre Boutique ou app', en: 'An app needs the Shop or app offer' },
    quota: { fr: 'Votre offre est pleine : ajoutez une place', en: 'Your offer is full: add a place' },
    suspendu: { fr: 'Un paiement manque', en: 'A payment is missing' },
  };
  return [
    // « Afficher à droite », en premier et en vert (Antoine, 26/11 17h02) : Claude.ai n'ouvre son panneau qu'après un clic.
    { do: 'panel' as const, label: { fr: 'Afficher à droite', en: 'Show on the right' }, main: true, icon: 'panneau' as const },
    // Par la console, qui y fait entrer le propriétaire déjà connecté (`/projets/<id>/entrer`, 27/11).
    ...(f.preview_url ? [{ do: 'link' as const, label: { fr: 'Voir l’aperçu', en: 'See the preview' }, url: `${f.console_url}/entrer`, icon: 'apercu' as const }] : []),
    ...(sansOffre ? [{ do: 'link' as const, label: { fr: 'Publier', en: 'Publish' }, url: f.plan_url, main: true, icon: 'offre' as const,
      note: POURQUOI[f.raison ?? ''] ?? { fr: 'Choisissez une offre pour publier', en: 'Choose a plan to publish' } }]
      : f.state === 'a_publier' ? [{ do: 'publish' as const, label: { fr: 'Publier', en: 'Publish' }, main: true, icon: 'publier' as const }] : []),
    // EN LIGNE, CE QUI SUIT (Antoine, 27/11 : « je n'ai aucun message confirmant la publication », « à aucun moment je n'ai
    // eu de message si je voulais publier sur mon nom de domaine ») : le site lui-même, et son nom de domaine.
    ...(f.online_url ? [{ do: 'link' as const, label: { fr: 'Voir le site en ligne', en: 'See the online site' }, url: f.online_url, icon: 'site' as const },
      { do: 'link' as const, label: { fr: 'Mon nom de domaine', en: 'My domain name' }, url: `${f.console_url}/domaine`, icon: 'domaine' as const }] : []),
    { do: 'link', label: { fr: 'Console vavi', en: 'vavi console' }, url: f.console_url, icon: 'console' },
  ];
}

/**
 * Ce que la barre dit du site en ligne, à chaque lecture de la fiche (Antoine, 27/11 : le « C'est en ligne » du clic
 * disparaissait à la relecture suivante, et rien ne disait l'adresse ni le nom de domaine). PUR.
 */
export function laNoteEnLigne(f: { readonly online_url: string | null; readonly state: string }): { readonly fr: string; readonly en: string } | null {
  if (!f.online_url) return null;
  const adresse = f.online_url.replace(/^https?:\/\//, '').replace(/\/$/, '');
  return f.state === 'a_publier'
    ? { fr: `En ligne à ${adresse}. Des changements ne sont pas encore publiés.`, en: `Online at ${adresse}. Some changes are not published yet.` }
    : { fr: `En ligne à ${adresse}. Votre propre nom de domaine (www.votre-nom.fr) se branche avec « Mon nom de domaine ».`,
      en: `Online at ${adresse}. Your own domain name (www.your-name.com) is plugged in with “My domain name”.` };
}

async function laFiche(c: Contexte, id: string, connue?: string): Promise<Rendu> {
  const p = await c.projets.lire(c.compte, id);
  if (!p.lu) return refuser('base_illisible', `The project database did not answer (${p.pourquoi}).`);
  if (!p.valeur) return refuser('projet_inconnu', `No project "${id}" in this account.`);
  const projet = p.valeur;
  const [versions, messages, visites, droit] = await Promise.all([
    c.projets.versions(c.compte, id, 5), c.vue?.messages(id) ?? null, c.vue?.visites(id) ?? null, c.vue?.droitDePublier(id) ?? null]);
  const etat = lEtatDeLaMiseEnLigne(projet);
  const adresses = { console: c.adresse, domaine: c.domaineDesApps ?? null };
  const preview_url = projet.apercuEmpreinte ? lAdresseDeLApp(id, 'apercu', adresses) : null, console_url = `${c.adresse}/projets/${id}`;
  const online_url = projet.enLigneEmpreinte
    ? lAdresseDeLApp(id, 'en_ligne', { ...adresses, nom: await c.nommerLeSite?.(id, projet.nom).catch(() => null) ?? null }) : null;
  return {
    buttons: lesBoutonsDeLaFiche({ preview_url, state: etat, console_url, online_url, can_publish: droit ? droit.permis : null, raison: droit && !droit.permis ? droit.raison ?? null : null, plan_url: `${c.adresse}/abonnement?projet=${id}#offres` }),
    online_note: laNoteEnLigne({ online_url, state: etat }),
    ok: true, id, project: id, name: projet.nom, version: projet.version, state: etat,
    work_session: projet.chantier?.intention ?? null,
    preview_url,
    online_url,
    console_url, plan_url: `${c.adresse}/abonnement`,
    can_publish: droit ? droit.permis : null,
    versions: versions.lu ? versions.valeur.map((v) => ({ version: v.numero, why: v.pourquoi, at: v.creeLe })) : null,
    messages, visits: visites,
    // Ce que la vue suit pendant la construction : le chantier ouvert, l'aperçu qu'elle montre (inchangé : pas relu).
    building: projet.chantier !== null && projet.chantier !== undefined, preview_fingerprint: projet.apercuEmpreinte ?? null,
    ...(connue && connue === projet.apercuEmpreinte ? { app_html_unchanged: true } : {}),
    app_html: projet.apercuEmpreinte && projet.apercuEmpreinte !== connue && c.vue?.pageDeLApercu
      ? await c.vue.pageDeLApercu(id, projet.apercuEmpreinte, lAdresseDeLApp(id, 'apercu', adresses)).catch(() => null) : null,
  };
}
