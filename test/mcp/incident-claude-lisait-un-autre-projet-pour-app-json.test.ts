/**
 * INCIDENT 25/11 (essai d'Antoine, « Cap Équipage ») : `create_project` refusait un app.json mal formé (rôles en
 * chaînes, tables en objet) en ne nommant que les écarts ; Claude ouvrait alors un AUTRE projet de la personne pour en
 * recopier la forme, et lui montrait ses captures. Le refus porte désormais un app.json complet et valide.
 * Rougit sur le code d'avant : le geste ne contenait aucun exemple.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { lesPaquetsDuGabarit, type Refus } from '@/lib/consignes';
import { schemaDuProjet } from '@/lib/relais/le-schema-d-une-app';
import { appelerUnOutil } from '@/lib/mcp/les-outils';
import type { Contexte } from '@/lib/mcp/les-gestes';
import { lireLeManifeste } from '@/lib/backend/app/manifeste';
import { EXEMPLE_D_APP_JSON } from '@/lib/backend/app/l-exemple-d-app-json';
import { desProjetsEnMemoire } from '../aides/des-projets-en-memoire';
import { unMagasinEnMemoire } from '../aides/un-magasin-en-memoire';

const GABARIT = readFileSync(join(__dirname, '../../squelette/gabarit/package.json'), 'utf8');
const contexte = (): Contexte => ({
  compte: 'aaaaaaaa-0000-4000-8000-00000000000a', projets: desProjetsEnMemoire(), magasin: unMagasinEnMemoire(), permis: lesPaquetsDuGabarit(GABARIT),
  adresse: 'https://vavi.test', refusPrecedents: new Map<string, Refus>(), scellerUnSecret: () => 'scelle',
  base: { rpc: async (f: string, a: Record<string, unknown>) => (f === 'create_app_schema' ? { data: schemaDuProjet(String(a.project_id)), error: null } : { data: null, error: null }) },
  construire: async () => { throw new Error('pas de build ici'); }, preRendre: async () => null,
} as unknown as Contexte);

describe('un app.json mal formé', () => {
  it('l’exemple rendu est lui-même un app.json valide, sans ajustement', () => {
    const r = lireLeManifeste(JSON.parse(JSON.stringify(EXEMPLE_D_APP_JSON)));
    expect(r.ok).toBe(true);
    expect(r.repare).toEqual([]);
  });

  it('est refusé avec un app.json complet à suivre, et l’exemple suivi est accepté', async () => {
    const c = contexte();
    const a = await appelerUnOutil(c, 'create_project', { app_json: { nom: 'Cap Équipage', langue: 'fr', roles: ['organisateur', 'equipier'], tables: { sejours: { colonnes: { titre: 'texte' } } } } });
    if (!a.connu || 'invalide' in a) throw new Error('appel invalide');
    const refus = a.rendu as Refus;
    expect(refus.refuse).toBe(true);
    expect(refus.code).toBe('app_json_refuse');
    const json = refus.geste.slice(refus.geste.indexOf('{'));
    expect(JSON.parse(json)).toEqual(JSON.parse(JSON.stringify(EXEMPLE_D_APP_JSON)));
    expect(refus.geste).toMatch(/never read another project/);
    const b = await appelerUnOutil(c, 'create_project', { app_json: JSON.parse(json) });
    if (!b.connu || 'invalide' in b) throw new Error('appel invalide');
    expect('refuse' in b.rendu).toBe(false);
  });
});
