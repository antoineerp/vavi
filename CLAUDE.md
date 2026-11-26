# CLAUDE.md — vavi

vavi est le backend géré d'apps et de sites que **Claude construit depuis Claude.ai**, par un serveur MCP. La plateforme
ne génère rien : elle pose le cadre, la base, le build, la publication, et rend des faits. Next.js 15, TypeScript,
Supabase (projet neuf, région Europe), pnpm seul. Né le 24/11/2026 des fonctions gardées de constructor-v13.

## Les règles

1. **La liste est fermée.** Tout ce que contient le dépôt est une ligne de `FONCTIONS.md`. Une fonction nouvelle ou
   reprise y entre d'abord, avec son module, son test, ses dépendances. `test/fonctions.test.ts` le tient.
2. **Chaque fonction n'importe que ses dépendances déclarées** (`npx tsx scripts/fermeture.ts` = 0 écart). Aucun
   fichier-nœud qui relie tout à tout : c'est ce qui a rendu constructor-v13 impossible à corriger.
3. **La plateforme n'appelle pas de modèle pour générer.** Seuls les capacités et les agents des apps en appellent un,
   sur la clé du propriétaire de l'app.
4. **Zéro écrivain.** Aucun code de la plateforme ne modifie, complète ou répare un fichier écrit par Claude. Un outil
   refuse ce qui est mal formé et dit pourquoi ; c'est Claude qui corrige. app.json, que vavi réécrit de toute façon depuis
   le manifeste lu, est ajusté quand le sens ne change pas (un lien en double, un exemple qui ne nomme rien), et l'ajustement
   est dit (Antoine : réparer plutôt que refuser, 25/11). Une exception (Antoine, 24/11, élargie le 25/11) : ce que la personne change elle-même dans la console, sans modèle,
   même pendant le travail de Claude (Antoine, 25/11 : l'empreinte protège ses fichiers), en une version, l'aperçu rebâti : un texte réécrit dans l'aperçu (ce passage seul, relu au caractère près),
   l'apparence (la `direction` d'app.json) et le référencement de ses pages (`src/referencement.json`) (`lib/contenus`).
5. **La base dérive de la déclaration** (`app.json`). Le modèle n'écrit jamais de SQL ni de RLS.
6. **Données** : un schéma Postgres par projet, jamais exposé ; la RLS décide ; jamais `anon` sur une table métier sauf
   lecture déclarée ; un identifiant SQL est validé puis cité ; aucune clé secrète livrée au navigateur.
7. **Aucun cas particulier.** Ni métier, ni type de site, ni mot-clé en dur : une règle vaut pour toutes les apps.
8. **Une fonction reprise de constructor-v13** porte en tête le commit d'origine, arrive avec ses tests, et ne tire
   rien de l'ancien générateur.
9. **Un test d'incident rougit sur le code d'avant** et verdit après. Un instrument qui reste toujours vert n'a rien
   prouvé.
10. **« Corrigé » se dit du déployé**, jamais du commité.

## Commandes

```bash
pnpm install
pnpm typecheck          # 0 erreur
pnpm test               # tous verts (les essais sur PostgreSQL réel tournent en root : sudo -E env "PATH=$PATH" pnpm exec vitest run test/backend test/donnees test/relais test/projets test/vente test/formulaires test/stripe-connect test/conformite test/capacites test/abonnements test/administration test/parcours test/export.test.ts ;
                        #  le build d'une app posée tourne avec VAVI_BATIR=oui)
pnpm fermeture          # 0 écart
pnpm build
```

## Où en est le dépôt

Le plan par lots est dans `FONCTIONS.md` (colonne Lot). L'état des lieux d'origine : Claude Doc « État des lieux de
constructor-v13 pour la voie MCP ». Les 2 clients de constructor-v13 y restent jusqu'à leur migration ; vavi tourne
sur un sous-domaine et ne prend `vavi.dev` qu'à la bascule.
