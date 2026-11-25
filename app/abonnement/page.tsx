/**
 * /abonnement — « Mon compte » : l'offre et ce qu'elle coûte, la prochaine échéance, les projets en ligne (ceux que l'offre
 * paie), les factures de Stripe, le moyen de paiement ; puis choisir ou changer d'offre, résilier. Refait le 25/11
 * (Antoine : « la page abonnement doit être améliorée comme celle des projets », « l'utilisateur doit voir les données
 * financières de son compte et les projets publiés et payés »), sous la même barre que toutes les pages du compte.
 */
import Link from 'next/link';
import { laConsole } from '@/app/_partage/la-console';
import { TEXTES } from '@/app/_partage/textes';
import { BarreDuCompte } from '@/app/_partage/la-barre-du-compte';
import { adresseDeLApp } from '@/app/_partage/l-adresse-des-apps';
import { lesAbonnementsReels, PAGE_DE_L_ABONNEMENT } from '@/app/_partage/les-abonnements-reels';
import { lEtatDuCompte, lesFacturesDuCompte } from '@/lib/abonnements/l-abonnement';
import { GRILLE_DU_CODE, OFFRES, OFFRES_PAYANTES, leMontant } from '@/lib/abonnements/les-offres';
import { choisir, ouvrirLePortail, resilierALaFin } from './gestes';

export const dynamic = 'force-dynamic';

