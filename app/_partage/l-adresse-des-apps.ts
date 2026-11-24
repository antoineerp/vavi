/** Où une app est servie (`lib/publication/les-adresses-des-apps.ts`), d'après la configuration de ce serveur. */
import { adresseDeLaPlateforme } from '@/lib/mcp/l-adresse';
import { lAdresseDeLApp, leDomaineDesApps, type Lequel } from '@/lib/publication/les-adresses-des-apps';

export const adresseDeLApp = (projet: string, lequel: Lequel): string =>
  lAdresseDeLApp(projet, lequel, { console: adresseDeLaPlateforme(), domaine: leDomaineDesApps(process.env) });
