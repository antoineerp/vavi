/** La langue de la console : celle du navigateur de la personne, `fr` ou `en` (décision d'Antoine du 24/11 : multilingue). */
import 'server-only';
import { headers } from 'next/headers';

export type LangueDeLaConsole = 'fr' | 'en';

export async function laLangue(): Promise<LangueDeLaConsole> {
  const h = (await headers()).get('accept-language') ?? '';
  return /^fr\b/i.test(h.trim()) ? 'fr' : 'en';
}
