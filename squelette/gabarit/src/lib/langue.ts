/**
 * La langue de la page : celle de son adresse (`/en/…`), sinon la langue principale de l'app.
 * Une langue est une adresse : les liens écrits par l'agent (`/contact`) restent valables dans chaque langue.
 */
import { APP, LANGUES } from './app';
import { BASE_DE_MONTAGE } from './env';

export function langueCourante(): string {
  if (typeof window === 'undefined') return APP.langues.principale;
  const apresBase = window.location.pathname.slice((BASE_DE_MONTAGE ?? '').length);
  const premier = apresBase.split('/').filter(Boolean)[0];
  return premier && APP.langues.autres.includes(premier) ? premier : APP.langues.principale;
}

/** La base du routeur : la base de montage, suivie de la langue quand ce n'est pas la principale. */
export function baseDuRouteur(): string | undefined {
  const langue = langueCourante();
  const base = `${BASE_DE_MONTAGE ?? ''}${langue === APP.langues.principale ? '' : `/${langue}`}`;
  return base === '' ? undefined : base;
}

export { LANGUES };
