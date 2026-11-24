/** Ce que l'app fait des données de qui la visite, servi par le cadre et lié depuis le pied. */
import { APP } from '../../lib/app';
import { langueCourante } from '../../lib/langue';
import { libellesPour } from '../../lib/libelles';

export default function Confidentialite() {
  const L = libellesPour(langueCourante());
  const courriel = APP.editeur?.courriel;
  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-12">
      <h1 className="font-titre text-3xl">{L.confidentialite}</h1>
      <h2 className="font-titre text-xl">{L.donneesPersonnelles}</h2>
      <p className="text-sur-fond-attenue">{L.confFormulaires}</p>
      {APP.roles.length > 0 ? <p className="text-sur-fond-attenue">{L.confComptes}</p> : null}
      <p className="text-sur-fond-attenue">
        {courriel ? <>{L.confDroits} <a href={`mailto:${courriel}`} className="underline underline-offset-4">{courriel}</a>.</> : L.confDroitsSansCourriel}
      </p>
      <p className="text-sur-fond-attenue">{L.hebergementDetail}</p>
    </div>
  );
}
