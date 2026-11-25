/** Ce que chaque écran d'un projet lit d'abord : le compte connecté, le projet à lui, ses textes. */
import 'server-only';
import { notFound } from 'next/navigation';
import { laConsole } from '@/app/_partage/la-console';
import { TEXTES } from '@/app/_partage/textes';

export const ID_DE_PROJET = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export async function leProjet(id: string, ecran: string) {
  if (!ID_DE_PROJET.test(id)) notFound();
  const c = await laConsole(`/projets/${id}${ecran ? `/${ecran}` : ''}`);
  const p = await c.projets.lire(c.compte, id);
  if (p.lu && !p.valeur) notFound();
  const date = (iso: string) => new Date(iso).toLocaleString(c.langue === 'fr' ? 'fr-FR' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' });
  return { c, t: TEXTES[c.langue], p, date };
}

/** Les erreurs que les gestes rendent par l'adresse (`?erreur=`). */
export const ERREURS: Record<string, { fr: string; en: string }> = {
  rien_a_publier: { fr: 'il n’y a pas encore d’aperçu.', en: 'there is no preview yet.' },
  build_rouge: { fr: 'l’aperçu n’est pas un build réussi.', en: 'the preview is not a successful build.' },
  conflit: { fr: 'le projet a changé pendant le retour ; réessayez.', en: 'the project changed meanwhile; try again.' },
  stripe_non_relie: { fr: 'vavi n’est pas encore relié à Stripe.', en: 'vavi is not connected to Stripe yet.' },
  stripe_refuse: { fr: 'Stripe a refusé d’ouvrir le compte ; réessayez, ou écrivez-nous.', en: 'Stripe refused to open the account; try again, or write to us.' },
  panne: { fr: 'vavi n’a pas répondu ; réessayez.', en: 'vavi did not answer; try again.' },
  aucune_offre: { fr: 'l’essai gratuit n’a que l’aperçu : choisissez une offre pour publier.', en: 'the free trial has the preview only: choose an offer to publish.' },
  suspendu: { fr: 'un paiement de votre abonnement manque : réglez-le pour publier.', en: 'a payment of your subscription is missing: settle it to publish.' },
  nature: { fr: 'votre offre publie des sites vitrines ; une boutique ou une app demande l’offre Boutique ou app.', en: 'your offer publishes showcase sites; a shop or an app needs the Shop or app offer.' },
  export_reserve: { fr: 'l’export est réservé aux offres payantes.', en: 'export is for paid offers only.' },
  quota: { fr: 'votre offre a déjà tous ses projets en ligne : ajoutez-lui un projet.', en: 'your offer already has all its projects online: add a project to it.' },
  google_mal_forme: { fr: 'ce n’est pas une balise de vérification Google : collez la balise <meta> que Search Console affiche.', en: 'this is not a Google verification tag: paste the <meta> tag that Search Console shows.' },
  courriel_mal_forme: { fr: 'cette adresse de courriel ne se lit pas.', en: 'this e-mail address cannot be read.' },
  secret_mal_forme: { fr: 'le nom s’écrit en MAJUSCULES_ET_SOULIGNÉS, et la valeur ne peut pas être vide.', en: 'the name is UPPER_CASE_WITH_UNDERSCORES and the value cannot be empty.' },
};
