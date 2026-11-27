/** Les mentions légales de vavi (LCEN art. 6-III) : l'éditeur identifié (nom, EI, SIRET, adresse, contact), le directeur
 * de la publication, l'hébergeur, dans les deux langues, sans passage resté à compléter. */
import { describe, expect, it } from 'vitest';
import { MENTIONS } from '@/app/mentions-legales/le-texte';

describe('les mentions légales de vavi', () => {
  it('nomment éditeur, directeur de la publication et hébergeur, en français et en anglais', () => {
    expect(MENTIONS.en.sections.length).toBe(MENTIONS.fr.sections.length);
    for (const p of Object.values(MENTIONS)) {
      const tout = p.sections.flatMap((s) => [s.titre, ...(s.paragraphes ?? []), ...(s.liste ?? [])]).join('\n');
      for (const attendu of ['Antoine Cirier, EI', '378 204 457 00048', 'Vaugneray', 'info@vavi.dev', 'Fly.io, Inc.', 'Supabase']) expect(tout).toContain(attendu);
      expect(tout).not.toMatch(/\[|à confirmer|to be confirmed/i);
      expect(tout).not.toContain('VAVI.DEV');
      for (const s of p.sections) expect((s.paragraphes?.length ?? 0) + (s.liste?.length ?? 0), s.titre).toBeGreaterThan(0);
    }
  });
});
