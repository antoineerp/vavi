/** /abonnement — l'offre du compte, ce qu'elle publie, en choisir ou en changer, résilier. */
import Link from 'next/link';
import { laConsole } from '@/app/_partage/la-console';
import { TEXTES } from '@/app/_partage/textes';
import { lesAbonnementsReels, PAGE_DE_L_ABONNEMENT } from '@/app/_partage/les-abonnements-reels';
import { lEtatDuCompte } from '@/lib/abonnements/l-abonnement';
import { CENTIMES_D_UN_PROJET_EN_PLUS, OFFRES, OFFRES_PAYANTES } from '@/lib/abonnements/les-offres';
import { choisir, resilierALaFin } from './gestes';

export const dynamic = 'force-dynamic';

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const q = await searchParams;
  const c = await laConsole(PAGE_DE_L_ABONNEMENT);
  const t = TEXTES[c.langue].abonnement;
  const e = await lEtatDuCompte(lesAbonnementsReels(), c.compte);
  const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(c.langue === 'fr' ? 'fr-FR' : 'en-GB', { dateStyle: 'long' }) : '—');
  const euros = (centimes: number) => `${centimes / 100} €`;
  const v = e.lu ? e.valeur : null;
  const etat = !v ? null : v.etat === 'aucun' ? t.essai
    : v.etat === 'actif' ? (v.resilieALaFin ? t.resilieLe(OFFRES[v.offre].nom[c.langue], date(v.jusquAu)) : t.actif(OFFRES[v.offre].nom[c.langue], v.projets, date(v.jusquAu)))
      : v.etat === 'grace' ? t.grace(date(v.pauseLe)) : t.suspendu;
  return (
    <main className="console">
      <Link href="/projets">{TEXTES[c.langue].retour}</Link>
      <div className="entete"><h1>{t.titre}</h1></div>
      {q.fait === 'abonne' && <div className="carte" role="status">{t.merci}</div>}
      {q.fait === 'resilie' && <div className="carte" role="status">{t.resilie}</div>}
      {q.erreur && <div className="carte" role="alert">{t.erreurs[q.erreur] ?? q.erreur}</div>}
      {!e.lu ? <p role="alert">{TEXTES[c.langue].erreur} {e.pourquoi}</p> : <div className="carte"><p>{etat}</p></div>}
      <ul className="liste carte">
        {OFFRES_PAYANTES.map((o) => (
          <li key={o}>
            <div><strong>{OFFRES[o].nom[c.langue]}</strong> · {euros(OFFRES[o].centimes)} {t.parMois}<div className="attenue">{t.detail[o]}</div></div>
            <form action={choisir} className="ligne">
              <input type="hidden" name="offre" value={o} />
              <label className="attenue">{t.enPlus(euros(CENTIMES_D_UN_PROJET_EN_PLUS))} <input type="number" name="en_plus" min={0} max={50} defaultValue={0} style={{ width: '4rem' }} /></label>
              <button type="submit">{v && v.etat !== 'aucun' && v.offre === o ? t.changer : t.choisir}</button>
            </form>
          </li>
        ))}
      </ul>
      {v && v.etat === 'actif' && !v.resilieALaFin && <form action={resilierALaFin} className="carte"><p className="attenue">{t.resilierExplication}</p><button type="submit" className="discret">{t.resilier}</button></form>}
      <p className="attenue">{t.mentions}</p>
    </main>
  );
}
