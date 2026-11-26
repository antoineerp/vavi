/** Où une app est servie (`lib/publication/les-adresses-des-apps.ts`), d'après la configuration de ce serveur. */
import { adresseDeLaPlateforme } from '@/lib/mcp/l-adresse';
import { lAdresseDeLApp, leDomaineDesApps, type Lequel } from '@/lib/publication/les-adresses-des-apps';
import { laCarteDesDomainesReelle } from './les-domaines-reels';

/** À l'identifiant : le site en ligne qui a un nom y renvoie (le middleware). */
export const adresseDeLApp = (projet: string, lequel: Lequel): string =>
  lAdresseDeLApp(projet, lequel, { console: adresseDeLaPlateforme(), domaine: leDomaineDesApps(process.env) });

/** L'adresse que l'on montre : le site en ligne à son nom lisible quand il en a un. */
export async function adresseMontreeDeLApp(projet: string, lequel: Lequel): Promise<string> {
  const nom = lequel === 'en_ligne' ? (await laCarteDesDomainesReelle()).nomParProjet.get(projet) ?? null : null;
  return lAdresseDeLApp(projet, lequel, { console: adresseDeLaPlateforme(), domaine: leDomaineDesApps(process.env), nom });
}
