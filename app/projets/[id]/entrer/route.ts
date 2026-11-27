/**
 * GET /projets/<id>/entrer?ou=apercu|en_ligne — le propriétaire ouvre son app déjà connecté (Antoine, 27/11 : il restait
 * bloqué sur la porte de sa propre app). Connecté à la console, il est le propriétaire du projet : son compte d'app reçoit
 * un code d'entrée (`unCodeDuProprietaire`), et il part sur l'app avec `#vavi=entrer.<code>`, que l'app échange contre sa
 * session. Le code va dans le fragment : il ne passe jamais par un serveur ni dans un journal.
 */
import { notFound, redirect } from 'next/navigation';
import { laConsole } from '@/app/_partage/la-console';
import { adresseDeLApp } from '@/app/_partage/l-adresse-des-apps';
import { lesComptesReels } from '@/app/_partage/les-comptes-reels';
import { unCodeDuProprietaire } from '@/lib/comptes/les-comptes';
import { schemaDuProjet } from '@/lib/relais/le-schema-d-une-app';
import { leManifesteStocke } from '@/lib/projets/l-arbre-d-un-projet';
import { ID_DE_PROJET } from '../le-projet';

export const dynamic = 'force-dynamic';

export async function GET(requete: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!ID_DE_PROJET.test(id)) notFound();
  const ou = new URL(requete.url).searchParams.get('ou') === 'en_ligne' ? 'en_ligne' : 'apercu';
  const c = await laConsole(`/projets/${id}/entrer?ou=${ou}`);
  const [p, f] = await Promise.all([c.projets.lire(c.compte, id), c.projets.fichiers(c.compte, id)]);
  if (!p.lu || !p.valeur) notFound();
  // Une app sans compte (un site vitrine) n'a pas de porte : on l'ouvre, simplement.
  const m = f.lu ? leManifesteStocke(f.valeur.get('app.json')) : null;
  if (!m?.lu || m.manifeste.roles.length === 0) redirect(adresseDeLApp(id, ou));
  const adresse = adresseDeLApp(id, ou);
  const d = lesComptesReels();
  const app = schemaDuProjet(id);
  // Sans comptes branchés, l'app s'ouvre quand même : la porte dira ce qui manque.
  const code = d && app && c.courriel ? await unCodeDuProprietaire(d, { app, email: c.courriel }).catch(() => null) : null;
  redirect(code?.ok ? `${adresse.split('#')[0]}#vavi=${code.valeur}` : adresse);
}
