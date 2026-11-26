/**
 * Le panneau de vavi s'ouvre de lui-même (Antoine, 26/11 : « comme Claude Design, qui s'ouvre automatiquement à droite ») :
 * la vue, dès qu'elle a un projet, demande à l'hôte d'être affichée en grand, une fois, s'il l'offre ; sinon elle ne
 * demande rien. Joué dans un vrai Chromium (VAVI_NAVIGATEUR=oui), l'hôte simulé par postMessage.
 */
import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { laRessourceDeLaVue } from '@/lib/mcp/la-vue';

type Message = { jsonrpc: string; id?: number; method?: string; params?: Record<string, unknown> };
interface Page { setContent(h: string): Promise<void>; evaluate<T>(js: string): Promise<T>; waitForTimeout(ms: number): Promise<void> }

/** Les demandes de la vue à l'hôte, quand l'hôte offre ces modes. */
async function lesDemandes(modes: readonly string[]): Promise<Message[]> {
  const { chromium } = createRequire(__filename)('playwright') as { chromium: { launch(): Promise<{ newPage(): Promise<Page>; close(): Promise<void> }> } };
  const n = await chromium.launch();
  try {
    const p = await n.newPage();
    // L'hôte simulé : ce que la vue lui envoie est gardé, avant que son script ne tourne.
    const patch = "<script>window.__envoyes=[];Object.defineProperty(window,'parent',{value:{postMessage:function(m){window.__envoyes.push(m);}}});</script>";
    await p.setContent(laRessourceDeLaVue({ jeton: 'j', cadres: [] }).contents[0]!.text.replace('<head>', `<head>${patch}`));
    // En TEXTE : esbuild ajoute `__name` aux fonctions, que la page ne connaît pas (lib/seo/les-captures.ts).
    const repondre = (m: readonly string[]) => p.evaluate(`(() => {
      const fiche = { ok: true, id: 'p1', project: 'p1', name: 'Le café', state: 'rien', building: true, work_session: 'la page', versions: [], console_url: 'https://vavi.test/projets/p1' };
      for (const x of window.__envoyes.splice(0)) {
        window.__vus = (window.__vus || []).concat([x]);
        if (x.id == null) continue;
        const result = x.method === 'ui/initialize' ? { hostContext: { availableDisplayModes: ${JSON.stringify(m)}, displayMode: 'inline' } }
          : x.method === 'tools/call' ? { structuredContent: fiche } : { mode: x.params.mode };
        window.postMessage({ jsonrpc: '2.0', id: x.id, result }, '*');
      }
    })()`);
    await p.waitForTimeout(50); await repondre(modes);
    await p.evaluate(`window.postMessage({ jsonrpc: '2.0', method: 'ui/notifications/tool-result', params: { structuredContent: { project: 'p1' } } }, '*')`);
    for (let i = 0; i < 4; i++) { await p.waitForTimeout(60); await repondre(modes); }
    return await p.evaluate<Message[]>(`window.__vus || []`);
  } finally { await n.close(); }
}
describe.runIf(process.env.VAVI_NAVIGATEUR === 'oui')('le panneau de vavi', () => {
  it('s’ouvre en grand de lui-même, une fois, dès que la vue a un projet, quand l’hôte l’offre', async () => {
    const d = (await lesDemandes(['inline', 'fullscreen', 'pip'])).filter((m) => m.method === 'ui/request-display-mode');
    expect(d.map((m) => m.params?.mode)).toEqual(['fullscreen']);
  }, 30_000);
  it('INCIDENT 26/11 — un hôte qui ne dit pas ses modes reçoit quand même la demande (la vue restait dans la conversation)', async () => {
    const d = (await lesDemandes([])).filter((m) => m.method === 'ui/request-display-mode');
    expect(d.map((m) => m.params?.mode)).toEqual(['fullscreen']);
  }, 30_000);
  it('ne demande rien quand l’hôte n’offre que la conversation', async () => {
    expect((await lesDemandes(['inline'])).some((m) => m.method === 'ui/request-display-mode')).toBe(false);
  }, 30_000);
});
