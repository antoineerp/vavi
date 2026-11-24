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
| gardes | Les gardes du dépôt (cette liste, la fermeture des imports) et l'écriture des migrations | scripts | test/fonctions.test.ts | relais | neuve | 1 |
| backend | Base par projet dérivée d'app.json : tables, RLS, cycles, journal, membres (SQL pur) | lib/backend | test/backend/ | — | reprise | 2 |
| relais | Base de la plateforme : schéma par projet, pose de la base, relais navigateur → base sous la RLS (`voie_neuve_*`), agir pour un compte | lib/relais | test/relais/ | backend | reprise | 2 |
| squelette | Squelette d'app : le gabarit Vite/React et ses briques (`squelette/gabarit`, des données), les fichiers figés dérivés d'app.json, ce que l'app tire | squelette | test/squelette/ | backend, design | reprise | 3 |
| design | Règles de design, peau (jetons, contraste construit), exemples de design | lib/design | test/design/ | backend | reprise | 3 |
| atelier | Construire une app dans un atelier : ses paquets une fois par verrou, `tsc` puis `vite build`, le dist ou les erreurs (fichier, ligne) | lib/atelier | test/atelier/ | — | reprise | 4 |
| publication | Publier un dist sur le magasin d'objets (S3), servir l'aperçu `/p/<id>/` avec l'environnement public de l'app | lib/publication | test/publication/ | — | reprise | 4 |
| consignes | Ce que le serveur MCP dit à Claude : instructions, prompts, ressources, forme des refus, guide de la personne (multilingue) | lib/consignes | test/consignes.test.ts | — | neuve | 5 |
| mcp | Serveur MCP constructeur et son OAuth (inscription dynamique, PKCE S256) | lib/mcp | test/mcp.test.ts | socle, backend, squelette, atelier, publication, design | à reprendre | 5 |
| seo | Référencement, pré-rendu des pages publiques, découverte (sitemap, robots, llms.txt) | lib/seo | test/seo.test.ts | publication | à reprendre | 6 |
| vente | Vente Stripe : prix lu en base, webhook signé, commande, TVA, facture, accès payé | lib/vente | test/vente.test.ts | socle, backend | à reprendre | 6 |
| domaines | Domaines personnalisés et leurs certificats | lib/domaines | test/domaines.test.ts | socle | à reprendre | 6 |
| versions | Versions et « Revenir à cet état » | lib/versions | test/versions.test.ts | socle | à reprendre | 6 |
| contenus | Contenus modifiables sans modèle (`data-texte`) | lib/contenus | test/contenus.test.ts | publication | à reprendre | 6 |
| formulaires | Formulaires jugés par la plateforme (anti-spam), mesure d'audience sans cookie | lib/formulaires | test/formulaires.test.ts | socle | à reprendre | 6 |
| export | Export vers un hébergeur (OVH, Infomaniak, Netlify, Vercel) et GitHub | lib/export | test/export.test.ts | publication | à reprendre | 6 |
| tableau-de-bord | Tableau de bord : projets, aperçu, panneaux (données, contenus, SEO, domaines…) | app/projets | test/tableau-de-bord.test.ts | socle, versions, contenus, domaines | à reprendre | 6 |
| automatisations | Automatisations : moteur, registre, tic | lib/automatisations | test/automatisations.test.ts | socle, backend, capacites | à reprendre | 7 |
| connecteurs | Connecteurs (Google Drive, OneDrive, clés API) | lib/connecteurs | test/connecteurs.test.ts | socle | à reprendre | 7 |
| agents | Agents de l'app, qui proposent seulement | lib/agents | test/agents.test.ts | socle, backend, capacites | à reprendre | 7 |
| capacites | Capacités des apps (courriel, SMS, PDF, agenda, vision…), une par une | lib/capacites | test/capacites.test.ts | socle | à reprendre | 7 |
| abonnements | Abonnements de la plateforme et quotas | lib/abonnements | test/abonnements.test.ts | socle | à reprendre | 8 |
