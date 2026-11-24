/** Le client de service (clé `service_role`) : serveur seulement, jamais livré au navigateur. */
import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { cleDeService, configurationPublique, exiger } from './configuration';

export function clientDeService() {
  const c = exiger(configurationPublique(process.env));
  return createClient(c.url, exiger(cleDeService(process.env)), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
