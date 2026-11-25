/**
 * LE GUIDE DE LA PERSONNE — une page, montrée dans la console vavi et à la première connexion du connecteur.
 *
 * C'est la personne qui le lit, pas Claude : il existe dans chaque langue de `LANGUES` (décision d'Antoine du 24/11),
 * les mêmes sept habitudes dans le même ordre (`test/consignes.test.ts`). Les prompts qu'il cite sont ceux de `prompts.ts`.
 */
import type { Langue } from './prompts';

export const GUIDE: Readonly<Record<Langue, string>> = {
  fr: `# Bien travailler avec Claude et vavi

vavi protège votre projet : Claude ne peut pas écraser votre travail, mettre une clé secrète dans le code ou publier une version cassée. Ces sept habitudes font le reste.

1. **Décrivez le résultat, pas la technique.** « Mes clients réservent un créneau et paient un acompte » vaut mieux que « ajoute une table réservations ».
2. **Une demande à la fois.** Attendez l'aperçu, vérifiez, puis passez à la suivante. Trois demandes en une donnent trois choses à moitié faites.
3. **Regardez l'aperçu avant de publier.** Rien n'est en ligne tant que vous n'avez pas cliqué sur Publier dans la console vavi ; votre site actuel reste intact pendant le travail.
4. **Donnez vos vrais contenus.** Vos textes, vos prix, vos photos, vos avis clients. Claude ne les invente pas : sans eux, il laisse un emplacement « à compléter ».
5. **Ne collez jamais une clé secrète dans la conversation.** Posez-la dans la console, rubrique Secrets. Si c'est arrivé, révoquez-la chez le fournisseur.
6. **Si ça tourne en rond, revenez en arrière.** Choisissez « Revenir en arrière » : chaque modification est une version que l'on peut ramener, vos données restent.
7. **Ouvrez une nouvelle conversation pour un nouveau sujet**, ou quand Claude vous le propose, avec « Reprendre » : vavi lui redonne où vous en étiez.

Trois prompts à connaître : **Démarrer un projet**, **Modifier mon projet**, **Reprendre**. Un travail laissé ouvert dans une autre conversation se reprend ici tout seul, avec ses notes : Claude ne vous le demande que si votre demande le contredit.
`,
  en: `# Working well with Claude and vavi

vavi protects your project: Claude cannot overwrite your work, put a secret key in the code or publish a broken version. These seven habits do the rest.

1. **Describe the result, not the technique.** "My customers book a slot and pay a deposit" works better than "add a bookings table".
2. **One request at a time.** Wait for the preview, check it, then move on. Three requests in one give three things half done.
3. **Look at the preview before publishing.** Nothing is online until you click Publish in the vavi console; your current site stays as it is while you work.
4. **Give your real content.** Your texts, prices, photos, customer reviews. Claude does not invent them: without them, it leaves a "to be completed" placeholder.
5. **Never paste a secret key into the conversation.** Store it in the console, under Secrets. If it happened, revoke it at the provider.
6. **If it goes in circles, go back.** Choose "Go back": every change is a version you can bring back, and your data stays.
7. **Open a new conversation for a new subject**, or when Claude suggests it, with "Resume": vavi tells it where you were.

Three prompts to know: **Start a project**, **Change my project**, **Resume**. Work left open in another conversation is resumed here on its own, with its notes: Claude asks you only if your request contradicts it.
`,
};

export const leGuide = (langue: string): string => GUIDE[(langue in GUIDE ? langue : 'en') as Langue];
