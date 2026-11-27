/**
 * Les mentions légales de vavi (la plateforme), exigées par la loi pour la confiance dans l'économie numérique (art. 6-III) :
 * l'éditeur, le directeur de la publication, l'hébergeur. Données d'Antoine, 27/11/2026 : entrepreneur individuel (EI),
 * soumis à la TVA ; une SAS en création reprendra l'activité à son immatriculation (seulement une information, l'éditeur
 * reste l'EI tant qu'elle n'a pas de Kbis). Mêmes sections que la politique de confidentialité, dans les deux langues.
 */
import type { Politique } from '@/app/confidentialite/le-texte';

const CONTACT = 'info@vavi.dev';
const EDITEUR = 'Antoine Cirier, EI';
const SIRET = '378 204 457 00048';
const TVA = 'FR18378204457';
const ADRESSE = '11 rue du Docteur Sérullaz, 69670 Vaugneray, France';

export const MENTIONS: Readonly<Record<'fr' | 'en', Politique>> = {
  fr: {
    titre: 'Mentions légales',
    version: 'Mise à jour le 27 novembre 2026',
    sections: [
      { titre: 'Éditeur', liste: [
        `${EDITEUR} (entrepreneur individuel), sous le nom commercial vavi.`,
        `SIRET : ${SIRET}.`,
        `TVA intracommunautaire : ${TVA}.`,
        `Adresse : ${ADRESSE}.`,
        `Contact : ${CONTACT}.`,
      ] },
      { titre: 'Directeur de la publication', paragraphes: ['Antoine Cirier.'] },
      { titre: 'Hébergement', liste: [
        'Site et applications : Fly.io, Inc., Chicago (Illinois, États-Unis), https://fly.io ; serveurs à Paris.',
        'Base de données : Supabase, Inc., https://supabase.com ; région Europe.',
      ] },
      { titre: 'Société en création', paragraphes: [
        'Une société par actions simplifiée est en cours de création ; elle reprendra l’activité de vavi à son immatriculation. Ces mentions seront alors mises à jour.',
      ] },
      { titre: 'Données personnelles', paragraphes: [
        'Ce que vavi collecte, pourquoi et vos droits sont décrits dans la politique de confidentialité, à l’adresse /confidentialite.',
      ] },
    ],
  },
  en: {
    titre: 'Legal notice',
    version: 'Updated on 27 November 2026',
    sections: [
      { titre: 'Publisher', liste: [
        `${EDITEUR} (French sole trader), trading as vavi.`,
        `SIRET: ${SIRET}.`,
        `EU VAT number: ${TVA}.`,
        `Address: ${ADRESSE}.`,
        `Contact: ${CONTACT}.`,
      ] },
      { titre: 'Publication director', paragraphes: ['Antoine Cirier.'] },
      { titre: 'Hosting', liste: [
        'Site and apps: Fly.io, Inc., Chicago (Illinois, USA), https://fly.io; servers in Paris.',
        'Database: Supabase, Inc., https://supabase.com; Europe region.',
      ] },
      { titre: 'Company being formed', paragraphes: [
        'A French simplified joint-stock company (SAS) is being formed; it will take over vavi’s activity once registered. This notice will then be updated.',
      ] },
      { titre: 'Personal data', paragraphes: [
        'What vavi collects, why, and your rights are described in the privacy policy, at /confidentialite.',
      ] },
    ],
  },
};
