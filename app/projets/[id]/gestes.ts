'use server';
/**
 * Les gestes de la console sur un projet : publier, revenir à un état, poser un secret, réécrire un texte de l'aperçu. Chacun vérifie le compte
 * connecté (Supabase), puis passe par les fonctions de la plateforme, qui vérifient que le projet est à lui. Le résultat
 * revient à la page par son adresse (`?fait=`), jamais une valeur secrète.
 */
import { redirect } from 'next/navigation';
import { laConsole } from '@/app/_partage/la-console';
import { mettreLApercuEnLigne } from '@/lib/projets/la-mise-en-ligne';
import { revenirDepuisLaConsole } from '@/lib/versions/revenir';
import { scellerUnSecret } from '@/lib/mcp/les-jetons';
import { construireLApercu as batir, estUnRefus } from '@/lib/mcp/les-gestes';
import { leContexteReel } from '@/lib/mcp/le-contexte-reel';
import { lesTextesDUnElement, reecrireUnTexte, type Reecriture } from '@/lib/contenus/reecrire';
import { leDroitDePublier } from '@/lib/abonnements/l-abonnement';
import { leManifesteStocke } from '@/lib/projets/l-arbre-d-un-projet';
import { lesAbonnementsReels } from '@/app/_partage/les-abonnements-reels';

const ID = /^[0-9a-f-]{36}$/;
const retour = (id: string, q: Record<string, string>): never => redirect(`/projets/${id}?${new URLSearchParams(q)}`);

export async function publier(id: string) {
  if (!ID.test(id)) redirect('/projets');
  const c = await laConsole(`/projets/${id}`);
  // L'OFFRE, VÉRIFIÉE PAR LE SERVEUR : l'essai n'a que l'aperçu ; une offre payante publie ses natures, dans sa place.
  const f = await c.projets.fichiers(c.compte, id);
  const m = f.lu ? leManifesteStocke(f.valeur.get('app.json')) : null;
  const droit = await leDroitDePublier(lesAbonnementsReels(), c.compte, id, m?.lu ? m.manifeste : null);
  if (!droit.lu) retour(id, { erreur: 'panne' });
  if (droit.lu && !droit.valeur.permis) retour(id, { erreur: droit.valeur.pourquoi });
  const r = await mettreLApercuEnLigne(c.projets, c.compte, id);
  if (r.publie) console.log(`[console] ${id.slice(0, 8)} mis en ligne (${r.empreinte.slice(0, 12)})`);
  retour(id, r.publie ? { fait: 'publie' } : { erreur: r.pourquoi });
}

export async function revenir(id: string, version: number) {
  if (!ID.test(id) || !Number.isInteger(version) || version < 1) redirect('/projets');
  const c = await laConsole(`/projets/${id}`);
  const r = await revenirDepuisLaConsole({ compte: c.compte, projets: c.projets, base: c.base }, id, version);
  if (!r.revenu) retour(id, { erreur: r.pourquoi });
  retour(id, r.revenu && r.apercu === 'a_construire' ? { fait: 'revenu', version: String(r.version), construire: 'oui' } : { fait: 'revenu', version: String(r.revenu ? r.version : 0) });
}

export async function poserUnSecret(id: string, formulaire: FormData) {
  if (!ID.test(id)) redirect('/projets');
  const nom = String(formulaire.get('nom') ?? '').trim();
  const valeur = String(formulaire.get('valeur') ?? '');
  if (!/^[A-Z][A-Z0-9_]{1,63}$/.test(nom) || valeur.length === 0 || valeur.length > 8000) retour(id, { erreur: 'secret_mal_forme' });
  const c = await laConsole(`/projets/${id}`);
  const r = await c.projets.poserUnSecret(c.compte, id, nom, scellerUnSecret(id, nom, valeur));
  retour(id, r.lu ? { fait: 'secret', nom } : { erreur: 'panne' });
}

/** Les passages d'un élément cliqué dans l'aperçu (`data-texte`), lus dans le fichier d'aujourd'hui. */
export async function lesTextes(id: string, situation: string): Promise<{ lu: true; passages: string[] } | { lu: false; pourquoi: string }> {
  if (!ID.test(id) || situation.length > 2000) return { lu: false, pourquoi: 'designation_illisible' };
  const c = await laConsole(`/projets/${id}`);
  const r = await lesTextesDUnElement(c, id, situation);
  return r.lu ? { lu: true, passages: r.passages.map((p) => p.texte) } : r;
}

/** Réécrit les passages, puis rebâtit l'aperçu sans modèle et le désigne s'il est vert. */
export async function reecrire(id: string, situation: string, apres: string[]): Promise<Reecriture> {
  if (!ID.test(id) || situation.length > 2000 || !Array.isArray(apres) || apres.length > 50 || apres.some((x) => typeof x !== 'string')) return { reecrit: false, pourquoi: 'designation_illisible' };
  const c = await laConsole(`/projets/${id}`);
  const r = await reecrireUnTexte({ compte: c.compte, projets: c.projets, construire: async (projet) => {
    const ctx = await leContexteReel(c.compte);
    const b = await batir(ctx.outils, { project: projet });
    if (estUnRefus(b)) return { vert: false, detail: b.code };
    const designe = await c.projets.publierLApercu(c.compte, projet, String(b.fingerprint));
    return designe.lu ? { vert: true } : { vert: false, detail: designe.pourquoi };
  } }, id, situation, apres);
  if (r.reecrit) console.log(`[console] ${id.slice(0, 8)} texte réécrit (version ${r.version}, aperçu ${r.apercu})`);
  return r;
}
