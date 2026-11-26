/**
 * Le parcours d'un visiteur (Antoine, 26/11, étape 2) : chaque requête de la page a son sort, les écritures sont
 * simulées et dites, rien n'est écrit ; dans un vrai Chromium (VAVI_NAVIGATEUR=oui), un parcours se joue étape par étape
 * et s'arrête, capture à l'appui, à la première qui échoue.
 */
import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { jouerLeParcours, laReponseSimulee, leSortDeLaRequete, type NavigateurDuParcours } from '@/lib/parcours/le-parcours';

const o = { site: 'http://127.0.0.1:4000/__vavi_base__/', base: 'https://abc.supabase.co', images: ['https://images.unsplash.com'] };

describe('le sort de chaque requête', () => {
  it('le site et une lecture de la base passent ; une écriture et un formulaire sont simulés ; le reste de la plateforme est indisponible ; ailleurs, bloqué', () => {
    expect(leSortDeLaRequete('http://127.0.0.1:4000/__vavi_base__/assets/a.js', 'GET', 'script', o)).toEqual({ sort: 'servie' });
    expect(leSortDeLaRequete('https://abc.supabase.co/rest/v1/rpc/voie_neuve_lire', 'POST', 'fetch', o)).toEqual({ sort: 'servie' });
    expect(leSortDeLaRequete('https://abc.supabase.co/rest/v1/rpc/voie_neuve_creer', 'POST', 'fetch', o)).toEqual({ sort: 'simulee', quoi: 'base', fonction: 'voie_neuve_creer' });
    expect(leSortDeLaRequete('https://abc.supabase.co/rest/v1/rpc/voie_neuve_appeler', 'POST', 'fetch', o)).toMatchObject({ sort: 'simulee' });
    expect(leSortDeLaRequete('http://127.0.0.1:4000/api/forms/submit', 'POST', 'fetch', o)).toEqual({ sort: 'simulee', quoi: 'formulaire' });
    expect(leSortDeLaRequete('http://127.0.0.1:4000/api/pay/p/panier', 'POST', 'fetch', o)).toEqual({ sort: 'indisponible', chemin: '/api/pay/p/panier' });
    expect(leSortDeLaRequete('https://images.unsplash.com/photo-1', 'GET', 'image', o)).toEqual({ sort: 'servie' });
    expect(leSortDeLaRequete('https://images.unsplash.com/x.js', 'GET', 'script', o)).toEqual({ sort: 'bloquee' });
    expect(leSortDeLaRequete('https://ailleurs.test/', 'GET', 'fetch', o)).toEqual({ sort: 'bloquee' });
  });
  it('une écriture simulée rend une réponse de succès et dit ce qui aurait été écrit', () => {
    const c = laReponseSimulee('base', 'voie_neuve_creer', JSON.stringify({ p_schema: 's', p_table: 'demande', p_valeurs: { nom: 'Ana' } }));
    expect(c.corps).toMatchObject({ id: expect.any(String), nom: 'Ana' });
    expect(c.dit).toBe('a row would be created in « demande »: {"nom":"Ana"}');
    expect(laReponseSimulee('formulaire', undefined, JSON.stringify({ formKey: 'contact', data: { message: 'Bonjour' } })).dit).toBe('form « contact » would be sent to the owner: {"message":"Bonjour"}');
  });
});

const PAGE = `<!doctype html><html><head><meta charset="utf-8"></head><body><main>
<h1>Contact</h1><a href="/__vavi_base__/merci-direct">Aller</a>
<form id="f"><label>Nom <input name="nom"></label><label>Message <textarea name="message"></textarea></label><button type="submit">Envoyer</button></form>
<p id="r"></p></main><script>
document.getElementById('f').addEventListener('submit', async (e) => { e.preventDefault();
  const d = Object.fromEntries(new FormData(e.target));
  const a = await fetch('/api/forms/submit', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ formKey: 'contact', data: d }) });
  const b = await fetch('https://abc.supabase.co/rest/v1/rpc/voie_neuve_creer', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ p_schema: 's', p_table: 'demande', p_valeurs: d }) });
  const ligne = await b.json();
  document.getElementById('r').textContent = a.ok && ligne.id ? 'Merci ' + d.nom : 'Échec';
});
</script></body></html>`;

