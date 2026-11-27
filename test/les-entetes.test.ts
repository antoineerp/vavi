/**
 * Vague 0 (audit du 24/11 : aucun en-tête de sécurité) : la console ne se laisse pas encadrer, une app servie si.
 * INCIDENT 27/11 (Antoine : l'aperçu de la console « n'autorise pas la connexion ») : servie à son hôte, une app a pour
 * chemin `/`, et le motif de chemin de la console lui posait `frame-ancestors 'none'`. Seul l'hôte décide désormais.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { lesEntetes, lesEntetesDeLaConsole } from '@/lib/les-entetes';

const poses = (chemin: string) => { const h = new Headers(); lesEntetesDeLaConsole({ headers: h }, chemin); return [...h.keys()]; };

describe('les en-têtes de sécurité', () => {
  it('la console : jamais encadrée ; HTTPS imposé partout', () => {
    for (const c of ['/', '/projets', '/admin', '/oauth/autoriser', '/api/mcp', '/connexion']) {
      expect(poses(c)).toEqual(expect.arrayContaining(['x-frame-options', 'content-security-policy', 'permissions-policy']));
    }
    expect(lesEntetes()).toEqual([{ source: '/:chemin*', headers: expect.arrayContaining([expect.objectContaining({ key: 'Strict-Transport-Security' })]) }]);
  });
  it('INCIDENT — une app servie à son hôte (chemin `/`) reste encadrable : Next ne pose plus rien par chemin, le middleware seul, sur la console', () => {
    const tous = lesEntetes().flatMap((r) => r.headers.map((h) => h.key));
    expect(tous).not.toContain('X-Frame-Options');
    expect(tous).not.toContain('Content-Security-Policy');
    const m = readFileSync(join(__dirname, '..', 'middleware.ts'), 'utf8');
    // La seule pose : après les décisions d'une app (réécrite vers son hôte, ses routes, son domaine), sur la console.
    expect(m.match(/lesEntetesDeLaConsole\(/g)).toHaveLength(1);
    expect(m.indexOf('lesEntetesDeLaConsole(await rafraichirLaSession')).toBeGreaterThan(m.indexOf("d.faire === 'reecrire'"));
  });
  it('une app servie par son chemin sur l’hôte de la console (en local) reste encadrable', () => {
    for (const c of ['/p/0f1e2d3c-4b5a-4968-8778-695a4b3c2d1e/', '/s/0f1e2d3c-4b5a-4968-8778-695a4b3c2d1e/contact']) expect(poses(c)).toEqual([]);
  });
  it('le frame-ancestors de la console est fermé', () => {
    const h = new Headers(); lesEntetesDeLaConsole({ headers: h }, '/');
    expect(h.get('content-security-policy')).toContain("frame-ancestors 'none'");
  });
});
