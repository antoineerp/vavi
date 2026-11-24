/** Les conditions générales de vente d'une app qui vend, servies par le cadre et liées depuis le panier. */
import { APP } from '../../lib/app';
import { langueCourante } from '../../lib/langue';
import { libellesPour } from '../../lib/libelles';

export const offerte = APP.fonctions.panier;

export default function ConditionsDeVente() {
  const L = libellesPour(langueCourante());
  const sections = [
    [L.cgvVendeur, [APP.editeur?.nom ?? APP.nom, APP.editeur?.adresse, APP.editeur?.immatriculation].filter(Boolean).join(' · ')], [L.cgvObjetT, L.cgvObjet], [L.cgvPrixT, L.cgvPrix], [L.cgvCommandeT, L.cgvCommande], [L.cgvLivraisonT, L.cgvLivraison],
    [L.cgvRetractationT, L.cgvRetractation], [L.cgvGarantiesT, L.cgvGaranties], [L.cgvLitigesT, L.cgvLitiges],
  ] as const;
  return (
    <div className="mx-auto max-w-2xl space-y-8 px-4 py-12">
      <h1 className="font-titre text-3xl">{L.conditionsDeVente}</h1>
      {sections.map(([titre, texte]) => (
        <section key={titre} className="space-y-2">
          <h2 className="font-titre text-xl">{titre}</h2>
          <p className="text-sur-fond-attenue">{texte}</p>
        </section>
      ))}
    </div>
  );
}
