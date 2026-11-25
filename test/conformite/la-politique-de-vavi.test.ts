/** La politique de confidentialité de vavi : exigée par l'annuaire des connecteurs de Claude (un refus immédiat sans
 * elle), avec les sujets qu'il demande, dans les deux langues de la console, sans un passage resté à compléter. */
import { describe, expect, it } from 'vitest';
import { POLITIQUE } from '@/app/confidentialite/le-texte';

describe('la politique de confidentialité de vavi', () => {
  it('a les mêmes sections en français et en anglais, datées, avec un contact', () => {
    expect(POLITIQUE.en.sections.length).toBe(POLITIQUE.fr.sections.length);
    for (const p of Object.values(POLITIQUE)) {
      expect(p.version).toMatch(/2026/);
      const tout = p.sections.flatMap((s) => [s.titre, ...(s.paragraphes ?? []), ...(s.liste ?? [])]).join('\n');
      expect(tout).toContain('info@vavi.dev');
      expect(tout).not.toMatch(/\[|à confirmer|to be confirmed/i);
      for (const s of p.sections) expect((s.paragraphes?.length ?? 0) + (s.liste?.length ?? 0), s.titre).toBeGreaterThan(0);
    }
  });
});
