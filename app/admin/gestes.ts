'use server';
/** Les gestes de la page d'administration : chacun revérifie l'administrateur, puis revient à la page avec ce qui est fait ou refusé. */
import { redirect } from 'next/navigation';
import { lAdministrateur, PAGE_DE_L_ADMINISTRATION } from '@/app/_partage/l-administration-reelle';
import { changerLesPrix, creerUneReduction, offrir, retirerLOffert, retirerUneReduction, type Fait } from '@/lib/administration/les-gestes';

const revenir = (r: Fait): never => redirect(`${PAGE_DE_L_ADMINISTRATION}?${r.fait ? 'fait' : 'refus'}=${encodeURIComponent(r.fait ? r.dit : r.pourquoi)}`);
const champ = (f: FormData, n: string) => { const v = f.get(n); return typeof v === 'string' ? v : undefined; };

export async function offrirUnAbonnement(f: FormData) {
  const { d } = await lAdministrateur();
  revenir(await offrir(d, { compte: champ(f, 'compte'), offre: champ(f, 'offre'), enPlus: champ(f, 'en_plus'), mois: champ(f, 'mois'), motif: champ(f, 'motif') }));
}
export async function retirerUnOffert(f: FormData) {
  const { d } = await lAdministrateur();
  revenir(await retirerLOffert(d, champ(f, 'compte')));
}
export async function changerLaGrille(f: FormData) {
  const { d } = await lAdministrateur();
  revenir(await changerLesPrix(d, { site: champ(f, 'site'), boutique: champ(f, 'boutique'), pro: champ(f, 'pro'), enPlus: champ(f, 'enPlus') }));
}
export async function reduire(f: FormData) {
  const { d } = await lAdministrateur();
  revenir(await creerUneReduction(d, { compte: champ(f, 'compte'), pourcent: champ(f, 'pourcent'), mois: champ(f, 'mois'), jours: champ(f, 'jours') }));
}
export async function retirerLaReduction(f: FormData) {
  const { d } = await lAdministrateur();
  revenir(await retirerUneReduction(d, champ(f, 'reduction')));
}
