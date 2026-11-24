/** /connexion — entrer dans la console vavi ; puis aller à la page demandée (`?suite=`, une adresse de la console). */
import { laLangue } from '@/app/_partage/la-langue';
import { AllerALaSuite } from './aller-a-la-suite';

export default async function Page({ searchParams }: { searchParams: Promise<{ suite?: string }> }) {
  const langue = await laLangue();
  const { suite } = await searchParams;
  const sure = suite && /^\/projets(\/[0-9a-f-]{36})?$/.test(suite) ? suite : '/projets';
  return (
    <main className="console etroite">
      <h1>{langue === 'fr' ? 'Se connecter à vavi' : 'Sign in to vavi'}</h1>
      <AllerALaSuite langue={langue} suite={sure} />
    </main>
  );
}
