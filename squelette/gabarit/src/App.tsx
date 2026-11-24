/**
 * La coquille invisible de l'app : la session, les lectures, le chrome de l'agent et le filet qui garde chaque page.
 * Elle n'affiche rien d'elle-même : l'en-tête, le menu et le pied sont ceux de `src/Chrome.tsx`.
 */
import { BandeauDEssai } from './briques/EssaiDeRole';
import { BandeauDuClient } from './briques/EspacesClients';
import { Component, useLayoutEffect, type ComponentType, type ErrorInfo, type ReactNode } from 'react';
import { Outlet, useLocation } from 'react-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { clientDesLectures } from './lib/donnees';
import { FournisseurDeSession, useSession } from './lib/session';
import { menuPour, PAGES } from './lib/navigation';
import { poserLaTete } from './lib/referencement';
import { useMesureDAudience } from './lib/mesure';
import { PageEnPanne } from './briques/etats';
import { Toaster } from './ui/sonner';
import type { ChromeProps } from './briques/chrome';
import Chrome from './Chrome';

class Filet extends Component<{ children: ReactNode }, { panne: Error | null }> {
  override state: { panne: Error | null } = { panne: null };
  static getDerivedStateFromError(panne: Error) { return { panne }; }
  override componentDidCatch(panne: Error, info: ErrorInfo) { console.error('[app] page en panne', panne, info.componentStack); }
  override render() {
    return this.state.panne ? <PageEnPanne reessayer={() => this.setState({ panne: null })} /> : this.props.children;
  }
}

function surfaceDe(chemin: string): 'public' | 'travail' {
  const page = PAGES.find((p) => p.chemin === chemin);
  return page && page.acces.nature !== 'public' ? 'travail' : 'public';
}

function AvecLeChrome({ C, children }: { C: ComponentType<ChromeProps>; children: ReactNode }) {
  const { compte, roles } = useSession();
  const { pathname } = useLocation();
  const surface = surfaceDe(pathname);
  useMesureDAudience();
  return (
    <>
      {surface === 'travail' ? <BandeauDuClient /> : null}
      <C menu={menuPour(compte !== null, roles, surface)} surface={surface}>{children}</C>
    </>
  );
}

export default function App() {
  const { pathname, search, hash } = useLocation();
  useLayoutEffect(() => {
    document.documentElement.setAttribute('data-adresse-rendue', pathname);
    poserLaTete(pathname);
    const ancre = hash ? document.getElementById(hash.slice(1)) : null;
    if (ancre) ancre.scrollIntoView(); else window.scrollTo(0, 0);
  }, [pathname, hash]);
  return (
    <QueryClientProvider client={clientDesLectures}>
      <FournisseurDeSession>
        <BandeauDEssai />
        <AvecLeChrome C={Chrome}>
          <Filet key={`${pathname}${search}`}><Outlet /></Filet>
        </AvecLeChrome>
        <Toaster position="bottom-right" />
      </FournisseurDeSession>
    </QueryClientProvider>
  );
}
