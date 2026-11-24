/**
 * /compte/effacer?jeton=… — la page du lien reçu par courriel : elle nomme l'app, puis efface au clic, jamais à
 * l'ouverture (un lecteur de courriel qui suit les liens n'efface rien).
 */
import { redirect } from 'next/navigation';
import { confirmerLEffacement, lireLaDemande } from '@/lib/conformite/l-effacement';
import { lEffacementReel } from '@/app/_partage/la-conformite-reelle';
import { TEXTES } from '@/app/_partage/textes';
import { laLangue } from '@/app/_partage/la-langue';

export const dynamic = 'force-dynamic';

async function effacer(jeton: string) {
  'use server';
  const r = await confirmerLEffacement(lEffacementReel(), jeton);
  redirect(`/compte/effacer?${r.fait ? `fait=${r.effacement.gardees > 0 ? 'garde' : 'oui'}` : `erreur=${r.pourquoi}`}`);
}

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const q = await searchParams;
  const t = TEXTES[await laLangue()];
  if (q.fait) return <main className="console"><h1>{t.effacementTitre}</h1><p role="status">{t.effacementFait}{q.fait === 'garde' ? ` ${t.effacementGarde}` : ''}</p></main>;
  if (q.erreur) return <main className="console"><h1>{t.effacementTitre}</h1><p role="alert">{q.erreur === 'lien_invalide' ? t.effacementLienInvalide : t.effacementPanne}</p></main>;
  const jeton = q.jeton ?? '';
  const d = await lireLaDemande(lEffacementReel(), jeton);
  if (!d.lu) return <main className="console"><h1>{t.effacementTitre}</h1><p role="alert">{t.effacementPanne}</p></main>;
  if (!d.valeur) return <main className="console"><h1>{t.effacementTitre}</h1><p role="alert">{t.effacementLienInvalide}</p></main>;
  return (
    <main className="console">
      <h1>{t.effacementTitre}</h1>
      <div className="carte">
        <p>{t.effacementQuestion(d.valeur.nom)}</p>
        <form action={effacer.bind(null, jeton)}><button type="submit">{t.effacementBouton}</button></form>
      </div>
    </main>
  );
}
