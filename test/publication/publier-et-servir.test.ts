/**
 * La publication pose le dist, `index.html` en dernier, et ne renvoie rien de ce qui est déjà en ligne ; le service
 * sert l'aperçu, l'environnement public posé dans `index.html`, une page de l'app par son entrée, jamais un fichier
 * absent remplacé par la page.
 */
import { describe, expect, it } from 'vitest';
import { publierLeDist, PREFIXE_DE_L_APERCU } from '@/lib/publication/publier';
import { cheminDansLeDist, poserLEnvironnement, servirLApercu, type EnvDeLApp } from '@/lib/publication/servir';
import { unMagasinEnMemoire } from '../aides/un-magasin-en-memoire';

const P = '0f1e2d3c-4b5a-4968-8778-695a4b3c2d1e';
const ENV: EnvDeLApp = { supabaseUrl: 'https://x.supabase.co', cleAnonyme: 'cle-publique', schema: 'app_0f1e2d3c_4b5a_4968_8', base: `/p/${P}/` };
const dist = (js = 'console.log(1)') => new Map([
  ['index.html', Buffer.from('<!doctype html><html><head><title>A</title></head><body><script type="module" src="/p/x/assets/a.js"></script></body></html>')],
  ['assets/a.js', Buffer.from(js)], ['faits.json', Buffer.from('{}')],
]);

describe('publier le dist', () => {
  it('pose chaque fichier, index.html en dernier, portant l’empreinte ; la même version ne repart pas', async () => {
    const m = unMagasinEnMemoire();
    const a = await publierLeDist(m, P, dist());
    expect(a).toMatchObject({ dejaEnLigne: false, envoyes: 3 });
    expect(m.ecrits.at(-1)).toBe(`${PREFIXE_DE_L_APERCU}${P}/index.html`);
    expect(m.objets.get(`${PREFIXE_DE_L_APERCU}${P}/index.html`)!.meta.empreinte).toBe(a.empreinte);
    const b = await publierLeDist(m, P, dist());
    expect(b).toMatchObject({ dejaEnLigne: true, envoyes: 0 });
  });
  it('une autre version repart ; un asset haché déjà là n’est pas renvoyé', async () => {
    const m = unMagasinEnMemoire();
    await publierLeDist(m, P, dist());
    m.ecrits.length = 0;
    const d = dist(); d.set('faits.json', Buffer.from('{"x":1}'));
    const c = await publierLeDist(m, P, d);
    expect(c).toMatchObject({ dejaEnLigne: false, sautes: 1 });
    expect(m.ecrits).toEqual([`${PREFIXE_DE_L_APERCU}${P}/faits.json`, `${PREFIXE_DE_L_APERCU}${P}/index.html`]);
  });
  it('un dist sans index.html est refusé, rien n’est posé', async () => {
    const m = unMagasinEnMemoire();
    await expect(publierLeDist(m, P, new Map([['assets/a.js', Buffer.from('x')]]))).rejects.toThrow(/index\.html/);
    expect(m.ecrits).toEqual([]);
  });
});

describe('servir l’aperçu', () => {
  it('index.html reçoit l’environnement public avant tout script, et une valeur ne peut pas fermer la balise', () => {
    const html = poserLEnvironnement('<html><head><script src="a.js"></script></head></html>', { ...ENV, cleAnonyme: '</script><b>' });
    expect(html.indexOf('__SUPABASE_URL__')).toBeLessThan(html.indexOf('a.js'));
    expect(html).not.toContain('</script><b>');
    expect(html).toContain('window.__DATABASE_SCHEMA__="app_0f1e2d3c_4b5a_4968_8"');
  });
  it('une page de l’app sert l’entrée ; un fichier absent rend 404 ; un chemin qui sort du dist est refusé', async () => {
    const m = unMagasinEnMemoire();
    await publierLeDist(m, P, dist());
    const page = await servirLApercu(m, P, ['equipe', 'membres'], ENV);
    expect(page.statut).toBe(200);
    expect(page.corps.toString()).toContain('window.__VAVI_BASENAME__');
    expect(page.cache).toMatch(/no-store/);
    const js = await servirLApercu(m, P, ['assets', 'a.js'], ENV);
    expect([js.statut, js.type, js.corps.toString()]).toEqual([200, 'application/javascript; charset=utf-8', 'console.log(1)']);
    expect((await servirLApercu(m, P, ['assets', 'b.js'], ENV)).statut).toBe(404);
    expect((await servirLApercu(m, P, ['..', 'autre', 'index.html'], ENV)).statut).toBe(400);
    expect(cheminDansLeDist([])).toBe('index.html');
  });
  it('une app jamais construite rend 404, un magasin muet 503 : jamais confondus', async () => {
    const m = unMagasinEnMemoire();
    expect((await servirLApercu(m, P, [], ENV)).statut).toBe(404);
    m.panne = true;
    expect((await servirLApercu(m, P, [], ENV)).statut).toBe(503);
  });
});
