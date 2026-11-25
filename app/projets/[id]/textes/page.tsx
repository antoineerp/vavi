/** /projets/<id>/textes — la personne réécrit un texte de l'aperçu, sans modèle (`editeur.tsx`). */
import { adresseDeLApp } from '@/app/_partage/l-adresse-des-apps';
import { EditeurDeTextes } from '../editeur';
import { leProjet } from '../le-projet';

export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { t, p } = await leProjet(id, 'textes');
  if (!p.lu) return <main className="console"><p role="alert">{t.erreur} {p.pourquoi}</p></main>;
  return (
    <main className="console">
      <h1>{t.textes}</h1>
      {!p.valeur!.apercuEmpreinte ? <div className="carte"><p className="attenue">{t.pasDApercu}</p></div> : (
        <EditeurDeTextes id={id} apercu={adresseDeLApp(id, 'apercu')} t={{ textes: t.textes, textesExplication: t.textesExplication, textesActif: t.textesActif, textesChoisir: t.textesChoisir,
          textesPasIci: t.textesPasIci, enregistrer: t.enregistrer, annuler: t.annuler, enCours: t.enCours, textesFait: t.textesFait, textesRouge: t.textesRouge, textesRefus: t.textesRefus }} />
      )}
    </main>
  );
}
