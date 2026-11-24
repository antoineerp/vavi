/**
 * Un formulaire de visiteur (contact, demande, réservation) : envoyé à la boîte de réception du projet, que la
 * plateforme tient. Elle juge l'envoi (un robot n'écrit rien), le transmet au propriétaire et répond. La publication lit
 * chaque `formKey` écrite en toutes lettres à l'appel pour régler sa boîte. Le succès ne vient que de la réponse. La page
 * d'où il part (`page`) relie la demande à la visite, au tableau de bord du propriétaire.
 */
import { useState } from 'react';
import { appelerLaPlateforme, projetServi } from './plateforme';
import { pageCourante } from './mesure';
import type { Resultat } from './resultat';

export async function envoyerLeFormulaire(opts: { formKey: string; donnees: Record<string, unknown> }): Promise<Resultat<true>> {
  const projectId = projetServi();
  const r = await appelerLaPlateforme<unknown>('forms/submit', { ...(projectId ? { projectId } : {}), formKey: opts.formKey, data: opts.donnees, page: pageCourante() });
  return r.forme === 'donnee' ? { forme: 'donnee', donnee: true } : r;
}

/** L'état d'un envoi, pour un formulaire : `envoyer` rend le résultat, `etat` dit où il en est. */
export function useEnvoiDuFormulaire() {
  const [etat, setEtat] = useState<{ readonly forme: 'pret' | 'envoi' | 'envoye' } | { readonly forme: 'refus'; readonly raison: string; readonly geste: string }>({ forme: 'pret' });
  const envoyer = async (opts: { formKey: string; donnees: Record<string, unknown> }): Promise<Resultat<true>> => {
    setEtat({ forme: 'envoi' });
    const r = await envoyerLeFormulaire(opts);
    setEtat(r.forme === 'donnee' ? { forme: 'envoye' } : r);
    return r;
  };
  return { etat, envoyer };
}
