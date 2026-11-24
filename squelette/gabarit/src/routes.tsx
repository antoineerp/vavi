/**
 * Les routes de l'app, dérivées des pages (`src/pages/`) et de rien d'autre :
 *   pages/index.tsx → /    pages/x.tsx → /x    pages/x/index.tsx → /x    pages/x/$id.tsx → /x/:id    pages/404.tsx → *
 * Les pages du cadre (porte, compte, panier) s'ajoutent aux adresses que l'app n'occupe pas.
 */
import type { ComponentType, ReactNode } from 'react';
import { createBrowserRouter, Navigate, type RouteObject } from 'react-router';
import App from './App';
import { PAGES } from './lib/navigation';
import { peutOuvrir, type Acces, type ModuleDePage } from './lib/acces';
import { useSession, PORTE, MON_COMPTE } from './lib/session';
import { baseDuRouteur } from './lib/langue';
import { Patience, Introuvable, PageEnPanne, RolesIllisibles } from './briques/etats';
import { EcranDUnAutreRole } from './briques/EssaiDeRole';
import { Porte } from './briques/Porte';
import { MonCompte } from './briques/MonCompte';

const modules = import.meta.glob<ModuleDePage>('./pages/**/*.tsx', { eager: true });
/** Une pièce du cadre dit si l'app l'offre (`offerte`, lu dans app.json) ; sans le dire, elle est offerte à toute app. */
const pieces = import.meta.glob<{ default: ComponentType; offerte?: boolean }>('./briques/pieces/*.tsx', { eager: true });

function Garde({ acces, children }: { acces: Acces; children: ReactNode }) {
  const s = useSession();
  if (acces.nature === 'public') return <>{children}</>;
  if (s.enChargement || (s.compte && !s.rolesLus)) return <Patience />;
  if (!s.compte) return <Navigate to={`${PORTE}?retour=${encodeURIComponent(window.location.pathname)}`} replace />;
  if (peutOuvrir(acces, true, s.roles)) return <>{children}</>;
  return s.rolesIllisibles ? <RolesIllisibles relire={() => void s.relireLesRoles()} /> : <EcranDUnAutreRole acces={acces} />;
}

const versAcces = (a: (typeof PAGES)[number]['acces']): Acces =>
  (a.nature === 'role' ? { nature: 'role', roles: a.roles as [string, ...string[]] } : a);

const deLApp: RouteObject[] = PAGES.flatMap((p) => {
  const Page = modules[`./pages/${p.fichier}`]?.default;
  return Page ? [{ path: p.chemin, element: <Garde acces={versAcces(p.acces)}><Page /></Garde> }] : [];
});

const occupees = new Set(PAGES.map((p) => p.chemin));
const duCadre: RouteObject[] = [
  { path: PORTE, element: <Porte /> },
  { path: MON_COMPTE, element: <Garde acces={{ nature: 'compte' }}><MonCompte /></Garde> },
  ...Object.entries(pieces).filter(([, m]) => m.offerte !== false).map(([chemin, m]) => {
    const Piece = m.default;
    return { path: `/${chemin.replace(/^\.\/briques\/pieces\//, '').replace(/\.tsx$/, '')}`, element: <Piece /> };
  }),
].filter((r) => !occupees.has(r.path as string));

const attrapeTout: RouteObject[] = occupees.has('*') ? [] : [{ path: '*', element: <Introuvable /> }];

export const routeur = createBrowserRouter(
  [{ element: <App />, errorElement: <PageEnPanne />, children: [...deLApp, ...duCadre, ...attrapeTout] }],
  { basename: baseDuRouteur() },
);
