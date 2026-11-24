/** Vague 0 (audit du 24/11 : aucun en-tête de sécurité) : la console ne se laisse pas encadrer, une app servie si. */
import { describe, expect, it } from 'vitest';
import { lesEntetes, MOTIF_DE_LA_CONSOLE } from '@/lib/les-entetes';

const motif = new RegExp(`^${MOTIF_DE_LA_CONSOLE}$`);
const pour = (chemin: string) => lesEntetes().filter((r) => r.source === '/:chemin*' || motif.test(chemin)).flatMap((r) => r.headers.map((h) => h.key));

describe('les en-têtes de sécurité', () => {
  it('la console : jamais encadrée, HTTPS imposé', () => {
    for (const c of ['/', '/projets', '/admin', '/oauth/autoriser', '/api/mcp', '/connexion']) {
      expect(pour(c)).toEqual(expect.arrayContaining(['X-Frame-Options', 'Content-Security-Policy', 'Strict-Transport-Security', 'X-Content-Type-Options']));
    }
  });
  it('une app servie : encadrable (aperçu dans Claude), le reste tenu', () => {
    for (const c of ['/p/0f1e2d3c-4b5a-4968-8778-695a4b3c2d1e/', '/s/0f1e2d3c-4b5a-4968-8778-695a4b3c2d1e/contact']) {
      expect(pour(c)).not.toContain('X-Frame-Options');
      expect(pour(c)).not.toContain('Content-Security-Policy');
      expect(pour(c)).toContain('X-Content-Type-Options');
    }
  });
  it('le frame-ancestors de la console est fermé', () => {
    const csp = lesEntetes()[1]!.headers.find((h) => h.key === 'Content-Security-Policy')!.value;
    expect(csp).toContain("frame-ancestors 'none'");
  });
});
