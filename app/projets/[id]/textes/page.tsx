/** /projets/<id>/textes — l'ancien écran des textes : ils se réécrivent dans « Gérer le contenu », le seul écran du contenu (26/11). */
import { redirect } from 'next/navigation';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  redirect(`/projets/${encodeURIComponent((await params).id)}/gerer`);
}
