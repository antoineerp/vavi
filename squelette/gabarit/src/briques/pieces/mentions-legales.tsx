/**
 * Les mentions légales, servies par le cadre et liées depuis le pied : l'éditeur tel qu'app.json le nomme (`editeur`) ;
 * ce qu'il ne dit pas est dit « à compléter », jamais inventé.
 */
import { APP } from '../../lib/app';
import { langueCourante } from '../../lib/langue';
import { libellesPour } from '../../lib/libelles';

export default function MentionsLegales() {
  const L = libellesPour(langueCourante());
  const e = APP.editeur ?? {};
  const lignes = [[L.editeur, e.nom ?? APP.nom], [L.adresse, e.adresse], [L.immatriculation, e.immatriculation], [L.telephone, e.telephone],
    [L.courriel, e.courriel], [L.hebergement, L.hebergementDetail]] as const;
  return (
    <div className="mx-auto max-w-2xl space-y-8 px-4 py-12">
      <h1 className="font-titre text-3xl">{L.mentionsLegales}</h1>
      <dl className="grid gap-4">
        {lignes.map(([titre, valeur]) => (
          <div key={titre} className="grid gap-1">
            <dt className="font-medium">{titre}</dt>
            <dd className="text-sur-fond-attenue">{valeur ?? L.aCompleter}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
