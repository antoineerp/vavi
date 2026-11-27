/**
 * Le tableau de bord qui ouvre /admin (Antoine, 27/11) : inscrits, usage de vavi dans Claude, projets, builds, sites en
 * ligne, visites, revenu ; une courbe par chiffre sur la période, deux grandes courbes, les outils les plus appelés et le
 * passage des comptes à l'usage. Les comptes administrateurs n'y comptent pas (`lActivite`).
 */
import { Aire, Courbe } from '@/app/_partage/les-graphiques';
import type { LActivite, Mesure } from '@/lib/administration/l-activite';

const nombre = (n: number) => n.toLocaleString('fr-FR');
const part = (n: number, sur: number) => (sur ? `${Math.round((n / sur) * 100)} %` : '—');

function Tuile({ titre, chiffre, detail, serie, jours }: { readonly titre: string; readonly chiffre: string; readonly detail: string; readonly serie?: readonly number[]; readonly jours: readonly string[] }) {
  return (
    <div className="chiffre-du-compte">
      <span className="attenue">{titre}</span>
      <strong>{chiffre}</strong>
      <span className="attenue">{detail}</span>
      {serie && <Courbe serie={serie.map((visites, i) => ({ jour: jours[i]!, visites }))} largeur={180} hauteur={34} />}
    </div>
  );
}

const enCourbe = (m: Mesure, jours: readonly string[]) => m.serie.map((visites, i) => ({ jour: jours[i]!, visites }));

export function TableauDeBord({ a, jours, revenu, abonnes, essais, masques, migration }: {
  readonly a: LActivite; readonly jours: number; readonly revenu: string; readonly abonnes: number; readonly essais: number;
  /** Les projets des comptes administrateurs, hors du tableau de bord. */
  readonly masques: number;
  /** La raison pour laquelle l'usage du connecteur ne se lit pas (migration à coller) ; `null` : il se lit. */
  readonly migration: string | null;
}) {
  const j = a.jours;
  const tauxDeRefus = a.appels && a.appels.periode ? ` · ${part(a.appels.refus, a.appels.periode)} refusés` : '';
  return (
    <section aria-labelledby="tableau-de-bord">
      <h2 id="tableau-de-bord">Tableau de bord <span className="attenue">· {jours} derniers jours</span></h2>
      {migration && <p className="carte" role="alert">L’usage de vavi dans Claude ne se lit pas encore ({migration}) : colle la migration 20261127130000_l_activite.sql dans Supabase.</p>}
      <div className="chiffres-du-compte">
        <Tuile titre="Inscrits" chiffre={nombre(a.inscrits.total)} detail={`+${a.inscrits.periode} en ${jours} j · +${a.inscrits.semaine} cette semaine`} serie={a.inscrits.serie} jours={j} />
        <Tuile titre="Utilisent vavi dans Claude" chiffre={a.actifs ? nombre(a.actifs.semaine) : '—'} detail={a.actifs ? `comptes cette semaine · ${a.actifs.periode} en ${jours} j` : 'mesure à poser'} serie={a.actifs?.serie} jours={j} />
        <Tuile titre="Appels à vavi depuis Claude" chiffre={a.appels ? nombre(a.appels.periode) : '—'} detail={a.appels ? `${nombre(a.appels.semaine)} cette semaine${tauxDeRefus}` : 'mesure à poser'} serie={a.appels?.serie} jours={j} />
        <Tuile titre="Projets créés" chiffre={nombre(a.projets.periode)} detail={`${a.projets.semaine} cette semaine · ${a.projets.total} en tout`} serie={a.projets.serie} jours={j} />
        <Tuile titre="Builds réussis" chiffre={a.builds ? nombre(a.builds.verts.periode) : '—'} detail={a.builds ? `${a.builds.rouges} en échec · ${part(a.builds.verts.periode, a.builds.verts.periode + a.builds.rouges)} de réussite` : 'mesure à poser'} serie={a.builds?.verts.serie} jours={j} />
        <Tuile titre="Sites en ligne" chiffre={nombre(a.misesEnLigne.enLigne)} detail={`+${a.misesEnLigne.periode} publiés en ${jours} j`} serie={a.misesEnLigne.serie} jours={j} />
        <Tuile titre="Visites des sites" chiffre={a.visites ? nombre(a.visites.periode) : '—'} detail={a.visites ? `${nombre(a.visites.semaine)} cette semaine, sans cookie` : 'mesure à poser'} serie={a.visites?.serie} jours={j} />
        <Tuile titre="Revenu mensuel TTC" chiffre={revenu} detail={`${abonnes} abonné(s) payant(s) · ${essais} à l’essai`} jours={j} />
      </div>

      <div className="grille-deux">
        <div className="carte"><h3>Appels à vavi depuis Claude, par jour</h3>{a.appels ? <Aire serie={enCourbe(a.appels, j)} langue="fr" /> : <p className="attenue">À poser : la migration de l’activité.</p>}</div>
        <div className="carte"><h3>Inscriptions, par jour</h3><Aire serie={enCourbe(a.inscrits, j)} langue="fr" /></div>
      </div>

      <div className="grille-deux">
        <div className="carte"><h3>Du compte au site en ligne</h3>
          <ul className="liste">
            <li><span>Comptes</span><strong>{a.conversion.comptes}</strong></li>
            <li><span>Avec au moins un projet</span><strong>{a.conversion.avecUnProjet} <span className="attenue">({part(a.conversion.avecUnProjet, a.conversion.comptes)})</span></strong></li>
            <li><span>Avec un site en ligne</span><strong>{a.conversion.avecUnSiteEnLigne} <span className="attenue">({part(a.conversion.avecUnSiteEnLigne, a.conversion.comptes)})</span></strong></li>
            <li><span>Abonnés payants</span><strong>{abonnes} <span className="attenue">({part(abonnes, a.conversion.comptes)})</span></strong></li>
          </ul>
        </div>
        <div className="carte"><h3>Ce que Claude demande à vavi ({jours} j)</h3>
          {!a.appels ? <p className="attenue">À poser : la migration de l’activité.</p> : a.appels.parOutil.length === 0 ? <p className="attenue">Aucun appel pour l’instant.</p> : (
            <ul className="liste">{a.appels.parOutil.slice(0, 10).map((o) => <li key={o.outil}><span><code>{o.outil}</code></span><strong>{nombre(o.appels)}{o.refus ? <span className="attenue"> · {o.refus} refus</span> : null}</strong></li>)}</ul>
          )}
        </div>
      </div>
      <p className="attenue">Sans les comptes administrateurs{masques ? ` (leurs ${masques} projet(s) ne sont comptés nulle part ici)` : ''}. L’usage du connecteur se compte depuis la pose de sa mesure, le 27/11.</p>
    </section>
  );
}
