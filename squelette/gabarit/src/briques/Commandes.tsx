/**
 * Les commandes d'une app qui vend, telles que la base les ouvre à ce compte : un client lit les siennes, qui gère la
 * boutique les lit toutes et les fait avancer (expédier avec le suivi, livrer, annuler). Le geste passe par la
 * plateforme, qui le fait faire par la base comme ce compte puis l'écrit à l'acheteur. Une commande passée sans compte
 * revient au compte qui confirme le même courriel.
 */
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { estSansRetour, libelleDEtat, APP } from '../lib/app';
import { clientDesLectures } from '../lib/donnees';
import { langueCourante } from '../lib/langue';
import { libellesPour } from '../lib/libelles';
import { enDevise } from '../lib/panier';
import { appelerLaPlateforme, projetServi } from '../lib/plateforme';
import { appelerAuRelais, lireAuRelais } from '../lib/relais';
import { Patience, Panne } from './etats';
import { Button } from '../ui/button';

const TABLE = 'commande';

interface LigneDeCommande {
  readonly id: string; readonly created_at: string; readonly etat: string;
  readonly vente_lignes: ReadonlyArray<{ readonly libelle: string; readonly quantite: number }> | null;
  readonly vente_montant_centimes: number | null; readonly vente_devise: string | null;
  readonly vente_nom: string | null; readonly vente_courriel: string | null;
  readonly vente_adresse: Readonly<Record<string, string>> | null; readonly vente_mode: string | null;
  readonly vente_facture: { readonly numero: string } | null; readonly vente_jeton: string | null;
}

export function Commandes() {
  const L = libellesPour(langueCourante());
  const lues = useQuery({
    queryKey: ['base', TABLE],
    queryFn: async () => {
      const r = await lireAuRelais(TABLE, {}, 'created_at', true, 200);
      if (r.erreur) throw new Error(`${r.erreur.message} ${r.erreur.geste}`);
      return (r.donnee?.lignes ?? []) as readonly LigneDeCommande[];
    },
  });
  useEffect(() => {
    void appelerLaPlateforme('pay/<projet>/rattacher', {}).then((r) => {
      if (r.forme === 'donnee') void clientDesLectures.invalidateQueries({ queryKey: ['base'] });
    });
  }, []);
  if (!APP.fonctions.panier) return null;
  if (lues.isPending) return <Patience quoi={L.mesCommandes} />;
  if (lues.isError) return <Panne quoi={L.commandesIllisibles} detail={lues.error.message} />;
  if (lues.data.length === 0) return <p className="py-8 text-center text-sur-fond-attenue">{L.aucuneCommande}</p>;
  return (
    <ul data-commandes className="space-y-4">
      {lues.data.map((c) => <UneCommande key={c.id} c={c} />)}
    </ul>
  );
}

function UneCommande({ c }: { readonly c: LigneDeCommande }) {
  const L = libellesPour(langueCourante());
  const langue = langueCourante();
  const a = c.vente_adresse ?? {};
  const adresse = [a.line1, a.line2, [a.postal_code, a.city].filter(Boolean).join(' '), a.country].filter(Boolean).join(', ');
  const base = typeof window === 'undefined' ? '' : window.__CONSTRUCTOR_API_URL__ ?? '';
  return (
    <li className="space-y-3 rounded-lg border border-bordure bg-surface p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-medium">{new Date(c.created_at).toLocaleDateString(langue)}</span>
        <span data-etat-de-la-commande={c.etat}>{libelleDEtat(TABLE, c.etat)}</span>
      </div>
      <ul className="text-sm">
        {(c.vente_lignes ?? []).map((l, i) => <li key={i}>{l.libelle} × {l.quantite}</li>)}
      </ul>
      {typeof c.vente_montant_centimes === 'number' && c.vente_devise
        ? <p className="tabular-nums">{L.total} : {enDevise(c.vente_montant_centimes, c.vente_devise, langue)}</p> : null}
      {c.vente_nom || c.vente_courriel ? <p className="text-sm text-sur-fond-attenue">{[c.vente_nom, c.vente_courriel].filter(Boolean).join(' · ')}</p> : null}
      {c.vente_mode === 'retrait' ? <p className="text-sm">{L.retraitSurPlace}</p> : adresse ? <p className="text-sm">{L.livreeA} {adresse}</p> : null}
      {c.vente_facture && c.vente_jeton ? (
        <a className="text-sm underline underline-offset-4" target="_blank" rel="noreferrer"
          href={`${base}/api/pay/${encodeURIComponent(projetServi())}/facture?commande=${encodeURIComponent(c.id)}&jeton=${encodeURIComponent(c.vente_jeton)}`}>
          {L.facture} {c.vente_facture.numero}
        </a>
      ) : null}
      <GestesDeLaCommande id={c.id} />
    </li>
  );
}

function GestesDeLaCommande({ id }: { readonly id: string }) {
  const L = libellesPour(langueCourante());
  const possibles = useQuery({
    queryKey: ['base', TABLE, 'possibles', id],
    queryFn: async () => {
      const r = await appelerAuRelais<string[]>(`${TABLE}_transitions_possibles`, { p_id: id });
      return r.erreur || !Array.isArray(r.donnee) ? [] : r.donnee;
    },
  });
  const [geste, setGeste] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [etat, setEtat] = useState<{ readonly enCours: boolean; readonly refus: string | null }>({ enCours: false, refus: null });
  const libelle = (x: string): string => APP.tables.find((t) => t.nom === TABLE)?.cycle?.transitions.find((t) => t.nom === x)?.libelle ?? x;
  if (!possibles.data || possibles.data.length === 0) return null;
  const faire = async (x: string) => {
    setEtat({ enCours: true, refus: null });
    const r = await appelerLaPlateforme('pay/<projet>/commande', { id, geste: x, ...(note.trim() ? { note: note.trim() } : {}) });
    if (r.forme === 'refus') { setEtat({ enCours: false, refus: `${L.changementRefuse} ${r.raison}` }); return; }
    setEtat({ enCours: false, refus: null }); setGeste(null); setNote('');
    void clientDesLectures.invalidateQueries({ queryKey: ['base'] });
  };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {possibles.data.map((x) => (
          <Button key={x} type="button" variant={estSansRetour(TABLE, x) ? 'outline' : 'default'} disabled={etat.enCours || geste !== null}
            onClick={() => setGeste(x)}>{libelle(x)}</Button>
        ))}
      </div>
      {geste ? (
        <div role="alertdialog" aria-label={libelle(geste)} className="space-y-3 rounded-lg border border-bordure bg-fond p-4">
          <p className="font-medium">{libelle(geste)}</p>
          {estSansRetour(TABLE, geste) ? <p className="text-sm text-sur-fond-attenue">{L.gesteSansRetour}</p> : null}
          <label className="block space-y-1 text-sm">
            <span>{L.noteDeLaCommande}</span>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={500} className="w-full rounded-lg border border-bordure bg-fond p-2" />
          </label>
          <div className="flex gap-2">
            <Button type="button" disabled={etat.enCours} onClick={() => void faire(geste)}>{L.confirmer}</Button>
            <Button type="button" variant="ghost" disabled={etat.enCours} onClick={() => { setGeste(null); setNote(''); }}>{L.annuler}</Button>
          </div>
        </div>
      ) : null}
      {etat.refus ? <p role="alert" className="text-sm">{etat.refus}</p> : null}
    </div>
  );
}

