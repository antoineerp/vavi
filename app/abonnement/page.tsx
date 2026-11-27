/**
 * /abonnement — « Mon compte », compris en un coup d'œil (Antoine, 27/11 : « jolie mais pas forcément intuitive […] cela
 * s'adresse à des débutants »). CE QU'ELLE REMPLACE : une carte de chiffres (« Prochaine échéance », « Projets en plus »),
 * une jauge, puis les offres en bas. Désormais, de haut en bas :
 *   1. une phrase qui dit où l'on en est, et UN geste (choisir une offre, régler, publier le projet d'où l'on vient) ;
 *   2. les PLACES de l'offre, chacune avec le site qui l'occupe, ou libre ;
 *   3. les factures, avec le prochain paiement et l'engagement dits en clair ;
 *   4. les offres côte à côte, en mots de tous les jours (« Ajouter des places » replié).
 * Au retour du paiement, le projet d'où l'on venait (`projet`) est proposé à la publication.
 */
import Link from 'next/link';
import { laConsole } from '@/app/_partage/la-console';
import { TEXTES } from '@/app/_partage/textes';
import { BarreDuCompte, EnTeteDePilotage } from '@/app/_partage/la-barre-du-compte';
import { Icone } from '@/app/_partage/les-icones';
import { claudeYTravaille, lEtat, laTeinte } from '@/app/_partage/le-pilotage';
import { adresseDeLApp } from '@/app/_partage/l-adresse-des-apps';
import { lesAbonnementsReels, PAGE_DE_L_ABONNEMENT } from '@/app/_partage/les-abonnements-reels';
import { lEtatDuCompte, lesFacturesDuCompte, lireLeRetourDuPaiement } from '@/lib/abonnements/l-abonnement';
import { GRILLE_DU_CODE, OFFRES, OFFRES_PAYANTES } from '@/lib/abonnements/les-offres';
import { choisir, ouvrirLePortail, resilierALaFin } from './gestes';

export const dynamic = 'force-dynamic';

