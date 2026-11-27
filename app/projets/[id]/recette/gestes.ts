'use server';
/** « Rejouer la recette » (Antoine, 27/11 : « automatique + bouton ») : le passage part en arrière-plan, la page le suit. */
import { redirect } from 'next/navigation';
import { laConsole } from '@/app/_partage/la-console';
import { leContexteReel } from '@/lib/mcp/le-contexte-reel';
import { jouerLaRecette } from '@/lib/mcp/la-recette';
import { ID_DE_PROJET } from '../le-projet';

export async function rejouerLaRecette(id: string) {
  if (!ID_DE_PROJET.test(id)) redirect('/projets');
  const c = await laConsole(`/projets/${id}/recette`);
  const p = await c.projets.lire(c.compte, id);
  if (!p.lu || !p.valeur) redirect(`/projets/${id}/recette?erreur=panne`);
  const ctx = await leContexteReel(c.compte);
  void jouerLaRecette(ctx.outils, id, 'bouton').catch((e: unknown) => console.error(`[recette] ${id.slice(0, 8)} : ${(e as Error)?.message ?? e}`));
  // Le passage pose « en cours » dès qu'il commence : on laisse une seconde pour que la page le lise.
  await new Promise((r) => setTimeout(r, 1500));
  redirect(`/projets/${id}/recette?fait=lancee`);
}
