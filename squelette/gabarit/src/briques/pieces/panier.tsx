/**
 * La page du panier, servie par le cadre d'une app qui vend : chaque ligne au prix que la plateforme lit en base, la
 * livraison selon le pays choisi, le total qui sera payé, les coordonnées de qui achète (avec ou sans compte), puis le
 * paiement, ouvert par la plateforme. Au retour d'un paiement accepté, le panier se vide et le dit.
 */
import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { APP } from '../../lib/app';
import { langueCourante } from '../../lib/langue';
import { libellesPour } from '../../lib/libelles';
import { useSession } from '../../lib/session';
import { chiffrer, enDevise, panier, payer, usePanier, type Acheteur, type PanierChiffre } from '../../lib/panier';
import type { Resultat } from '../../lib/resultat';
import { Patience } from '../etats';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';

export const offerte = APP.fonctions.panier;

export default function Panier() {
  const L = libellesPour(langueCourante());
  const langue = langueCourante();
  const lignes = usePanier();
  const { compte } = useSession();
  const paye = new URLSearchParams(window.location.search).get('payment') === 'success';
  const [pays, setPays] = useState<string>(APP.vente?.livraison.pays[0] ?? '');
  const [retrait, setRetrait] = useState(false);
  const [chiffre, setChiffre] = useState<Resultat<PanierChiffre> | null>(null);
  const [envoi, setEnvoi] = useState<{ readonly enCours: boolean; readonly refus: string | null }>({ enCours: false, refus: null });
  const [cgv, setCgv] = useState(false);
  const [code, setCode] = useState('');
  const [retire, setRetire] = useState(false);

  useEffect(() => { if (paye) panier.vider(); }, [paye]);
  useEffect(() => {
    if (lignes.length === 0) { setChiffre(null); return; }
    let actuel = true;
    void chiffrer(lignes, { pays: pays || null, retrait }, code).then((r) => {
      if (!actuel) return;
      // Un article qui n'existe plus en base sort du panier, et c'est dit : le reste se paie.
      const retirees = r.forme === 'donnee' ? r.donnee.retirees ?? [] : [];
      if (retirees.length > 0) { setRetire(true); for (const l of retirees) panier.retirer(l.table, l.id, l.option); return; }
      setChiffre(r);
    });
    return () => { actuel = false; };
  }, [lignes, pays, retrait, code]);

  if (paye) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 px-4 py-12">
        <h1 className="font-titre text-3xl">{L.votreCommande}</h1>
        <p role="status">{L.paiementConfirme}</p>
        <Link to="/" className="font-medium underline underline-offset-4">{L.continuerMesAchats}</Link>
      </div>
    );
  }
  if (lignes.length === 0) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 px-4 py-12">
        <h1 className="font-titre text-3xl">{L.panier}</h1>
        {retire ? <p role="status">{L.articleRetire}</p> : null}
        <p className="text-sur-fond-attenue">{L.panierVide}</p>
        <Link to="/" className="font-medium underline underline-offset-4">{L.continuerMesAchats}</Link>
      </div>
    );
  }

  const envoyer = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (chiffre?.forme !== 'donnee') return;
    const f = new FormData(e.currentTarget);
    const lu = (k: string): string => String(f.get(k) ?? '').trim();
    const expedie = chiffre.donnee.livraison.adresse && !retrait;
    const acheteur: Acheteur = {
      nom: lu('nom'), courriel: lu('courriel'), ...(lu('telephone') ? { telephone: lu('telephone') } : {}), ...(lu('societe') ? { societe: lu('societe') } : {}), ...(lu('siren') ? { siren: lu('siren') } : {}), ...(lu('tva') ? { tva: lu('tva') } : {}), ...(retrait ? { retrait: true } : {}),
      ...(expedie ? { adresse: { line1: lu('line1'), ...(lu('line2') ? { line2: lu('line2') } : {}), postal_code: lu('postal_code'), city: lu('city'), country: pays } } : {}),
    };
    setEnvoi({ enCours: true, refus: null });
    const r = await payer(lignes, acheteur, `${window.location.origin}${window.location.pathname}`, code);
    if (r.forme === 'refus') { setEnvoi({ enCours: false, refus: `${r.raison} ${r.geste}` }); return; }
    window.location.assign(r.donnee.url);
  };

  return (
    <div className="mx-auto grid max-w-5xl gap-10 px-4 py-12 lg:grid-cols-[1fr_22rem]">
      <section className="space-y-6">
        <h1 className="font-titre text-3xl">{L.panier}</h1>
        {retire ? <p role="status" className="text-sm text-sur-fond-attenue">{L.articleRetire}</p> : null}
        {chiffre === null ? <Patience quoi={L.panier} /> : chiffre.forme === 'refus' ? <p role="alert">{chiffre.raison} {chiffre.geste}</p> : (
          <ul className="divide-y divide-bordure border-y border-bordure">
            {chiffre.donnee.lignes.map((l) => (
              <li key={`${l.table}/${l.id}/${l.option ?? ''}`} className="flex flex-wrap items-center justify-between gap-4 py-4">
                <span className="font-medium">{l.libelle}</span>
                <span className="flex items-center gap-3">
                  <label className="flex items-center gap-2 text-sm">
                    <span>{L.quantite}</span>
                    <Input type="number" min={1} max={99} value={l.quantite} className="h-10 w-20"
                      onChange={(e) => panier.changer(l.table, l.id, Math.max(1, Number(e.target.value) || 1), l.option)} />
                  </label>
                  <span className="tabular-nums">{enDevise(l.centimes * l.quantite, chiffre.donnee.devise, langue)}</span>
                  <button type="button" onClick={() => panier.retirer(l.table, l.id, l.option)} className="text-sm underline underline-offset-4">{L.retirer}</button>
                </span>
              </li>
            ))}
          </ul>
        )}
        <form onSubmit={(e) => void envoyer(e)} className="space-y-4">
          <h2 className="font-titre text-xl">{L.vosCoordonnees}</h2>
          <label className="block space-y-1 text-sm"><span>{L.nomComplet}</span><Input name="nom" required minLength={2} maxLength={120} autoComplete="name" /></label>
          <label className="block space-y-1 text-sm"><span>{L.courriel}</span><Input name="courriel" type="email" required defaultValue={compte?.email ?? ''} autoComplete="email" /></label>
          <label className="block space-y-1 text-sm"><span>{L.telephone} ({L.facultatif})</span><Input name="telephone" type="tel" maxLength={30} autoComplete="tel" /></label>
          <details className="text-sm">
            <summary className="cursor-pointer">{L.pourUneEntreprise} ({L.facultatif})</summary>
            <div className="mt-3 space-y-3">
              <label className="block space-y-1"><span>{L.raisonSociale}</span><Input name="societe" maxLength={200} autoComplete="organization" /></label>
              <label className="block space-y-1"><span>{L.siren}</span><Input name="siren" inputMode="numeric" maxLength={20} /></label>
              <label className="block space-y-1"><span>{L.tvaIntracom}</span><Input name="tva" maxLength={20} /></label>
            </div>
          </details>
          {chiffre?.forme === 'donnee' && chiffre.donnee.livraison.adresse ? (
            <fieldset className="space-y-4">
              {chiffre.donnee.livraison.retrait ? (
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={retrait} onChange={(e) => setRetrait(e.target.checked)} />
                  <span>{L.retraitSurPlace} — {chiffre.donnee.livraison.retrait}</span>
                </label>
              ) : null}
              {retrait ? null : (
                <>
                  <legend className="font-medium">{L.adresseDeLivraison}</legend>
                  <label className="block space-y-1 text-sm"><span>{L.adresse}</span><Input name="line1" required maxLength={200} autoComplete="address-line1" /></label>
                  <label className="block space-y-1 text-sm"><span>{L.adresseLigne2} ({L.facultatif})</span><Input name="line2" maxLength={200} autoComplete="address-line2" /></label>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block space-y-1 text-sm"><span>{L.codePostal}</span><Input name="postal_code" required maxLength={20} autoComplete="postal-code" /></label>
                    <label className="block space-y-1 text-sm"><span>{L.ville}</span><Input name="city" required maxLength={120} autoComplete="address-level2" /></label>
                  </div>
                  <label className="block space-y-1 text-sm">
                    <span>{L.pays}</span>
                    <select value={pays} onChange={(e) => setPays(e.target.value)} className="h-12 w-full rounded-xl border border-input bg-card px-4">
                      {chiffre.donnee.livraison.pays.map((p) => <option key={p} value={p}>{nomDuPays(p, langue)}</option>)}
                    </select>
                  </label>
                </>
              )}
            </fieldset>
          ) : null}
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" required checked={cgv} onChange={(e) => setCgv(e.target.checked)} className="mt-1" />
            <span>{L.accepterLesCgv} <Link to="/conditions-de-vente" className="underline underline-offset-4">{L.lesCgv}</Link></span>
          </label>
          {envoi.refus ? <p role="alert" className="text-sm">{envoi.refus}</p> : null}
          <Button type="submit" disabled={envoi.enCours || chiffre?.forme !== 'donnee' || !cgv || Boolean(!retrait && chiffre.donnee.livraison.impossible)}>{L.allerAuPaiement}</Button>
          <p className="text-sm text-sur-fond-attenue">{L.paiementSecurise}</p>
        </form>
      </section>
      {chiffre?.forme === 'donnee' ? (
        <aside aria-label={L.recapitulatif} className="h-fit space-y-3 rounded-lg border border-bordure bg-surface p-5">
          <h2 className="font-titre text-xl">{L.recapitulatif}</h2>
          <dl className="space-y-2">
            {chiffre.donnee.recapitulatif.map((r) => (
              <div key={r.libelle} className={`flex justify-between gap-4 ${r.total ? 'border-t border-bordure pt-2 font-semibold' : 'text-sm'}`}>
                <dt>{r.libelle}</dt>
                <dd className="tabular-nums">{r.texte ?? (typeof r.centimes === 'number' ? enDevise(r.centimes, chiffre.donnee.devise, langue) : '—')}</dd>
              </div>
            ))}
          </dl>
          {APP.vente?.remise ? (
            <form className="flex gap-2 border-t border-bordure pt-3"
              onSubmit={(e) => { e.preventDefault(); setCode(String(new FormData(e.currentTarget).get('code') ?? '').trim()); }}>
              <Input name="code" aria-label={L.codePromo} placeholder={L.codePromo} defaultValue={code} maxLength={60} className="h-10" />
              <Button type="submit" variant="outline" className="h-10">{L.appliquer}</Button>
            </form>
          ) : null}
        </aside>
      ) : null}
    </div>
  );
}

/** Le nom d'un pays dans la langue de l'app ; son code quand le navigateur ne le connaît pas. */
function nomDuPays(code: string, langue: string): string {
  try { return new Intl.DisplayNames([langue], { type: 'region' }).of(code) ?? code; } catch { return code; }
}