const MOTS = {
  fr: { sousTitre: 'Votre offre, vos sites en ligne et vos factures.', essai: 'Essai gratuit',
    etatEssai: 'Vous êtes sur l’essai gratuit : vos projets se voient en aperçu, aucun n’est en ligne. Pour mettre un site en ligne, choisissez une offre.',
    etatActif: (o: string, n: number, k: number) => `Offre ${o} : ${n} site${n > 1 ? 's' : ''} en ligne sur ${k} place${k > 1 ? 's' : ''}.`,
    prochain: (d: string) => `Prochain paiement le ${d}.`, offertJusqu: (d: string) => `Offerte jusqu’au ${d}.`,
    choisirUneOffre: 'Choisir une offre', regler: 'Régler le paiement', publierLe: (n: string) => `Publier ${n}`,
    cEstFait: (n: string) => `C’est fait : votre offre est active. Vous pouvez maintenant publier ${n}.`, cEstFaitSans: 'C’est fait : votre offre est active. Vous pouvez publier vos projets.',
    places: 'Vos places en ligne', placesExplication: 'Chaque place met un site ou une app en ligne. Un projet occupe une place quand vous cliquez « Publier » sur sa page.',
    place: (i: number) => `Place ${i}`, libre: 'Libre : publiez un projet pour l’occuper.', mesProjets: 'Mes projets', aucunePlace: 'L’essai gratuit n’a aucune place : choisissez une offre ci-dessous.',
    horsOffre: (n: number, k: number) => `${n} sites en ligne pour ${k} places : ajoutez une place à votre offre, ou retirez un site de la publication.`, enTrop: 'en trop',
    voir: 'Voir le site', ouvrir: 'Ouvrir', factures: 'Vos factures', aucuneFacture: 'Aucune facture pour l’instant : la première arrive avec votre premier paiement.',
    facturesIllisibles: 'Les factures n’ont pas pu être lues chez Stripe ; réessayez dans un moment.', date: 'Date', montant: 'Montant', statut: 'État',
    statuts: { paid: 'Payée', open: 'À régler', void: 'Annulée', uncollectible: 'Impayée', draft: 'En préparation' } as Record<string, string>, telecharger: 'Télécharger (PDF)', voirFacture: 'Voir',
    portail: 'Changer de carte bancaire', portailExplication: 'Votre carte et vos coordonnées de facturation se gèrent chez Stripe ; vavi ne voit jamais votre carte.',
    offres: 'Les offres', actuelle: 'Votre offre', offert: 'offerte', pour: 'Pour', ajouterDesPlaces: 'Besoin de plus de places ?',
    pourQui: { site: '1 site vitrine en ligne', boutique: '1 boutique ou 1 app en ligne', pro: 'jusqu’à 5 sites, boutiques ou apps en ligne' } as Record<string, string> },
  en: { sousTitre: 'Your offer, your sites online and your invoices.', essai: 'Free trial',
    etatEssai: 'You are on the free trial: your projects can be seen in preview, none is online. To put a site online, choose an offer.',
    etatActif: (o: string, n: number, k: number) => `${o} offer: ${n} site${n > 1 ? 's' : ''} online out of ${k} place${k > 1 ? 's' : ''}.`,
    prochain: (d: string) => `Next payment on ${d}.`, offertJusqu: (d: string) => `Offered until ${d}.`,
    choisirUneOffre: 'Choose an offer', regler: 'Settle the payment', publierLe: (n: string) => `Publish ${n}`,
    cEstFait: (n: string) => `Done: your offer is active. You can now publish ${n}.`, cEstFaitSans: 'Done: your offer is active. You can publish your projects.',
    places: 'Your places online', placesExplication: 'Each place puts one site or app online. A project takes a place when you click “Publish” on its page.',
    place: (i: number) => `Place ${i}`, libre: 'Free: publish a project to take it.', mesProjets: 'My projects', aucunePlace: 'The free trial has no place: choose an offer below.',
    horsOffre: (n: number, k: number) => `${n} sites online for ${k} places: add a place to your offer, or unpublish a site.`, enTrop: 'extra',
    voir: 'View the site', ouvrir: 'Open', factures: 'Your invoices', aucuneFacture: 'No invoice yet: the first one comes with your first payment.',
    facturesIllisibles: 'The invoices could not be read at Stripe; try again in a moment.', date: 'Date', montant: 'Amount', statut: 'Status',
    statuts: { paid: 'Paid', open: 'To pay', void: 'Void', uncollectible: 'Unpaid', draft: 'Draft' } as Record<string, string>, telecharger: 'Download (PDF)', voirFacture: 'View',
    portail: 'Change bank card', portailExplication: 'Your card and billing details are managed at Stripe; vavi never sees your card.',
    offres: 'Offers', actuelle: 'Your offer', offert: 'offered', pour: 'For', ajouterDesPlaces: 'Need more places?',
    pourQui: { site: '1 showcase site online', boutique: '1 shop or 1 app online', pro: 'up to 5 sites, shops or apps online' } as Record<string, string> },
} as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const q = await searchParams;
  const c = await laConsole(PAGE_DE_L_ABONNEMENT);
  const t = TEXTES[c.langue].abonnement;
  const m = MOTS[c.langue];
  const d = lesAbonnementsReels();
  // Au retour du paiement, l'abonnement est lu chez Stripe sans attendre le webhook (27/11).
  if (q.fait === 'abonne') await lireLeRetourDuPaiement(d, c.compte, q.session).catch(() => false);
  const [e, g, a, f, l] = await Promise.all([lEtatDuCompte(d, c.compte), d.laGrille(), d.lAbonnement(c.compte), lesFacturesDuCompte(d, c.compte), c.projets.lister(c.compte)]);
  const grille = g.lu ? g.valeur : GRILLE_DU_CODE;
  const locale = c.langue === 'fr' ? 'fr-FR' : 'en-GB';
  const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(locale, { dateStyle: 'long' }) : '—');
  const euros = (centimes: number, devise = 'EUR') => new Intl.NumberFormat(locale, { style: 'currency', currency: devise, maximumFractionDigits: centimes % 100 ? 2 : 0 }).format(centimes / 100);
  const v = e.lu ? e.valeur : null;
  const offre = v && v.etat !== 'aucun' ? v.offre : null;
  const offert = v?.etat === 'actif' && v.offert === true;
  const enPlus = a.lu && a.valeur && a.valeur.offre === offre ? a.valeur.projetsEnPlus : 0;
  const compris = v && (v.etat === 'actif' || v.etat === 'grace') ? v.projets : 0;
  const enLigne = l.lu ? [...l.valeur].filter((p) => p.enLigneEmpreinte !== null).sort((x, y) => (x.enLigneLe ?? '').localeCompare(y.enLigneLe ?? '') || x.nom.localeCompare(y.nom)) : [];
  // Le projet d'où l'on vient (« Publier : choisir une offre ») : à lui de reprendre après le paiement.
  const venu = q.projet && UUID.test(q.projet) && l.lu ? l.valeur.find((p) => p.id === q.projet) ?? null : null;
  const maintenant = Date.now();
  const menu = l.lu ? [...l.valeur].sort((x, y) => y.modifieLe.localeCompare(x.modifieLe)).map((p) => ({ id: p.id, nom: p.nom, etat: lEtat(p), claude: claudeYTravaille(p, maintenant) })) : [];

  // 1. Où l'on en est, en une phrase, et un seul geste.
  const phrase = !v ? null : v.etat === 'aucun' ? m.etatEssai
    : v.etat === 'actif' ? (v.resilieALaFin ? t.resilieLe(OFFRES[v.offre].nom[c.langue], date(v.engageJusquAu ?? v.jusquAu)) : m.etatActif(OFFRES[v.offre].nom[c.langue], enLigne.length, v.projets))
      : v.etat === 'grace' ? t.grace(date(v.pauseLe)) : t.suspendu;
  const detail = v?.etat === 'actif' && !v.resilieALaFin
    ? [offert ? m.offertJusqu(date(v.jusquAu)) : v.jusquAu ? m.prochain(date(v.jusquAu)) : null, v.engageJusquAu ? t.engage(date(v.engageJusquAu)) : null].filter(Boolean).join(' ') : null;
  const geste = !v ? null
    : v.etat === 'actif' ? (venu && venu.enLigneEmpreinte === null ? <Link className="bouton" href={`/projets/${venu.id}`}>{m.publierLe(venu.nom)}</Link> : null)
      : v.etat === 'grace' && a.lu && a.valeur?.client ? <form action={ouvrirLePortail}><button type="submit">{m.regler}</button></form>
        : <a className="bouton" href="#offres">{m.choisirUneOffre}</a>;
  const places = Array.from({ length: Math.max(compris, enLigne.length) }, (_, i) => ({ numero: i + 1, projet: enLigne[i] ?? null, enTrop: i >= compris }));

  return (
    <div className="coquille">
      <BarreDuCompte langue={c.langue} courriel={c.courriel} ici="compte" projets={menu} />
      <main className="pilote">
        <EnTeteDePilotage fil={['Console', t.titre]} titre={t.titre} sousTitre={m.sousTitre} />
        {q.fait === 'abonne' && <div className="carte" role="status" style={{ fontWeight: 600 }}>{v?.etat === 'actif' ? (venu ? m.cEstFait(venu.nom) : m.cEstFaitSans) : t.merci}</div>}
        {q.fait === 'resilie' && <div className="carte" role="status">{q.jusqu && !Number.isNaN(Date.parse(q.jusqu)) ? t.resilieEngage(date(q.jusqu)) : t.resilie}</div>}
        {q.erreur && <div className="carte" role="alert">{t.erreurs[q.erreur] ?? q.erreur}</div>}

        <section className="panneau offre-du-compte">
          <div className="offre-tete">
            <strong className="offre-nom">{offre ? OFFRES[offre].nom[c.langue] : m.essai}{offert && <span className="etat vert" style={{ marginLeft: '0.6rem', verticalAlign: 'middle' }}>{m.offert}</span>}</strong>
            {!e.lu ? <p role="alert">{TEXTES[c.langue].erreur} {e.pourquoi}</p> : <p style={{ fontSize: '1.15rem', margin: 0 }}>{phrase}</p>}
            {detail && <p className="attenue" style={{ margin: 0 }}>{detail}</p>}
          </div>
          {geste && <div>{geste}</div>}
        </section>

        <h2 className="titre-de-section">{m.places}</h2>
        <p className="attenue" style={{ marginTop: 0 }}>{m.placesExplication}</p>
        {compris > 0 && enLigne.length > compris && <div className="carte" role="alert">{m.horsOffre(enLigne.length, compris)}</div>}
        {places.length === 0 ? <div className="panneau"><p className="attenue" style={{ margin: 0 }}>{m.aucunePlace}</p></div> : (
          <ul className="panneau lignes-de-projets">
            {places.map((x) => x.projet ? (
              <li key={x.projet.id} style={{ ['--teinte' as string]: laTeinte(x.projet.id) }}>
                <span className="mono attenue">{m.place(x.numero)}</span>
                <Link href={`/projets/${x.projet.id}`} className="tuile-nom">{x.projet.nom}</Link>
                {x.enTrop ? <span className="etat ambre">{m.enTrop}</span> : <span className="etat vert">{TEXTES[c.langue].enLigne}</span>}
                <span className="tuile-actions">
                  <Link className="bouton petit" href={`/projets/${x.projet.id}`}>{m.ouvrir}</Link>
                  <a className="bouton discret petit" href={adresseDeLApp(x.projet.id, 'en_ligne')} target="_blank" rel="noreferrer"><Icone nom="globe" taille={16} />{m.voir}</a>
                </span>
              </li>
            ) : (
              <li key={`libre-${x.numero}`}>
                <span className="mono attenue">{m.place(x.numero)}</span>
                <span className="attenue">{m.libre}</span>
                <span />
                <span className="tuile-actions"><Link className="bouton discret petit" href="/projets">{m.mesProjets}</Link></span>
              </li>
            ))}
          </ul>
        )}

        <h2 className="titre-de-section">{m.factures}</h2>
        <div className="panneau">
          {!f.lu ? <p role="alert">{m.facturesIllisibles}</p> : f.valeur.length === 0 ? <p className="attenue" style={{ margin: 0 }}>{m.aucuneFacture}</p> : (
            <table className="tableau-simple">
              <thead><tr><th>{m.date}</th><th>{m.montant}</th><th>{m.statut}</th><th /></tr></thead>
              <tbody>
                {f.valeur.map((x) => (
                  <tr key={`${x.le}-${x.numero ?? ''}`}>
                    <td>{date(x.le)}</td><td>{euros(x.centimes, x.devise)}</td>
                    <td><span className={`etat ${x.statut === 'paid' ? 'vert' : x.statut === 'open' || x.statut === 'uncollectible' ? 'ambre' : ''}`}>{m.statuts[x.statut] ?? x.statut}</span></td>
                    <td className="ligne">{x.pdf ? <a href={x.pdf} target="_blank" rel="noreferrer">{m.telecharger}</a> : x.lien && <a href={x.lien} target="_blank" rel="noreferrer">{m.voirFacture}</a>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {detail && <p className="attenue" style={{ margin: '1rem 0 0' }}>{detail}</p>}
          {a.lu && a.valeur?.client && (
            <form action={ouvrirLePortail} className="ligne" style={{ marginTop: '1rem', justifyContent: 'space-between' }}>
              <span className="attenue">{m.portailExplication}</span>
              <button type="submit" className="discret">{m.portail}</button>
            </form>
          )}
        </div>

        <h2 className="titre-de-section" id="offres">{m.offres}</h2>
        <ul className="tuiles offres">
          {OFFRES_PAYANTES.map((o) => (
            <li key={o} className={`carte-offre ${offre === o ? 'choisie' : ''}`}>
              <div className="ligne" style={{ justifyContent: 'space-between' }}><strong style={{ fontSize: '1.15rem' }}>{OFFRES[o].nom[c.langue]}</strong>{offre === o && <span className="etat bleu">{m.actuelle}</span>}</div>
              <p style={{ margin: 0, fontWeight: 600 }}>{m.pour} {m.pourQui[o]}</p>
              <div><span className="prix">{euros(grille[o])}</span> <span className="attenue">{t.parMois}</span></div>
              <p className="attenue" style={{ margin: 0 }}>{t.detail[o]}</p>
              <form action={choisir}>
                <input type="hidden" name="offre" value={o} />
                {venu && <input type="hidden" name="projet" value={venu.id} />}
                <details open={offre === o && enPlus > 0}>
                  <summary className="attenue">{m.ajouterDesPlaces}</summary>
                  <label className="attenue" htmlFor={`en-plus-${o}`}>{t.enPlus(euros(grille.enPlus))}</label>
                  <input id={`en-plus-${o}`} type="number" name="en_plus" min={0} max={50} defaultValue={offre === o ? enPlus : 0} style={{ width: '5rem' }} />
                </details>
                <button type="submit">{offre === o ? t.changer : t.choisir}</button>
              </form>
            </li>
          ))}
        </ul>
        {v && v.etat === 'actif' && !v.resilieALaFin && !offert && (
          <form action={resilierALaFin} className="panneau bloc-claude" style={{ marginTop: '1rem' }}><p className="attenue">{v.engageJusquAu ? t.resilierEngage(date(v.engageJusquAu)) : t.resilierExplication}</p><button type="submit" className="discret danger">{t.resilier}</button></form>
        )}
        <p className="attenue">{t.mentions}</p>
      </main>
    </div>
  );
}
