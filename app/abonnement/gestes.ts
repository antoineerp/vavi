'use server';
/** Les gestes de la page Abonnement : choisir une offre (la page de Stripe s'ouvre), résilier à la fin de la période. */
import { redirect } from 'next/navigation';
import { laConsole } from '@/app/_partage/la-console';
import { choisirUneOffre, resilierLAbonnement } from '@/lib/abonnements/l-abonnement';
import { lesAbonnementsReels, PAGE_DE_L_ABONNEMENT } from '@/app/_partage/les-abonnements-reels';

export async function choisir(formulaire: FormData) {
  const c = await laConsole(PAGE_DE_L_ABONNEMENT);
  const r = await choisirUneOffre(lesAbonnementsReels(), c.compte, formulaire.get('offre'), formulaire.get('en_plus') || 0);
  redirect('url' in r ? r.url : `${PAGE_DE_L_ABONNEMENT}?erreur=${r.refus}`);
}

export async function resilierALaFin() {
  const c = await laConsole(PAGE_DE_L_ABONNEMENT);
  const r = await resilierLAbonnement(lesAbonnementsReels(), c.compte);
  redirect(r.fait ? `${PAGE_DE_L_ABONNEMENT}?fait=resilie` : `${PAGE_DE_L_ABONNEMENT}?erreur=${r.pourquoi}`);
}
