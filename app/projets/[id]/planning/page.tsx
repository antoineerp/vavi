/**
 * /projets/<id>/planning — le planning de l'app, au menu de la console (Antoine, 28/11 : « je n'ai vu aucun planning à
 * gérer »). Il mène au planning de la première table qui occupe des périodes, dans « Données » : une rangée par
 * ressource (la chambre, la salle), une case par jour ; une case libre s'ouvre sur une ligne déjà datée.
 *
 * Ce qu'il remplace : rien ; le planning n'était qu'un lien dans « Données ».
 */
import { notFound, redirect } from 'next/navigation';
import { leProjet } from '../le-projet';
import { leManifesteStocke } from '@/lib/projets/l-arbre-d-un-projet';

export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { c } = await leProjet(id, 'planning');
  const f = await c.projets.fichiers(c.compte, id);
  const m = f.lu ? leManifesteStocke(f.valeur.get('app.json')) : null;
  const t = m?.lu ? m.manifeste.tables.find((x) => x.periode) : undefined;
  if (!t) notFound();
  redirect(`/projets/${id}/donnees?${new URLSearchParams({ table: t.nom, vue: 'planning' })}`);
}
