/**
 * L'achat d'un rôle obtenu par paiement : son prix et sa durée, lus dans app.json, et le geste qui ouvre le paiement de
 * la plateforme. La plateforme encaisse au prix d'app.json, jamais à celui du navigateur, et seule sa confirmation signée
 * donne le rôle ; au retour, l'écran relit les rôles jusqu'à ce qu'il arrive. Sans prix fixé, rien ne se vend, et c'est dit.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import type { RolePaye } from '../donnees/types';
import { APP } from '../lib/app';
import { langueCourante } from '../lib/langue';
import { libellesPour } from '../lib/libelles';
import { enDevise } from '../lib/panier';
import { appelerLaPlateforme } from '../lib/plateforme';
import { PORTE, useSession } from '../lib/session';
import { Button } from '../ui/button';

export function AccesPaye({ role }: { readonly role: RolePaye }) {
  const langue = langueCourante();
  const L = libellesPour(langue);
  const { compte, roles, relireLesRoles } = useSession();
  const [etat, setEtat] = useState<{ readonly enCours: boolean; readonly refus: string | null }>({ enCours: false, refus: null });
  const r = APP.roles.find((x) => x.nom === role);
  const revenu = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('payment') === 'success';
  const porte = roles.includes(role);
  useEffect(() => {
    if (!revenu || porte) return undefined;
    let n = 0;
    const t = window.setInterval(() => { n += 1; void relireLesRoles(); if (n >= 20) window.clearInterval(t); }, 3000);
    return () => window.clearInterval(t);
  }, [revenu, porte, relireLesRoles]);
  if (!r) return null;
  if (porte) return <p role="status" className="text-sm">{L.accesVousLAvez.replace('{role}', r.libelle)}</p>;
  if (revenu) return <p role="status" className="text-sm">{L.accesOuvreBientot}</p>;
  const prix = r.offre?.prix ?? null;
  if (prix === null) return <p className="text-sm">{L.accesPrixAFixer}</p>;
  if (!compte) return <p className="text-sm"><Link to={PORTE} className="underline">{L.accesConnectezVous}</Link></p>;
  const devise = r.offre?.devise ?? APP.vente?.devise ?? 'EUR';
  const duree = r.offre?.duree ?? null;

  const acheter = async () => {
    setEtat({ enCours: true, refus: null });
    const ici = window.location.href;
    const x = await appelerLaPlateforme<{ readonly url: string | null }>('pay/<projet>/acces', { role, successUrl: ici, cancelUrl: ici });
    if (x.forme === 'refus') { setEtat({ enCours: false, refus: `${x.raison} ${x.geste}` }); return; }
    if (x.donnee.url) window.location.assign(x.donnee.url);
    else setEtat({ enCours: false, refus: null });
  };

  return (
    <div data-acces-paye={role} className="space-y-2">
      <p className="text-lg font-medium">{enDevise(Math.round(prix * 100), devise, langue)}
        <span className="text-sm font-normal"> · {duree === null ? L.accesSansFin : L.accesPourJours.replace('{n}', String(duree))}</span></p>
      <Button type="button" disabled={etat.enCours} onClick={() => void acheter()}>{etat.enCours ? L.unInstant : L.acheterLAcces}</Button>
      {etat.refus ? <p role="alert" className="text-sm">{etat.refus}</p> : null}
    </div>
  );
}
