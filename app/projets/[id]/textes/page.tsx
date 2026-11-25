/** /projets/<id>/textes — la personne réécrit un texte de l'aperçu, sans modèle (`editeur.tsx`). */
import { adresseDeLApp } from '@/app/_partage/l-adresse-des-apps';
import { EditeurDeTextes } from '../editeur';
import { leProjet } from '../le-projet';
import { claudeAFini } from '../gestes';

export const dynamic = 'force-dynamic';

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params;
  const q = await searchParams;
  const { t, p, date } = await leProjet(id, 'textes');
  if (!p.lu) return <main className="console"><p role="alert">{t.erreur} {p.pourquoi}</p></main>;
  return (
    <main className="console">
      <h1>{t.textes}</h1>
      {q.fait === 'claude_a_fini' && <div className="carte" role="status">{t.claudeAFiniFait}</div>}
      {/* Tant que le travail de Claude est ouvert, un texte réécrit ici attendrait : la personne le ferme d'ici, sans rien perdre. */}
      {p.valeur!.chantier && (
        <form action={claudeAFini.bind(null, id, 'textes')} className="carte">
          <p><strong>{t.travailEnCours}</strong> : {p.valeur!.chantier.intention} <span className="attenue">({t.depuis} {date(p.valeur!.chantier.ouvertLe)})</span></p>
          <p className="attenue">{t.claudeAFiniExplication}</p>
          <button type="submit">{t.claudeAFini}</button>
        </form>
      )}
      {!p.valeur!.apercuEmpreinte ? <div className="carte"><p className="attenue">{t.pasDApercu}</p></div> : (
        <EditeurDeTextes id={id} apercu={adresseDeLApp(id, 'apercu')} t={{ textes: t.textes, textesExplication: t.textesExplication, textesActif: t.textesActif, textesChoisir: t.textesChoisir,
          textesPasIci: t.textesPasIci, enregistrer: t.enregistrer, annuler: t.annuler, enCours: t.enCours, textesFait: t.textesFait, textesRouge: t.textesRouge, textesRefus: t.textesRefus }} />
      )}
    </main>
  );
}
