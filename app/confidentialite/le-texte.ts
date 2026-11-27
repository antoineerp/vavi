/**
 * La politique de confidentialité de vavi lui-même (la plateforme), rédigée et validée par Antoine le 25/11/2026.
 * Celle de chaque app publiée est dérivée de son app.json (`lib/conformite`) ; celle-ci est exigée par l'annuaire des
 * connecteurs de Claude. Un changement de ce texte change sa date (`version`).
 */
export interface Section { readonly titre: string; readonly paragraphes?: readonly string[]; readonly liste?: readonly string[] }
export interface Politique { readonly titre: string; readonly version: string; readonly sections: readonly Section[] }

const CONTACT = 'info@vavi.dev';

export const POLITIQUE: Readonly<Record<'fr' | 'en', Politique>> = {
  fr: {
    titre: 'Politique de confidentialité de vavi',
    version: 'Version du 27 novembre 2026',
    sections: [
      { titre: 'Qui sommes-nous', paragraphes: [`vavi est édité par Antoine Cirier, entrepreneur individuel (voir les mentions légales, à l’adresse /mentions-legales). Contact pour vos données : ${CONTACT}.`] },
      { titre: 'Ce que nous collectons', liste: [
        'Votre adresse électronique, pour vous connecter par un lien reçu par courriel.',
        'Vos projets : les fichiers que Claude écrit pour vous, leurs versions, la déclaration de leurs données.',
        'Les données que les visiteurs de vos sites y saisissent, rangées dans la base de chaque projet. Pour elles, c’est vous, propriétaire du site, qui êtes responsable du traitement, et vavi votre sous-traitant.',
        'Les clés secrètes que vous confiez à un projet, chiffrées, jamais réaffichées.',
        'Un décompte des visites de vos sites, sans cookie ni donnée personnelle.',
      ] },
      { titre: 'Ce que nous ne collectons pas', paragraphes: [
        'Nous ne lisons ni vos conversations avec Claude, ni sa mémoire, ni vos fichiers dans Claude. vavi reçoit seulement ce que Claude lui envoie en appelant ses outils. Nous ne posons aucun traceur publicitaire ou de mesure tiers.',
      ] },
      { titre: 'Pourquoi', paragraphes: [
        'Pour faire fonctionner le service : construire, prévisualiser, héberger et publier vos sites. Pour la facturation si vous prenez une offre. Pour la sécurité : limites de débit, journal des connexions. Nous ne vendons ni ne louons aucune donnée.',
      ] },
      { titre: 'Où et chez qui', liste: [
        'Hébergement : Fly.io, à Paris.',
        'Base de données : Supabase, région Europe.',
        'Stockage des fichiers construits : Tigris, le stockage de fichiers de Fly.io.',
        'Courriels : Resend.',
        'Paiements : Stripe.',
      ] },
      { titre: 'Combien de temps', liste: [
        'Votre compte et vos projets : tant que votre compte existe.',
        'Après l’effacement du compte : 30 jours au plus.',
        'Journaux techniques : 30 jours au plus.',
      ] },
      { titre: 'Vos droits', paragraphes: [
        `Vous pouvez accéder à vos données, les télécharger, les rectifier ou les effacer depuis « Mon compte », ou en écrivant à ${CONTACT}. Vous pouvez retirer à Claude l’accès à votre compte à tout moment (« Déconnecter Claude de mon compte »). Vous pouvez aussi saisir la CNIL (cnil.fr).`,
      ] },
      { titre: 'Modifications', paragraphes: ['Nous datons chaque version de cette politique et vous prévenons par courriel en cas de changement important.'] },
    ],
  },
  en: {
    titre: 'vavi privacy policy',
    version: 'Version of 27 November 2026',
    sections: [
      { titre: 'Who we are', paragraphes: [`vavi is published by Antoine Cirier, French sole trader (see the legal notice, at /mentions-legales). Contact for your data: ${CONTACT}.`] },
      { titre: 'What we collect', liste: [
        'Your e-mail address, to sign you in with a link sent by e-mail.',
        'Your projects: the files Claude writes for you, their versions, the declaration of their data.',
        'The data that visitors of your sites enter there, stored in the database of each project. For that data, you, the owner of the site, are the controller, and vavi is your processor.',
        'The secret keys you entrust to a project, encrypted, never shown again.',
        'A count of visits to your sites, with no cookie and no personal data.',
      ] },
      { titre: 'What we do not collect', paragraphes: [
        'We read neither your conversations with Claude, nor its memory, nor your files in Claude. vavi only receives what Claude sends it when calling its tools. We set no advertising or third-party analytics tracker.',
      ] },
      { titre: 'Why', paragraphes: [
        'To run the service: build, preview, host and publish your sites. For billing if you take a plan. For security: rate limits, sign-in log. We neither sell nor rent any data.',
      ] },
      { titre: 'Where and with whom', liste: [
        'Hosting: Fly.io, in Paris.',
        'Database: Supabase, Europe region.',
        'Storage of built files: Tigris, the file storage of Fly.io.',
        'E-mails: Resend.',
        'Payments: Stripe.',
      ] },
      { titre: 'How long', liste: [
        'Your account and your projects: as long as your account exists.',
        'After the account is deleted: 30 days at most.',
        'Technical logs: 30 days at most.',
      ] },
      { titre: 'Your rights', paragraphes: [
        `You can access, download, correct or delete your data from “My account”, or by writing to ${CONTACT}. You can remove Claude’s access to your account at any time (“Disconnect Claude from my account”). You can also complain to the CNIL, the French data protection authority (cnil.fr).`,
      ] },
      { titre: 'Changes', paragraphes: ['We date each version of this policy and tell you by e-mail of any significant change.'] },
    ],
  },
};
