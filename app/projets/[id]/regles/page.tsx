/**
 * /projets/<id>/regles — LES RÈGLES DE L'APP (Antoine, 27/11 : « oui » à l'écran Règles). Ce que la base tient sur les
 * lignes de chaque table, lu d'app.json et dit en mots (`lib/fonctions-de-l-app/les-regles-dites`) : la phrase que lit une
 * personne refusée, puis comment la règle se lit. Rien ne s'y modifie : une règle se change en le demandant à Claude.
 */
import { leProjet } from '../le-projet';
import { leManifesteStocke } from '@/lib/projets/l-arbre-d-un-projet';
import { lesReglesDites } from '@/lib/fonctions-de-l-app/les-regles-dites';

export const dynamic = 'force-dynamic';

const MOTS = {
  fr: {
    titre: 'Règles',
    explication: 'Ce que votre app vérifie à chaque enregistrement, sur tous ses écrans : la base refuse ce qui ne respecte pas une règle, et la personne lit la phrase en gras. Les exemples et les fichiers importés y échappent.',
    aucune: 'Votre app n’a pas encore de règle de gestion. Demandez à Claude, par exemple : « une dépense de plus de 50 € doit avoir son justificatif » ou « au-delà de 500 €, seul un responsable valide ».',
    changer: 'Pour ajouter, changer ou retirer une règle, demandez-le à Claude.',
    illisible: 'L’app.json de ce projet ne se lit pas :',
  },
  en: {
    titre: 'Rules',
    explication: 'What your app checks on every save, on all its screens: the database refuses what breaks a rule, and the person reads the sentence in bold. Examples and imported files are exempt.',
    aucune: 'Your app has no business rule yet. Ask Claude, for example: “an expense over €50 must have its receipt” or “above €500, only a manager approves”.',
    changer: 'To add, change or remove a rule, ask Claude.',
    illisible: 'This project’s app.json cannot be read:',
  },
};

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { c, t, p } = await leProjet(id, 'regles');
  const w = MOTS[c.langue];
  if (!p.lu) return <main className="console"><h1>{w.titre}</h1><p role="alert">{t.erreur} {p.pourquoi}</p></main>;
  const f = await c.projets.fichiers(c.compte, id);
  if (!f.lu) return <main className="console"><h1>{w.titre}</h1><p role="alert">{t.erreur} {f.pourquoi}</p></main>;
  const m = leManifesteStocke(f.valeur.get('app.json'));
  if (!m.lu) return <main className="console"><h1>{w.titre}</h1><p role="alert">{w.illisible} {m.erreurs.join(' ; ')}</p></main>;
  const tables = lesReglesDites(m.manifeste, c.langue);
  return (
    <main className="console">
      <h1>{w.titre}</h1>
      <p className="attenue">{w.explication}</p>
      {tables.length === 0 ? <div className="carte"><p>{w.aucune}</p></div> : tables.map((x) => (
        <section key={x.table} className="carte">
          <h2>{x.table}</h2>
          <ul className="liste">
            {x.regles.map((r, i) => (
              <li key={`${r.titre}-${i}`}><div><strong>{r.titre}</strong><br /><span className="attenue">{r.comment}</span></div></li>
            ))}
          </ul>
        </section>
      ))}
      {tables.length > 0 && <p className="attenue">{w.changer}</p>}
    </main>
  );
}
