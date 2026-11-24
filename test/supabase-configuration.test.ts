import { describe, it, expect } from 'vitest';
import { configurationPublique, cleDeService, exiger, leScriptDeLaConfiguration, GLOBALE_DE_LA_CONFIGURATION } from '@/lib/supabase/configuration';

describe('la configuration Supabase', () => {
  it('se lit quand l’adresse et la clé anonyme sont là', () => {
    const c = configurationPublique({ NEXT_PUBLIC_SUPABASE_URL: 'https://abc.supabase.co', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'x'.repeat(40) });
    expect(c).toEqual({ lue: true, valeur: { url: 'https://abc.supabase.co', cleAnonyme: 'x'.repeat(40) } });
  });
  it('dit ce qui manque, jamais un défaut', () => {
    expect(configurationPublique({})).toEqual({ lue: false, manque: ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'] });
    expect(configurationPublique({ NEXT_PUBLIC_SUPABASE_URL: 'pas une adresse', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'x'.repeat(40) }))
      .toEqual({ lue: false, manque: ['NEXT_PUBLIC_SUPABASE_URL'] });
    expect(cleDeService({})).toEqual({ lue: false, manque: ['SUPABASE_SERVICE_ROLE_KEY'] });
  });
  it('exiger lève en nommant la variable', () => {
    expect(() => exiger(cleDeService({}))).toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
  });
  it('incident du 24/11 : le navigateur reçoit la configuration lue au LANCEMENT, jamais seulement celle du build', () => {
    const script = leScriptDeLaConfiguration({ NEXT_PUBLIC_SUPABASE_URL: 'https://abc.supabase.co', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'x'.repeat(30) + '</script>' });
    expect(script).not.toBeNull();
    expect(script).not.toContain('<');
    const fenetre: Record<string, unknown> = {};
    new Function('window', script!)(fenetre);
    expect(configurationPublique(fenetre[GLOBALE_DE_LA_CONFIGURATION] as Record<string, string>))
      .toEqual({ lue: true, valeur: { url: 'https://abc.supabase.co', cleAnonyme: 'x'.repeat(30) + '</script>' } });
    expect(leScriptDeLaConfiguration({})).toBeNull();
  });
});
