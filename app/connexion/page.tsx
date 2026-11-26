/**
 * /connexion — entrer dans la console vavi, ou y créer son compte : le premier lien reçu crée le compte (Supabase, sans
 * mot de passe), et tout ce qui suit s'y rattache (projets, abonnement, factures, Claude). Puis aller à la page demandée
 * (`?suite=`, une adresse de la console). Dit depuis le 25/11 (Antoine : « il faut la création de compte »).
 */
import Link from 'next/link';
import { laLangue } from '@/app/_partage/la-langue';
import { LogoVavi } from '@/app/_partage/le-logo';
import { AllerALaSuite } from './aller-a-la-suite';

const MOTS = {
  fr: { titre: 'Se connecter ou créer son compte', intro: 'Donnez votre adresse e-mail : vavi vous envoie un lien. Sans compte, ce lien le crée ; avec un compte, il vous connecte. Aucun mot de passe.',
    rattache: 'Vos projets, votre abonnement, vos factures et l’accès de Claude sont rattachés à cette adresse.', nouveau: 'Nouveau sur vavi ?', guide: 'Voir comment brancher Claude' },
  en: { titre: 'Sign in or create your account', intro: 'Enter your e-mail: vavi sends you a link. Without an account, the link creates it; with one, it signs you in. No password.',
    rattache: 'Your projects, subscription, invoices and Claude’s access are tied to this address.', nouveau: 'New to vavi?', guide: 'See how to connect Claude' },
} as const;

export default async function Page({ searchParams }: { searchParams: Promise<{ suite?: string }> }) {
  const langue = await laLangue();
  const m = MOTS[langue];
  const { suite } = await searchParams;
  const sure = suite && /^\/(projets(\/[0-9a-f-]{36}(\/[a-z-]+)?)?|abonnement|commencer|admin)$/.test(suite) ? suite : '/projets';
  return (
    <div className="accueil-console">
      <header className="barre"><Link href="/" className="marque" aria-label="vavi"><LogoVavi /> vavi</Link></header>
      <main className="console etroite">
        <h1>{m.titre}</h1>
        <p>{m.intro}</p>
        <AllerALaSuite langue={langue} suite={sure} />
        <p className="attenue">{m.rattache}</p>
        <p className="attenue">{m.nouveau} <Link href="/commencer">{m.guide}</Link></p>
      </main>
    </div>
  );
}