const MOTS = {
  fr: { sousTitre: 'Votre offre, ce qu’elle coûte, vos factures et vos projets en ligne.', offre: 'Offre', essai: 'Essai gratuit', parMois: 'par mois', echeance: 'Prochaine échéance',
    enLigne: 'Projets en ligne', compris: (n: number) => `sur ${n} compris dans l’offre`, aucunCompris: 'aucun compris : l’essai ne publie pas', projetsEnLigne: 'Vos projets en ligne',
    aucunEnLigne: 'Aucun projet en ligne. Un projet se publie depuis sa page, avec le bouton « Publier », une fois une offre choisie.', paye: 'payé par l’offre', horsOffre: (n: number, k: number) => `${n} projets en ligne pour ${k} compris dans votre offre : ajoutez des projets en plus à votre offre, ou retirez-en un de la publication.`,
    voir: 'Voir le site', ouvrir: 'Ouvrir', factures: 'Vos factures', aucuneFacture: 'Aucune facture pour l’instant : la première arrive avec votre premier paiement.',
    facturesIllisibles: 'Les factures n’ont pas pu être lues chez Stripe ; réessayez dans un moment.', date: 'Date', numero: 'Numéro', montant: 'Montant', statut: 'État',
    statuts: { paid: 'Payée', open: 'À régler', void: 'Annulée', uncollectible: 'Impayée', draft: 'En préparation' } as Record<string, string>, telecharger: 'PDF', regler: 'Voir',
    portail: 'Carte bancaire et factures chez Stripe', portailExplication: 'Changer de carte, télécharger une facture, mettre à jour l’adresse de facturation.',
    offres: 'Les offres', actuelle: 'Votre offre', offert: 'offert' },
  en: { sousTitre: 'Your offer, what it costs, your invoices and your projects online.', offre: 'Offer', essai: 'Free trial', parMois: 'per month', echeance: 'Next payment',
    enLigne: 'Projects online', compris: (n: number) => `of ${n} included in the offer`, aucunCompris: 'none included: the trial does not publish', projetsEnLigne: 'Your projects online',
    aucunEnLigne: 'No project online. A project is published from its page, with the “Publish” button, once an offer is chosen.', paye: 'paid by the offer', horsOffre: (n: number, k: number) => `${n} projects online for ${k} included in your offer: add extra projects to your offer, or unpublish one.`,
    voir: 'View the site', ouvrir: 'Open', factures: 'Your invoices', aucuneFacture: 'No invoice yet: the first one comes with your first payment.',
    facturesIllisibles: 'The invoices could not be read at Stripe; try again in a moment.', date: 'Date', numero: 'Number', montant: 'Amount', statut: 'Status',
    statuts: { paid: 'Paid', open: 'To pay', void: 'Void', uncollectible: 'Unpaid', draft: 'Draft' } as Record<string, string>, telecharger: 'PDF', regler: 'View',
    portail: 'Card and invoices at Stripe', portailExplication: 'Change card, download an invoice, update the billing address.',
    offres: 'Offers', actuelle: 'Your offer', offert: 'offered' },
} as const;

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const q = await searchParams;
  const c = await laConsole(PAGE_DE_L_ABONNEMENT);
  const t = TEXTES[c.langue].abonnement;
  const m = MOTS[c.langue];
  const d = lesAbonnementsReels();
  const [e, g, a, f, l] = await Promise.all([lEtatDuCompte(d, c.compte), d.laGrille(), d.lAbonnement(c.compte), lesFacturesDuCompte(d, c.compte), c.projets.lister(c.compte)]);
  const grille = g.lu ? g.valeur : GRILLE_DU_CODE;
  const locale = c.langue === 'fr' ? 'fr-FR' : 'en-GB';
  const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(locale, { dateStyle: 'long' }) : '—');
  const euros = (centimes: number, devise = 'EUR') => new Intl.NumberFormat(locale, { style: 'currency', currency: devise, maximumFractionDigits: centimes % 100 ? 2 : 0 }).format(centimes / 100);
  const v = e.lu ? e.valeur : null;
  const etat = !v ? null : v.etat === 'aucun' ? t.essai
    : v.etat === 'actif' ? (v.resilieALaFin ? t.resilieLe(OFFRES[v.offre].nom[c.langue], date(v.jusquAu)) : t.actif(OFFRES[v.offre].nom[c.langue], v.projets, date(v.jusquAu)))
      : v.etat === 'grace' ? t.grace(date(v.pauseLe)) : t.suspendu;
  const offre = v && v.etat !== 'aucun' ? v.offre : null;
  const offert = v?.etat === 'actif' && v.offert === true;
  const enPlus = a.lu && a.valeur && a.valeur.offre === offre ? a.valeur.projetsEnPlus : 0;
  const compris = v && (v.etat === 'actif' || v.etat === 'grace') ? v.projets : 0;
  const enLigne = l.lu ? [...l.valeur].filter((p) => p.enLigneEmpreinte !== null).sort((x, y) => x.nom.localeCompare(y.nom)) : [];
  const echeance = v?.etat === 'actif' ? (v.resilieALaFin || offert ? '—' : date(v.jusquAu)) : v?.etat === 'grace' ? date(v.pauseLe) : '—';
  return (
    <div className="accueil-console">
      <BarreDuCompte langue={c.langue} courriel={c.courriel} ici="compte" />
      <main className="console large">
        <div className="tete-de-page"><div><p className="surtitre">{c.langue === 'fr' ? 'Compte' : 'Account'}</p><h1>{t.titre}</h1><p className="attenue">{m.sousTitre}</p></div></div>
        {q.fait === 'abonne' && <div className="carte" role="status">{t.merci}</div>}
        {q.fait === 'resilie' && <div className="carte" role="status">{t.resilie}</div>}
        {q.erreur && <div className="carte" role="alert">{t.erreurs[q.erreur] ?? q.erreur}</div>}

        <div className="chiffres-du-compte">
          <div className="chiffre-du-compte"><span className="attenue">{m.offre}</span><strong>{offre ? OFFRES[offre].nom[c.langue] : m.essai}</strong>{offert && <span className="etat vert">{m.offert}</span>}</div>
          <div className="chiffre-du-compte"><span className="attenue">{m.parMois}</span><strong>{offre && !offert ? euros(leMontant(offre, enPlus, grille)) : euros(0)}</strong><span className="attenue">TTC</span></div>
          <div className="chiffre-du-compte"><span className="attenue">{m.echeance}</span><strong>{echeance}</strong></div>
          <div className="chiffre-du-compte"><span className="attenue">{m.enLigne}</span><strong>{enLigne.length}</strong><span className="attenue">{compris ? m.compris(compris) : m.aucunCompris}</span>{compris > 0 && <div className={`jauge ${enLigne.length >= compris ? 'pleine' : ''}`} role="meter" aria-valuemin={0} aria-valuemax={compris} aria-valuenow={enLigne.length} aria-label={m.enLigne}><span style={{ width: `${Math.min(100, (enLigne.length / compris) * 100)}%` }} /></div>}</div>
        </div>
        {!e.lu ? <p role="alert">{TEXTES[c.langue].erreur} {e.pourquoi}</p> : <div className="carte"><p style={{ margin: 0 }}>{etat}</p></div>}

        <h2>{m.projetsEnLigne}</h2>
        {compris > 0 && enLigne.length > compris && <div className="carte" role="alert">{m.horsOffre(enLigne.length, compris)}</div>}
        {enLigne.length === 0 ? <p className="attenue">{m.aucunEnLigne}</p> : (
          <ul className="grille-projets">
            {enLigne.map((p) => (
              <li key={p.id} className="carte-projet">
                <Link href={`/projets/${p.id}`} className="carte-projet-lien">
                  <span className="initiale" aria-hidden="true">{[...p.nom.trim()][0]?.toUpperCase() ?? '·'}</span>
                  <span className="carte-projet-titre"><strong>{p.nom}</strong><span className="attenue">{TEXTES[c.langue].version} {p.version}</span></span>
                </Link>
                {compris > 0 && enLigne.length <= compris && <div className="ligne"><span className="etat vert">{m.paye}</span></div>}
                <div className="ligne carte-projet-actions">
                  <Link className="bouton" href={`/projets/${p.id}`}>{m.ouvrir}</Link>
                  <a className="bouton discret" href={adresseDeLApp(p.id, 'en_ligne')} target="_blank" rel="noreferrer">{m.voir}</a>
                </div>
              </li>
            ))}
          </ul>
        )}

        <h2>{m.factures}</h2>
        <div className="carte">
          {!f.lu ? <p role="alert">{m.facturesIllisibles}</p> : f.valeur.length === 0 ? <p className="attenue" style={{ margin: 0 }}>{m.aucuneFacture}</p> : (
            <table className="tableau-simple">
              <thead><tr><th>{m.date}</th><th>{m.numero}</th><th>{m.montant}</th><th>{m.statut}</th><th /></tr></thead>
              <tbody>
                {f.valeur.map((x) => (
                  <tr key={`${x.le}-${x.numero ?? ''}`}>
                    <td>{date(x.le)}</td><td>{x.numero ?? '—'}</td><td>{euros(x.centimes, x.devise)}</td>
                    <td><span className={`etat ${x.statut === 'paid' ? 'vert' : x.statut === 'open' || x.statut === 'uncollectible' ? 'ambre' : ''}`}>{m.statuts[x.statut] ?? x.statut}</span></td>
                    <td className="ligne">{x.lien && <a href={x.lien} target="_blank" rel="noreferrer">{m.regler}</a>}{x.pdf && <a href={x.pdf} target="_blank" rel="noreferrer">{m.telecharger}</a>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {a.lu && a.valeur?.client && (
            <form action={ouvrirLePortail} className="ligne" style={{ marginTop: '1rem', justifyContent: 'space-between' }}>
              <span className="attenue">{m.portailExplication}</span>
              <button type="submit" className="discret">{m.portail}</button>
            </form>
          )}
        </div>

        <h2>{m.offres}</h2>
        <ul className="grille-projets">
          {OFFRES_PAYANTES.map((o) => (
            <li key={o} className={`carte-offre ${offre === o ? 'choisie' : ''}`}>
              <div className="ligne" style={{ justifyContent: 'space-between' }}><strong style={{ fontSize: '1.15rem' }}>{OFFRES[o].nom[c.langue]}</strong>{offre === o && <span className="etat bleu">{m.actuelle}</span>}</div>
              <div><span className="prix">{euros(grille[o])}</span> <span className="attenue">{t.parMois}</span></div>
              <p className="attenue" style={{ margin: 0 }}>{t.detail[o]}</p>
              <form action={choisir}>
                <input type="hidden" name="offre" value={o} />
                <label className="attenue" htmlFor={`en-plus-${o}`}>{t.enPlus(euros(grille.enPlus))}</label>
                <input id={`en-plus-${o}`} type="number" name="en_plus" min={0} max={50} defaultValue={offre === o ? enPlus : 0} style={{ width: '5rem' }} />
                <button type="submit">{offre === o ? t.changer : t.choisir}</button>
              </form>
            </li>
          ))}
        </ul>
        {v && v.etat === 'actif' && !v.resilieALaFin && !offert && (
          <form action={resilierALaFin} className="carte bloc-claude"><p className="attenue">{t.resilierExplication}</p><button type="submit" className="discret danger">{t.resilier}</button></form>
        )}
        <p className="attenue">{t.mentions}</p>
      </main>
    </div>
  );
}
