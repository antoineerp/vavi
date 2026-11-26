/** `/api/sante?navigateur=oui` (26/11) : le navigateur du serveur dit s'il démarre, ou pourquoi il ne démarre pas. */
import { describe, expect, it } from 'vitest';
import { essayerLeNavigateur } from '@/lib/seo/le-pre-rendu';

describe('essayer le navigateur du serveur', () => {
  it('sans Playwright, la raison est dite, rien ne plante', async () => {
    const r = await essayerLeNavigateur({ VAVI_PLAYWRIGHT: 'paquet-qui-n-existe-pas' });
    expect(r).toMatchObject({ pret: false, raison: expect.stringContaining('Playwright not found') });
  });
  // Le bac à sable de Chromium refuse root : l'essai tourne sous un compte ordinaire, comme le serveur (`USER node`).
  it.runIf(process.env.VAVI_NAVIGATEUR === 'oui' && process.getuid?.() !== 0)('avec Chromium, il démarre dans son bac à sable et ouvre une page', async () => {
    expect(await essayerLeNavigateur()).toMatchObject({ pret: true });
  }, 60_000);
});
