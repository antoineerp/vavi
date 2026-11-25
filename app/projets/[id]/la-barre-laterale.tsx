'use client';
/** Le menu latéral d'un projet : l'écran ouvert en surbrillance. */
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { lAdresse, type Rubrique } from './la-navigation';

export function BarreLaterale({ id, menu }: { readonly id: string; readonly menu: readonly Rubrique[] }) {
  const ici = usePathname();
  return (
    <nav className="projet-menu" aria-label="Projet">
      {menu.map((r) => (
        <div key={r.titre}>
          <p className="projet-menu-titre">{r.titre}</p>
          {r.ecrans.map((x) => {
            const href = lAdresse(id, x.ecran);
            return <Link key={x.ecran} href={href} className={ici === href ? 'actif' : undefined} aria-current={ici === href ? 'page' : undefined}>{x.nom}</Link>;
          })}
        </div>
      ))}
    </nav>
  );
}
