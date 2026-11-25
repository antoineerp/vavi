/** /commencer — brancher vavi dans Claude.ai : un bouton qui ouvre l'ajout du connecteur déjà rempli, puis le premier
 * message à coller. L'adresse à copier reste l'issue de secours. Publique : on la lit avant d'avoir un compte. */
import Link from 'next/link';
import { TEXTES } from '@/app/_partage/textes';
import { laLangue } from '@/app/_partage/la-langue';
import { adresseMcp, lienDInstallation } from '@/lib/mcp/l-adresse';
import { Copier } from './copier';
import { BarreDuCompte } from '@/app/_partage/la-barre-du-compte';
import { LogoVavi } from '@/app/_partage/le-logo';
import { compteConnecte } from '@/lib/supabase/serveur';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const langue = await laLangue();
  const t = TEXTES[langue].commencer;
  const adresse = adresseMcp();
  // Publique : connecté, la barre du compte ; sinon le logo et le lien pour se connecter ou créer son compte.
  const c = await compteConnecte().catch(() => ({ connecte: false as const }));
  return (
    <div className="accueil-console">
    {c.connecte ? <BarreDuCompte langue={langue} courriel={c.utilisateur.email ?? ''} ici="commencer" /> : (
      <header className="barre"><Link href="/" className="marque" aria-label="vavi"><LogoVavi /> vavi</Link>
        <nav className="barre-droite"><Link href="/connexion">{langue === 'fr' ? 'Se connecter ou créer son compte' : 'Sign in or create your account'}</Link></nav></header>
    )}
    <main className="console" style={{ maxWidth: 720 }}>
      <h1>{t.titre}</h1>
      <p>{t.intro}</p>
      <p className="attenue">{t.prerequis}</p>
      <p><a className="bouton" href={lienDInstallation(adresse)} target="_blank" rel="noopener noreferrer">{t.ajouter}</a></p>
      <ol className="carte" style={{ paddingLeft: '2rem' }}>
        {t.etapes.map((e, i) => <li key={i} style={{ margin: '0.6rem 0' }}>{e}</li>)}
      </ol>
      <div className="carte">
        <label>{t.premier}</label>
        <div className="ligne"><span style={{ flex: 1 }}>{t.premierTexte}…</span><Copier texte={t.premierTexte} libelle={t.copier} fait={t.copie} /></div>
      </div>
      <div className="carte">
        <label>{t.preference}</label>
        <div className="ligne"><span style={{ flex: 1 }}>{t.preferenceTexte}</span><Copier texte={t.preferenceTexte} libelle={t.copier} fait={t.copie} /></div>
        <p className="attenue">{t.preferenceOu}</p>
      </div>
      <div className="carte">
        <label>{t.adresse}</label>
        <div className="ligne"><code style={{ fontSize: '1rem', wordBreak: 'break-all' }}>{adresse}</code><Copier texte={adresse} libelle={t.copier} fait={t.copie} /></div>
        <p className="attenue">{t.secours}</p>
      </div>
      <p>{t.ensuite} <Link href="/projets">{TEXTES[langue].mesProjets}</Link></p>
      <p className="attenue">{t.bloque}</p>
      <p className="attenue"><Link href="/confidentialite">{t.confidentialite}</Link></p>
    </main>
    </div>
  );
}
