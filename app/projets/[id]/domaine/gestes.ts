'use server';
/**
 * Les gestes de la console sur le domaine à soi d'un site : le brancher (le certificat demandé chez Fly), vérifier où il en
 * est (actif dès que Fly a émis le certificat, donc que le DNS pointe vers vavi), le retirer. Le projet est vérifié au compte.
 */
import { redirect } from 'next/navigation';
import { laConsole } from '@/app/_partage/la-console';
import { leDomaineDesApps } from '@/lib/publication/les-adresses-des-apps';
import { adresseDeLaPlateforme } from '@/lib/mcp/l-adresse';
import { laCibleDns, lePlanDns } from '@/lib/domaines/le-domaine';
import { ajouterLeCertificat, flyDeLEnvironnement, lEtatChezFly, retirerLeCertificat } from '@/lib/domaines/les-certificats';
import { demanderLeDomaine, direActif, leDomaineDuProjet, retirerLeDomaine } from '@/lib/domaines/les-domaines';
import { renommerLeSite } from '@/lib/domaines/les-noms';

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const retour = (id: string, q: Record<string, string>): never => redirect(`/projets/${id}/domaine?${new URLSearchParams(q)}`);

async function leProjetDuCompte(id: string) {
  if (!ID.test(id)) redirect('/projets');
  const c = await laConsole(`/projets/${id}/domaine`);
  const p = await c.projets.lire(c.compte, id);
  if (!p.lu || !p.valeur) retour(id, { erreur: 'panne' });
  const fly = flyDeLEnvironnement(process.env);
  if (!fly) retour(id, { erreur: 'fly_absent' });
  return { c, fly: fly! };
}

export async function brancher(id: string, formulaire: FormData) {
  const { c, fly } = await leProjetDuCompte(id);
  const interdits = [new URL(adresseDeLaPlateforme()).hostname.replace(/^www\./, ''), ...(leDomaineDesApps(process.env) ? [leDomaineDesApps(process.env)!] : [])];
  const plan = lePlanDns(String(formulaire.get('domaine') ?? '').slice(0, 300), { cible: laCibleDns(process.env), interdits });
  if (!plan.ok) retour(id, { erreur: 'domaine_mal_forme', pourquoi: plan.pourquoi });
  if (!plan.ok) return;
  const avant = await leDomaineDuProjet(c.base, id);
  const d = await demanderLeDomaine(c.base, id, plan, Date.now());
  if (!d.lu) retour(id, { erreur: 'panne' });
  if (d.lu && d.valeur === 'pris') retour(id, { erreur: 'domaine_pris' });
  const a = await ajouterLeCertificat(fly, plan.hote);
  if (!a.lu) { await retirerLeDomaine(c.base, id); retour(id, { erreur: 'fly', pourquoi: a.pourquoi }); }
  // L'ancien domaine (remplacé) perd son certificat.
  if (avant.lu && avant.valeur && avant.valeur.hote !== plan.hote) await retirerLeCertificat(fly, avant.valeur.hote);
  console.log(`[domaine] ${id.slice(0, 8)} ${plan.hote} demandé`);
  retour(id, { fait: 'demande' });
}

export async function verifier(id: string) {
  const { c, fly } = await leProjetDuCompte(id);
  const d = await leDomaineDuProjet(c.base, id);
  if (!d.lu) return retour(id, { erreur: 'panne' });
  const domaine = d.valeur;
  if (!domaine) return retour(id, {});
  const e = await lEtatChezFly(fly, domaine.hote);
  if (!e.lu) return retour(id, { erreur: 'fly', pourquoi: e.pourquoi });
  if (e.valeur === 'inconnu') { await ajouterLeCertificat(fly, domaine.hote); return retour(id, { etat: 'inconnu' }); }
  if (e.valeur === 'actif' && !domaine.actifLe) {
    const a = await direActif(c.base, id, domaine.hote, Date.now());
    if (a.lu) console.log(`[domaine] ${id.slice(0, 8)} ${domaine.hote} actif`);
  }
  return retour(id, { etat: e.valeur });
}

export async function retirer(id: string) {
  const { c, fly } = await leProjetDuCompte(id);
  const d = await leDomaineDuProjet(c.base, id);
  if (d.lu && d.valeur) await retirerLeCertificat(fly, d.valeur.hote);
  const r = await retirerLeDomaine(c.base, id);
  retour(id, r.lu ? { fait: 'retire' } : { erreur: 'panne' });
}

/** La personne change le nom lisible de son site (`<nom>.<domaine des apps>`, `lib/domaines/les-noms`). */
export async function renommer(id: string, formulaire: FormData) {
  if (!ID.test(id)) redirect('/projets');
  const c = await laConsole(`/projets/${id}/domaine`);
  const p = await c.projets.lire(c.compte, id);
  if (!p.lu || !p.valeur) return retour(id, { erreur: 'panne' });
  const r = await renommerLeSite(c.base, id, String(formulaire.get('nom') ?? '').slice(0, 60));
  if (!r.lu) return retour(id, { erreur: 'panne' });
  return retour(id, r.valeur === 'fait' ? { fait: 'renomme' } : { erreur: `nom_${r.valeur}` });
}
