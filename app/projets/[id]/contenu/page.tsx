/**
 * /projets/<id>/contenu — l'ancien écran « Apparence et titres » : la console n'a plus qu'un écran pour le contenu
 * (26/11, choix d'Antoine « Simplifier puis enrichir »). L'apparence est dans « Gérer le contenu », les titres et
 * descriptions des pages dans « Référencement » ; une adresse gardée y mène, son message compris.
 */
import { redirect } from 'next/navigation';

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params;
  const q = Object.fromEntries(Object.entries(await searchParams).filter((e): e is [string, string] => typeof e[1] === 'string'));
  redirect(`/projets/${encodeURIComponent(id)}/gerer${Object.keys(q).length ? `?${new URLSearchParams(q)}` : ''}`);
}
