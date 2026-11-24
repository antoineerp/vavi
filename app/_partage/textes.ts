/** Les textes de la console, en français et en anglais. On dit ce qui change pour la personne, jamais un chemin de fichier. */
export const TEXTES = {
  fr: {
    mesProjets: 'Mes projets', aucun: 'Vous n’avez pas encore de projet. Ouvrez Claude.ai, branchez le connecteur vavi, puis choisissez le prompt « Démarrer un projet ».',
    version: 'version', ouvrir: 'Ouvrir', enLigne: 'En ligne', aPublier: 'Changements à publier', rienAPublier: 'Pas encore d’aperçu',
    apercu: 'Aperçu', voirLApercu: 'Voir l’aperçu', siteEnLigne: 'Site en ligne', voirLeSite: 'Voir le site',
    publier: 'Publier', publierExplication: 'Met en ligne exactement l’aperçu que vous voyez. Votre site actuel reste en place jusqu’à ce clic.',
    dejaEnLigne: 'L’aperçu est en ligne.', pasDApercu: 'Rien à publier : demandez à Claude de construire un aperçu.',
    travailEnCours: 'Travail en cours avec Claude', depuis: 'ouvert le',
    versions: 'Versions', revenir: 'Revenir à cet état', revenirExplication: 'Les fichiers reviennent à cet état, dans une nouvelle version : rien n’est perdu, vos données restent.',
    secrets: 'Secrets', secretsExplication: 'Les clés secrètes (Stripe, courriel…) de votre app. Elles sont chiffrées et ne s’affichent plus jamais.',
    nom: 'Nom (ex. STRIPE_SECRET_KEY)', valeur: 'Valeur', poser: 'Enregistrer', aucunSecret: 'Aucun secret.',
    publie: 'C’est en ligne.', revenu: (v: number) => `Revenu : nouvelle version ${v}.`, aConstruire: 'Cet état n’a jamais été construit : demandez à Claude de lancer un aperçu.',
    secretPose: (n: string) => `${n} est enregistré.`, erreur: 'Cela n’a pas marché :', deconnexion: 'Se déconnecter', retour: '← Mes projets',
  },
  en: {
    mesProjets: 'My projects', aucun: 'You have no project yet. Open Claude.ai, connect the vavi connector, then choose the "Start a project" prompt.',
    version: 'version', ouvrir: 'Open', enLigne: 'Online', aPublier: 'Changes to publish', rienAPublier: 'No preview yet',
    apercu: 'Preview', voirLApercu: 'See the preview', siteEnLigne: 'Online site', voirLeSite: 'See the site',
    publier: 'Publish', publierExplication: 'Puts exactly the preview you see online. Your current site stays as it is until you click.',
    dejaEnLigne: 'The preview is online.', pasDApercu: 'Nothing to publish: ask Claude to build a preview.',
    travailEnCours: 'Work in progress with Claude', depuis: 'opened on',
    versions: 'Versions', revenir: 'Go back to this state', revenirExplication: 'The files go back to this state, as a new version: nothing is lost, your data stays.',
    secrets: 'Secrets', secretsExplication: 'The secret keys (Stripe, e-mail…) of your app. They are encrypted and never shown again.',
    nom: 'Name (e.g. STRIPE_SECRET_KEY)', valeur: 'Value', poser: 'Save', aucunSecret: 'No secret.',
    publie: 'It is online.', revenu: (v: number) => `Done: new version ${v}.`, aConstruire: 'This state was never built: ask Claude to run a preview.',
    secretPose: (n: string) => `${n} is saved.`, erreur: 'It did not work:', deconnexion: 'Sign out', retour: '← My projects',
  },
} as const;
