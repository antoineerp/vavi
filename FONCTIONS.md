# Les fonctions de vavi

Ce fichier est la liste FERMÉE de ce que vavi contient. Une fonction qui n'est pas ici n'entre pas dans le dépôt :
`test/fonctions.test.ts` le fait tenir, et `scripts/fermeture.ts` vérifie qu'aucune fonction n'importe hors de ses
dépendances déclarées.

- **Module** : le dossier (ou le fichier) qui porte la fonction. Tout fichier de `lib/` appartient à un module listé.
  `squelette/gabarit` est une donnée : l'app posée, avec son propre build ; la fermeture ne la lit pas.
- **Dépend de** : les autres fonctions (par leur clé) que son code a le droit d'importer.
- **État** : `neuve` (écrite ici), `reprise` (venue de constructor-v13, le commit d'origine en tête de chaque fichier),
  `à reprendre` (prévue, pas encore là : ni module ni test exigés).
- L'origine des fonctions à reprendre : l'état des lieux du 24/11 (Claude Doc « État des lieux de constructor-v13 pour
  la voie MCP »).

| Clé | Fonction | Module | Test | Dépend de | État | Lot |
| --- | --- | --- | --- | --- | --- | --- |
| socle | Configuration et auth Supabase (navigateur, serveur, service, session) | lib/supabase | test/supabase-configuration.test.ts | — | neuve | 1 |
| gardes | Les gardes du dépôt (cette liste, la fermeture des imports) et l'écriture des migrations | scripts | test/fonctions.test.ts | relais, projets, vente, formulaires, stripe-connect | neuve | 1 |
| backend | Base par projet dérivée d'app.json : tables, RLS, cycles, journal, membres (SQL pur) | lib/backend | test/backend/ | — | reprise | 2 |
| relais | Base de la plateforme : schéma par projet, pose de la base, relais navigateur → base sous la RLS (`voie_neuve_*`), agir pour un compte | lib/relais | test/relais/ | backend | reprise | 2 |
| projets | Les projets d'un compte et les fichiers que Claude écrit, gardés tels quels (tables de la plateforme, écriture d'un lot en une transaction), l'arbre construit qu'ils donnent, le build désigné (aperçu, en ligne) | lib/projets | test/projets/ | backend, squelette | neuve | 5 |
| squelette | Squelette d'app : le gabarit Vite/React et ses briques (`squelette/gabarit`, des données), les fichiers figés dérivés d'app.json, ce que l'app tire | squelette | test/squelette/ | backend, design | reprise | 3 |
| design | Règles de design, peau (jetons, contraste construit), exemples de design | lib/design | test/design/ | backend | reprise | 3 |
| atelier | Construire une app dans un atelier : ses paquets une fois par verrou, `tsc` puis `vite build`, le dist ou les erreurs (fichier, ligne) | lib/atelier | test/atelier/ | — | reprise | 4 |
| publication | Publier un dist sur le magasin d'objets (S3), servir l'aperçu `/p/<id>/` avec l'environnement public de l'app | lib/publication | test/publication/ | — | reprise | 4 |
| consignes | Ce que le serveur MCP dit à Claude : instructions, prompts, ressources, forme des refus, guide de la personne (multilingue) | lib/consignes | test/consignes.test.ts | — | neuve | 5 |
| mcp | Serveur MCP constructeur : les 13 outils du cahier des garde-fous (refus de la liste fermée), prompts, ressources, et son OAuth (inscription dynamique, PKCE S256, jetons scellés à déchiffrement strict) | lib/mcp | test/mcp/ | socle, backend, relais, squelette, atelier, publication, projets, versions, consignes, seo | neuve | 5 |
| seo | Référencement : pré-rendu des pages publiques au build (lisibles sans JavaScript), site en ligne servi avec adresse canonique et données structurées, découverte (sitemap, robots, llms.txt), aperçu jamais référencé | lib/seo | test/seo/ | publication | neuve | 6 |
| vente | Vente Stripe sur le compte relié du propriétaire (Stripe Connect) : prix lu en base, commande, TVA, page de paiement, webhook signé (une fois par paiement), stock, facture | lib/vente | test/vente/ | backend, relais | reprise | 6 |
| stripe-connect | Compte Stripe du client ouvert par vavi (Stripe Connect, compte Stripe complet du propriétaire prérempli, inscription hébergée par Stripe, paiements directs sur son compte) : remplace la clé Stripe posée à la main ; pièces et identité restent chez Stripe (6d, décision du 24/11) | lib/stripe-connect | test/stripe-connect/ | vente | neuve | 6 |
| conformite | Conformité RGPD par défaut : bandeau seulement si un traceur non essentiel est posé, export et effacement des données depuis « Mon compte », registre des traitements tiré d'app.json, minimisation dite dans les consignes (6e, décision du 24/11) | lib/conformite | test/conformite/ | backend, relais, consignes | à reprendre | 6 |
| domaines | Domaines personnalisés et leurs certificats (avec l’hébergement, décision du 24/11) | lib/domaines | test/domaines.test.ts | socle | à reprendre | 9 |
| versions | Revenir à une version (outil `rollback`, « Revenir à cet état » de la console), en une version nouvelle, la base reposée si app.json change | lib/versions | test/versions/ | projets, relais | neuve | 6 |
| contenus | Textes réécrits par la personne dans l'aperçu de la console, sans modèle (`data-texte`) : le passage désigné seul, relu au caractère près, en une version, l'aperçu rebâti (exception à la règle 4, décision du 24/11) | lib/contenus | test/contenus/ | squelette, projets | reprise | 6 |
| formulaires | Formulaires des apps jugés par la plateforme (leurre, texte tiré au hasard, preuve de visite, plafonds), gardés même en spam et transmis au propriétaire par courriel ; mesure d'audience sans cookie du site en ligne | lib/formulaires | test/formulaires/ | — | reprise | 6 |
| export | Export honnête du code et des données (vers un hébergeur, GitHub, ou une archive), réservé aux offres payantes (décision du 24/11) | lib/export | test/export.test.ts | publication, abonnements | à reprendre | 8 |
| tableau-de-bord | La console : connexion par lien, projets, aperçu et site en ligne, bouton « Publier » (la personne seule met en ligne), versions et « Revenir à cet état », secrets (noms seulement) | app/projets | test/tableau-de-bord.test.ts | socle, projets, versions, mcp | neuve | 6 |
| automatisations | Automatisations : moteur, registre, tic | lib/automatisations | test/automatisations.test.ts | socle, backend, capacites | à reprendre | 7 |
| connecteurs | Connecteurs (Google Drive, OneDrive, clés API) | lib/connecteurs | test/connecteurs.test.ts | socle | à reprendre | 7 |
| agents | Agents de l'app, qui proposent seulement | lib/agents | test/agents.test.ts | socle, backend, capacites | à reprendre | 7 |
| capacites | Capacités des apps (courriel, SMS, PDF, agenda, vision…), une par une | lib/capacites | test/capacites.test.ts | socle | à reprendre | 7 |
| abonnements | Abonnements de la plateforme et quotas : l'offre gratuite n'a que l'aperçu, « Publier » exige une offre payante (décision du 24/11) | lib/abonnements | test/abonnements.test.ts | socle | à reprendre | 8 |