describe.runIf(process.env.VAVI_NAVIGATEUR === 'oui')('un parcours joué dans un vrai navigateur', () => {
  const lancer = async (): Promise<NavigateurDuParcours> => {
    const { chromium } = createRequire(__filename)('playwright') as { chromium: { launch(): Promise<{ newPage(o: unknown): Promise<unknown>; close(): Promise<void> }> } };
    return (await chromium.launch()) as unknown as NavigateurDuParcours;
  };
  const lire = async (segments: readonly string[]) => (segments.length === 0 || !segments.at(-1)!.includes('.')
    ? { statut: 200, type: 'text/html; charset=utf-8', corps: Buffer.from(PAGE) } : { statut: 404, type: 'text/plain', corps: Buffer.from('') });
  it('remplit, envoie, voit la réponse ; rien n’est écrit, tout est dit', async () => {
    const r = await jouerLeParcours(await lancer(), [
      { action: 'open', path: '/contact' }, { action: 'fill', target: 'Nom', value: 'Ana' }, { action: 'fill', target: 'Message', value: 'Bonjour' },
      { action: 'click', target: 'Envoyer' }, { action: 'expect', text: 'Merci Ana' },
    ], { lire, base: 'https://abc.supabase.co', images: [], langue: 'fr' });
    expect(r.etapes.map((e) => e.ok)).toEqual([true, true, true, true, true]);
    expect(r.arret).toBeNull();
    expect(r.simule).toEqual(['form « contact » would be sent to the owner: {"nom":"Ana","message":"Bonjour"}', 'a row would be created in « demande »: {"nom":"Ana","message":"Bonjour"}']);
    expect(r.etapes[0]!.adresse).toBe('/contact');
  }, 60_000);
  it('avec un compte : la session est posée avant la première page, et les écritures vont à la copie, réelles', async () => {
    const page = `<!doctype html><html><body><p id="s"></p><script>
      document.getElementById('s').textContent = 'connecté ' + (JSON.parse(localStorage.getItem('vavi-session-app_copie') || '{}').compte || {}).email;
    </script></body></html>`;
    const r = await jouerLeParcours(await lancer(), [{ action: 'open', path: '/' }, { action: 'expect', text: 'connecté essai@vavi.invalid' }], {
      lire: async () => ({ statut: 200, type: 'text/html; charset=utf-8', corps: Buffer.from(page) }), base: 'https://abc.supabase.co', images: [], langue: 'fr',
      session: { cle: 'vavi-session-app_copie', valeur: { jeton: 'j', rafraichir: 'r', expire: 1, compte: { id: 'x', email: 'essai@vavi.invalid', confirme: true } } } });
    expect(r.etapes.map((e) => e.ok)).toEqual([true, true]);
    expect(leSortDeLaRequete('https://abc.supabase.co/rest/v1/rpc/voie_neuve_creer', 'POST', 'fetch', { ...o, copie: true })).toEqual({ sort: 'servie' });
  }, 60_000);
  it('s’arrête à la première étape qui échoue, avec sa raison et une capture', async () => {
    const r = await jouerLeParcours(await lancer(), [
      { action: 'open', path: '/' }, { action: 'click', target: 'Réserver' }, { action: 'expect', text: 'jamais' },
    ], { lire, base: 'https://abc.supabase.co', images: [], langue: 'fr' });
    expect(r.etapes).toHaveLength(2);
    expect(r.etapes[1]).toMatchObject({ ok: false, fait: expect.stringContaining('nothing on the page matches') });
    expect(r.arret?.n).toBe(2);
    expect(r.arret?.capture?.length).toBeGreaterThan(100);
  }, 60_000);
});
