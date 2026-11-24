import Link from 'next/link';

export default function Accueil() {
  return (
    <main className="console etroite">
      <h1>Vavi</h1>
      <p>Construisez votre app avec Claude. Vavi l’héberge, lui donne sa base de données et la publie.</p>
      <p className="ligne"><Link className="bouton" href="/commencer">Commencer</Link><Link className="bouton discret" href="/projets">Ouvrir la console</Link></p>
    </main>
  );
}
