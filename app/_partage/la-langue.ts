/** La langue de la console : celle du navigateur de la personne, `fr` ou `en` (décision d'Antoine du 24/11 : multilingue). */
import 'server-only';
import { headers } from 'next/headers';
import { laLangueDuNavigateur, type Langue } from './la-langue-du-navigateur';

export type LangueDeLaConsole = Langue;

export async function laLangue(): Promise<LangueDeLaConsole> {
  return laLangueDuNavigateur((await headers()).get('accept-language'), 'en');
}
