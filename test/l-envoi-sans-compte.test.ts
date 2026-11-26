/**
 * Essai d'Antoine du 26/11 : `envoyerSansCompte` du gabarit appelait `/api/depot/<projet>`, que vavi ne servait pas ; un
 * parcours répondait « unavailable ». La règle (`lib/relais/l-envoi-sans-compte.ts`) écrit au nom du propriétaire et rend la
 * ligne relue ; un parcours la simule sans copie et la joue sur une copie.
 */
import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { envoyerSansCompte } from '@/lib/relais/l-envoi-sans-compte';
import { laRouteDeLaCopie, leDepotDuCorps } from '@/lib/parcours/la-plateforme-de-la-copie';
import { laReponseSimulee, leSortDeLaRequete } from '@/lib/parcours/le-parcours';
import { lireLeManifeste } from '@/lib/backend/app/manifeste';
import { EXEMPLE_D_APP_JSON } from '@/lib/backend/app/l-exemple-d-app-json';
import { estUneRouteDesApps } from '@/lib/publication/les-adresses-des-apps';

const app = JSON.parse(JSON.stringify(EXEMPLE_D_APP_JSON)) as { tables: Record<string, unknown>[] };
app.tables.push({ nom: 'messages', libelle: 'Messages', champs: [{ nom: 'nom', libelle: 'Nom', type: 'texte', obligatoire: true }, { nom: 'texte', libelle: 'Texte', type: 'texte_long', obligatoire: true }],
  acces: { lire: ['proprietaire'], creer: ['tous'], modifier: ['proprietaire'], supprimer: ['proprietaire'], lignes: 'toutes' }, propositions: false, contenu: false, exemples: [] });
const lu = lireLeManifeste(app);
if (!lu.ok) throw new Error(lu.erreurs.join(' ; '));
const m = lu.manifeste;

describe('l’envoi sans compte', () => {
  it('la route existe : le gabarit l’appelle', () => {
    expect(existsSync('app/api/depot/[projet]/route.ts')).toBe(true);
    expect(estUneRouteDesApps('/api/depot/p')).toBe(true); // à l'hôte de l'app, elle passe (jamais réécrite vers le site)
  });
  it('écrit au nom du propriétaire, relit la ligne, et refuse une table fermée au visiteur', async () => {
    const appels: string[] = [];
    const d = { relais: async (f: string, a: Record<string, unknown>) => { appels.push(`${f}:${String(a.p_table)}`);
      return f === 'voie_neuve_creer' ? { lu: true as const, valeur: { id: 'l1' } } : { lu: true as const, valeur: { lignes: [{ id: 'l1', nom: 'Ana', texte: 'Bonjour à vous' }] } }; } };
    const r = await envoyerSansCompte(m, 'app_x', { table: 'messages', ligne: { nom: 'Ana', texte: 'Bonjour à vous' } }, [], d);
    expect(r.statut).toBe(201);
    expect(r.corps).toMatchObject({ id: 'l1', ligne: { nom: 'Ana', texte: 'Bonjour à vous' } });
    expect(appels).toEqual(['voie_neuve_creer:messages', 'voie_neuve_lire:messages']);
    expect((await envoyerSansCompte(m, 'app_x', { table: 'evenements', ligne: { titre: 'x' } }, [], d)).statut).toBe(422);
  });
  it('un parcours sans copie le simule ; sur une copie il le joue, au lieu de « unavailable »', async () => {
    const o = { site: 'http://127.0.0.1:4000', base: 'https://b.supabase.co', images: [] };
    expect(leSortDeLaRequete('http://127.0.0.1:4000/api/depot/p', 'POST', 'fetch', o)).toEqual({ sort: 'simulee', quoi: 'depot' });
    expect(leSortDeLaRequete('http://127.0.0.1:4000/api/depot/p', 'POST', 'fetch', { ...o, copie: true })).toEqual({ sort: 'indisponible', chemin: '/api/depot/p' });
    const multipart = '------x\r\nContent-Disposition: form-data; name="depot"\r\n\r\n{"table":"messages","ligne":{"nom":"Ana"}}\r\n------x--\r\n';
    expect(leDepotDuCorps(multipart)).toEqual({ table: 'messages', ligne: { nom: 'Ana' } });
    expect(laReponseSimulee('depot', undefined, multipart).dit).toContain('« messages »');
    const g = { comptes: async () => ({ statut: 200, corps: {} }), depot: async (x: unknown) => ({ statut: 201, corps: { recu: x } }) };
    expect(await laRouteDeLaCopie(g, '/api/depot/p', multipart)).toMatchObject({ statut: 201, corps: { recu: { table: 'messages' } }, dit: expect.stringContaining('row saved') });
  });
});
