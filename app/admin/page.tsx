/** /admin — la page de l'administrateur de vavi : comptes, abonnements et revenus, projets, visites, ventes, services, journal ; et ses gestes. */
import type { Metadata } from 'next';
import { lAdministrateur } from '@/app/_partage/l-administration-reelle';
import { leTableau, lEtatDesServices } from '@/lib/administration/le-tableau';
import { enClair, lePremierSite } from '@/lib/administration/le-premier-site';
import { OFFRES, OFFRES_PAYANTES, type EtatDeLAbonnement } from '@/lib/abonnements/les-offres';
import { schemaDuProjet } from '@/lib/relais/le-schema-d-une-app';
import { changerLaGrille, offrirUnAbonnement, reduire, retirerLaReduction, retirerUnOffert } from './gestes';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Administration — vavi', robots: { index: false, follow: false } };

const JOURS = 30;
const date = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString('fr-FR', { dateStyle: 'medium', timeZone: 'Europe/Paris' }) : '—');
const euros = (c: number | null) => (c === null ? '—' : `${(c / 100).toLocaleString('fr-FR', { minimumFractionDigits: c % 100 ? 2 : 0, maximumFractionDigits: 2 })} €`);
const lEtat = (e: EtatDeLAbonnement) => e.etat === 'aucun' ? 'essai'
  : e.etat === 'actif' ? `${OFFRES[e.offre].nom.fr}${e.offert ? ' (offert)' : ''} · ${e.projets} projet(s)${e.resilieALaFin && !e.offert ? ' · résilié à la fin' : ''}`
    : e.etat === 'grace' ? `${OFFRES[e.offre].nom.fr} · impayé, pause le ${date(e.pauseLe)}` : `${OFFRES[e.offre].nom.fr} · en pause`;

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const q = await searchParams;
  const { sur } = await lAdministrateur();
  const maintenant = Date.now();
  const [brut, comptes, premier] = await Promise.all([sur.leTableauBrut(new Date(maintenant - JOURS * 24 * 3600 * 1000).toISOString()), sur.lesComptes(), sur.lePremierSiteBrut()]);
  const services = lEtatDesServices(process.env);
  if (!brut.lu || !comptes.lu) {
    return <main className="console"><h1>Administration</h1><p role="alert">Je n’ai pas pu lire la base : {!brut.lu ? brut.pourquoi : !comptes.lu ? comptes.pourquoi : ''}</p></main>;
  }
  const t = leTableau(brut.valeur, comptes.valeur, maintenant, schemaDuProjet);
  const courriel = new Map(t.comptes.map((c) => [c.id, c.courriel ?? c.id.slice(0, 8)]));
  const offerts = t.comptes.filter((c) => c.etat.etat === 'actif' && c.etat.offert);
  const choixDuCompte = t.comptes.map((c) => <option key={c.id} value={c.id}>{c.courriel ?? c.id}</option>);
  return (
    <main className="console" style={{ maxWidth: 1200 }}>
      <div className="entete"><h1>Administration</h1><span className="attenue">relu le {new Date(maintenant).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}</span></div>
      {q.fait && <div className="carte" role="status">Fait : {q.fait}</div>}
      {q.refus && <div className="carte" role="alert">Refusé : {q.refus}</div>}

      <h2>Abonnements et revenus</h2>
      <div className="chiffres">
        <div className="carte"><span className="attenue">Revenu mensuel TTC</span><strong>{euros(t.revenus.mensuel)}</strong><span className="attenue">avant réductions{t.revenus.sansMontant ? `, ${t.revenus.sansMontant} sans montant connu` : ''}</span></div>
        <div className="carte"><span className="attenue">Abonnés payants</span><strong>{t.revenus.abonnes}</strong></div>
        <div className="carte"><span className="attenue">Offerts</span><strong>{t.revenus.offerts}</strong></div>
        <div className="carte"><span className="attenue">Impayés (grâce · pause)</span><strong>{t.revenus.enGrace} · {t.revenus.suspendus}</strong></div>
        <div className="carte"><span className="attenue">Ce mois : nouveaux · résiliés</span><strong>{t.revenus.nouveauxCeMois} · {t.revenus.resiliesCeMois}</strong></div>
        <div className="carte"><span className="attenue">Comptes</span><strong>{t.comptes.length}</strong></div>
      </div>

      <h2>Comptes</h2>
      <div className="defile carte"><table className="tableau">
        <thead><tr><th>Compte</th><th>Créé</th><th>Dernière connexion</th><th>Projets (en ligne)</th><th>Abonnement</th><th>Facturé / mois</th></tr></thead>
        <tbody>{t.comptes.map((c) => <tr key={c.id}><td>{c.courriel ?? c.id}</td><td>{date(c.creeLe)}</td><td>{date(c.derniereConnexion)}</td><td>{c.projets} ({c.enLigne})</td><td>{lEtat(c.etat)}</td><td>{euros(c.montant)}</td></tr>)}</tbody>
      </table></div>

      <h2>Le temps jusqu’au premier site</h2>
      {premier.lu ? (() => {
        const etapes = lePremierSite(premier.valeur, comptes.valeur);
        const total = etapes[0]?.atteinte ?? 0;
        return <div className="defile carte"><table className="tableau">
          <thead><tr><th>Étape</th><th>Comptes</th><th>Part des comptes</th><th>Depuis l’étape d’avant (médiane)</th><th>Depuis le compte (médiane)</th></tr></thead>
          <tbody>{etapes.map((e) => <tr key={e.etape}><td>{e.libelle}</td><td>{e.atteinte}</td><td>{total ? `${Math.round((e.atteinte / total) * 100)} %` : '—'}</td>
            <td>{enClair(e.depuisLAvant)}</td><td>{enClair(e.depuisLeCompte)}</td></tr>)}</tbody>
        </table></div>;
      })() : <p className="carte attenue">La mesure n’est pas lisible ({premier.pourquoi}) : colle la migration 20261126090000_le_premier_site.sql dans Supabase.</p>}
      <p className="attenue">Le connecteur et le parcours sont notés depuis le 26/11 ; le projet, le build vert et la mise en ligne se lisent aussi des projets existants.</p>

      <h2>Offrir un abonnement</h2>
      <form action={offrirUnAbonnement} className="carte formulaire-admin">
        <label>Compte<select name="compte" required>{choixDuCompte}</select></label>
        <label>Offre<select name="offre">{OFFRES_PAYANTES.map((o) => <option key={o} value={o}>{OFFRES[o].nom.fr}</option>)}</select></label>
        <label>Projets en plus<input type="number" name="en_plus" min={0} max={50} defaultValue={0} style={{ width: '5rem' }} /></label>
        <label>Durée (mois)<input type="number" name="mois" min={1} max={120} defaultValue={1} style={{ width: '5rem' }} /></label>
        <label>Motif<input name="motif" maxLength={200} placeholder="facultatif" /></label>
        <button type="submit">Offrir</button>
      </form>
      {offerts.length > 0 && <ul className="liste carte">{offerts.map((c) => <li key={c.id}><span>{c.courriel} · {lEtat(c.etat)} · jusqu’au {date(c.etat.etat === 'actif' ? c.etat.jusquAu : null)}</span>
        <form action={retirerUnOffert}><input type="hidden" name="compte" value={c.id} /><button type="submit" className="discret">Retirer</button></form></li>)}</ul>}
      <p className="attenue">Un abonnement offert ne passe pas par Stripe. Un abonnement payé et actif l’emporte sur lui.</p>

      <h2>Réductions temporaires</h2>
      <form action={reduire} className="carte formulaire-admin">
        <label>Pour<select name="compte"><option value="tous">tous les clients</option>{choixDuCompte}</select></label>
        <label>Réduction (%)<input type="number" name="pourcent" min={1} max={100} defaultValue={20} style={{ width: '5rem' }} required /></label>
        <label>Pendant (mois)<input type="number" name="mois" min={1} max={36} defaultValue={3} style={{ width: '5rem' }} required /></label>
        <label>Offerte aux nouveaux paiements pendant (jours)<input type="number" name="jours" min={1} max={365} defaultValue={30} style={{ width: '5rem' }} /></label>
        <button type="submit">Créer la réduction</button>
      </form>
      {t.reductions.length > 0 && <div className="defile carte"><table className="tableau">
        <thead><tr><th>Pour</th><th>Réduction</th><th>Valable jusqu’au</th><th>Créée</th><th></th></tr></thead>
        <tbody>{t.reductions.map((r) => <tr key={r.id}><td>{r.compte ? courriel.get(r.compte) ?? r.compte : 'tous'}</td><td>-{r.pourcent} % pendant {r.mois} mois</td>
          <td>{r.retiree_le ? `retirée le ${date(r.retiree_le)}` : date(r.valable_jusqu_au)}</td><td>{date(r.cree_le)}</td>
          <td>{!r.retiree_le && <form action={retirerLaReduction}><input type="hidden" name="reduction" value={r.id} /><button type="submit" className="discret">Retirer</button></form>}</td></tr>)}</tbody>
      </table></div>}
      <p className="attenue">La réduction est posée tout de suite sur les abonnements en cours visés, et sur chaque nouveau paiement tant qu’elle est valable. Elle remplace la réduction qu’un abonnement portait.</p>

      <h2>Prix des abonnements</h2>
      <form action={changerLaGrille} className="carte formulaire-admin">
        {(['site', 'boutique', 'pro', 'enPlus'] as const).map((k) => <label key={k}>{k === 'enPlus' ? 'Projet en plus' : OFFRES[k].nom.fr} (€ TTC / mois)
          <input name={k} inputMode="decimal" placeholder={euros(t.grille[k]).replace(' €', '')} style={{ width: '7rem' }} /></label>)}
        <button type="submit">Changer les prix</button>
      </form>
      <p className="attenue">En vigueur : Site {euros(t.grille.site)}, Boutique ou app {euros(t.grille.boutique)}, Pro {euros(t.grille.pro)}, projet en plus {euros(t.grille.enPlus)}. Un nouveau prix vaut pour les abonnements à venir. Ceux en cours gardent le leur. Pense aussi à changer la grille du site public.</p>

      <h2>Projets</h2>
      <div className="defile carte"><table className="tableau">
        <thead><tr><th>Projet</th><th>Propriétaire</th><th>Nature</th><th>En ligne</th><th>Modifié</th><th>Visites ({JOURS} j)</th><th>Ventes payées (dont {JOURS} j)</th></tr></thead>
        <tbody>{t.projets.map((p) => <tr key={p.id}><td>{p.nom}</td><td>{p.courriel ?? '—'}</td><td>{p.nature ?? '—'}</td><td>{p.en_ligne ? `oui, le ${date(p.en_ligne_le)}` : 'non'}</td>
          <td>{date(p.modifie_le)}</td><td>{p.visites}</td><td>{p.ventes ? `${p.ventes.nombre} (${p.ventes.recentes}) · ${p.ventes.montants}` : '—'}</td></tr>)}</tbody>
      </table></div>

      <h2>Visites des {JOURS} derniers jours</h2>
      <div className="carte"><p><strong>{t.visites.total}</strong> visites des sites en ligne, sans cookie.</p>
        {t.visites.parSite.length > 0 && <ul className="liste">{t.visites.parSite.map((s) => <li key={s.nom}><span>{s.nom}</span><strong>{s.visites}</strong></li>)}</ul>}</div>

      <h2>État des services</h2>
      <ul className="liste carte">{services.map((s) => <li key={s.service}><span>{s.service}</span>
        <span className={s.manquent.length ? '' : 'attenue'} style={s.manquent.length ? { color: 'var(--alerte)' } : undefined}>{s.manquent.length ? `manque : ${s.manquent.join(', ')}` : 'secrets posés'}</span></li>)}</ul>

      <h2>Journal</h2>
      <div className="carte">
        <p className="attenue">Builds en échec ({JOURS} j) : {t.buildsEnEchec.length || 'aucun'}</p>
        {t.buildsEnEchec.length > 0 && <ul className="liste">{t.buildsEnEchec.map((b, i) => <li key={i}><span>{t.projets.find((p) => p.id === b.projet)?.nom ?? b.projet}</span><span className="attenue">{date(b.le)} · {b.ecarts} erreur(s)</span></li>)}</ul>}
        <p className="attenue">Tes derniers gestes : {t.gestes.length ? '' : 'aucun'}</p>
        {t.gestes.length > 0 && <ul className="liste">{t.gestes.map((g, i) => <li key={i}><span>{g.geste.replace(/_/g, ' ')}{g.cible ? ` · ${courriel.get(g.cible) ?? g.cible}` : ''}</span><span className="attenue">{new Date(g.le).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}</span></li>)}</ul>}
      </div>
    </main>
  );
}
