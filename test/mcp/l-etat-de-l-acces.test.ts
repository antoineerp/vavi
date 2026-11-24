/**
 * Vague 0 (audit du 24/11) : un code ne sert qu'une fois, la personne peut déconnecter Claude, et chaque porte a sa
 * limite de débit. Rouges sur 15de855 (rien de tout cela n'existait), verts après.
 */
import { describe, expect, it } from 'vitest';
import { avecUneMemoire, empreinteDuCode, estRevoque, type EtatDeLAcces } from '@/lib/mcp/l-etat-de-l-acces';
import { delivrer, lireUnAcces, renouveler } from '@/lib/mcp/les-jetons';
import { LOT_AU_PLUS, uneFenetre } from '@/lib/mcp/les-limites';
import { servirLeMcp } from '@/lib/mcp/le-serveur';

process.env.VAVI_CLE_DES_JETONS ??= Buffer.alloc(32, 7).toString('base64');
const A = '11111111-1111-4111-8111-111111111111';

describe('la déconnexion de Claude', () => {
  it('un accès émis avant la déconnexion tombe ; émis après, il passe', () => {
    const t = 1_000_000;
    const j = delivrer({ compte: A, client: 'c' }, t);
    const acces = lireUnAcces(j.access_token, t + 1);
    const renouv = renouveler(j.refresh_token, 'c', t + 1);
    if (!acces.lu || !renouv.lu) throw new Error('illisible');
    expect(acces.valeur.emis).toBe(t);
    expect(estRevoque(acces.valeur, null)).toBe(false);
    expect(estRevoque(acces.valeur, t + 10)).toBe(true);
    expect(estRevoque(renouv.valeur, t + 10)).toBe(true);
    expect(estRevoque(acces.valeur, t - 10)).toBe(false);
  });
  it('un jeton d’avant la règle (sans date) tombe à la première déconnexion', () => {
    expect(estRevoque({ compte: A, client: 'c' }, 1)).toBe(true);
  });
  it('la mémoire relit au plus toutes les 30 s, et oublie à la déconnexion', async () => {
    let lectures = 0; let depuis: number | null = null;
    const e: EtatDeLAcces = { marquerLeCode: async () => 'neuf', revoqueDepuis: async () => { lectures += 1; return depuis; }, revoquer: async () => { depuis = 5; return null; } };
    const m = avecUneMemoire(e);
    await m.revoqueDepuis(A); await m.revoqueDepuis(A);
    expect(lectures).toBe(1);
    await m.revoquer(A);
    expect(await m.revoqueDepuis(A)).toBe(5);
  });
  it('l’empreinte d’un code : 64 hexadécimaux, jamais le code', () => {
    expect(empreinteDuCode('vavi.abc')).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('les limites de débit', () => {
  it('une fenêtre arrête au-delà du nombre, puis rouvre', () => {
    const f = uneFenetre({ nombre: 2, fenetreMs: 1000 });
    expect(f.passe('x', 0).passe).toBe(true);
    expect(f.passe('x', 10).passe).toBe(true);
    expect(f.passe('x', 20)).toEqual({ passe: false, apres: 1 });
    expect(f.passe('y', 20).passe).toBe(true);
    expect(f.passe('x', 1500).passe).toBe(true);
  });
  it('un lot JSON-RPC de plus de LOT_AU_PLUS messages est refusé en entier', async () => {
    const lot = Array.from({ length: LOT_AU_PLUS + 1 }, (_, i) => ({ jsonrpc: '2.0', id: i, method: 'ping' }));
    const r = await servirLeMcp(lot, {} as never);
    expect(r).toMatchObject({ error: { code: -32600 } });
  });
});
