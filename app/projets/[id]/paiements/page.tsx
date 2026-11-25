/** /projets/<id>/paiements — une app qui vend encaisse sur le compte Stripe de son propriétaire. */
import { notFound } from 'next/navigation';
import { leManifesteStocke } from '@/lib/projets/l-arbre-d-un-projet';
import { laBoutique } from '@/lib/vente/la-boutique';
import { CLE_DE_VAVI, lEtatDuCompte } from '@/lib/stripe-connect/le-compte';
import { comptesSurSupabase } from '@/lib/stripe-connect/sur-supabase';
import { leProjet } from '../le-projet';

export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { c, t } = await leProjet(id, 'paiements');
  const f = await c.projets.fichiers(c.compte, id);
  const m = f.lu ? leManifesteStocke(f.valeur.get('app.json')) : null;
  if (!m?.lu || laBoutique(m.manifeste) === null) notFound();
  const cleStripe = process.env[CLE_DE_VAVI]?.trim();
  const relie = cleStripe ? await comptesSurSupabase(c.base).lire(id) : null;
  const stripe = relie?.lu && relie.valeur && cleStripe ? await lEtatDuCompte({ appel: (u, i) => fetch(u, i), cle: cleStripe }, relie.valeur) : null;
  return (
    <main className="console">
      <h1>{t.encaisser}</h1>
      <div className="carte">
        <p>{t.encaisserExplication}</p>
        {!cleStripe ? <p className="attenue">{t.stripeNonRelie}</p>
          : !relie?.lu ? <p role="alert">{t.erreur} {relie && !relie.lu ? relie.pourquoi : ''}</p>
          : !relie.valeur ? <><p>{t.stripeOuvrir}</p><a className="bouton" href={`/projets/${id}/stripe`}>{t.stripeOuvrirBouton}</a></>
          : stripe?.lu && stripe.valeur.encaisse ? <p>{t.stripePret}{stripe.valeur.aFournir > 0 ? ` ${t.stripeAFournir(stripe.valeur.aFournir)}` : ''} <a href="https://dashboard.stripe.com/" target="_blank" rel="noreferrer">{t.stripeTableau}</a></p>
          : <><p>{stripe?.lu ? t.stripeEnCours(stripe.valeur.aFournir) : t.stripeIllisible}</p><a className="bouton" href={`/projets/${id}/stripe`}>{t.stripeContinuer}</a></>}
        <p className="attenue">{t.stripeCeQueStripeDemande}</p>
      </div>
    </main>
  );
}
