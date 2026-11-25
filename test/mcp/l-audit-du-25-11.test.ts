/**
 * L'audit du 25/11 (« une génération ne doit jamais planter, une modification jamais refusée sans raison ») : ce que vavi
 * sait ajuster est ajusté et dit, ce que vavi ne sert pas n'est jamais offert à l'app, un exemple de clé n'est pas une clé.
 * Chaque essai rougit sur le code d'avant.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { lesPaquetsDuGabarit, type Refus } from '@/lib/consignes';
import { laRessourceDesCapacites } from '@/lib/consignes/paquets';
import { schemaDuProjet } from '@/lib/relais/le-schema-d-une-app';
import { appelerUnOutil } from '@/lib/mcp/les-outils';
import type { Contexte } from '@/lib/mcp/les-gestes';
import { unSecretDans } from '@/lib/mcp/les-secrets';
import { typesDesTables, FONCTIONS_PAS_ENCORE_SERVIES } from '@/squelette/les-types-des-tables';
import { desProjetsEnMemoire } from '../aides/des-projets-en-memoire';
import { unMagasinEnMemoire } from '../aides/un-magasin-en-memoire';
import { NOTES, lu } from '../donnees/une-app';

const MOI = 'aaaaaaaa-0000-4000-8000-00000000000a';
const GABARIT = readFileSync(join(__dirname, '../../squelette/gabarit/package.json'), 'utf8');
let c: Contexte;
beforeEach(() => {
  c = {
    compte: MOI, projets: desProjetsEnMemoire(), magasin: unMagasinEnMemoire(), permis: lesPaquetsDuGabarit(GABARIT),
    adresse: 'https://vavi.test', refusPrecedents: new Map<string, Refus>(), scellerUnSecret: () => 'scelle',
    base: { rpc: async (f: string, a: Record<string, unknown>) => (f === 'create_app_schema' ? { data: schemaDuProjet(String(a.project_id)), error: null } : { data: null, error: null }) },
    construire: async () => ({ construite: true, duree: 5, faits: null, dist: new Map([['index.html', Buffer.from('<html></html>')]]) }),
    preRendre: async () => null,
  };
});
const creer = async (app_json: unknown) => {
  const a = await appelerUnOutil(c, 'create_project', { app_json });
  if (!a.connu || 'invalide' in a) throw new Error('appel invalide');
  return a.rendu as Record<string, unknown>;
};

describe('l’audit du 25/11', () => {
  it('app.json que vavi sait ajuster est accepté, l’ajustement dit (avant : refusé, un tour de plus pour Claude)', async () => {
    const avecDoublon = { ...NOTES, tables: NOTES.tables.map((t) => t.nom === 'depenses'
      ? { ...t, champs: [...t.champs, { nom: 'note', libelle: 'Note', type: 'reference', table: 'notes' }] } : t) };
    const r = await creer(avecDoublon);
    expect(r).toMatchObject({ ok: true, adjusted: expect.stringContaining('depenses.note') });
  });

  it('une fonction que vavi ne sert pas encore n’est pas offerte à l’app, et Claude le sait', async () => {
    const m = lu({ ...NOTES, fonctions: { pdf: true, courriel: true } });
    const types = typesDesTables(m);
    expect(types).toContain('export type CapaciteDeclaree = "courriel";');
    const r = await creer({ ...NOTES, fonctions: { pdf: true, courriel: true } });
    expect(r).toMatchObject({ ok: true, not_available_yet: expect.stringContaining('pdf') });
    expect(r.not_available_yet).not.toContain('courriel');
    expect(laRessourceDesCapacites([], FONCTIONS_PAS_ENCORE_SERVIES)).toMatch(/Not provided by vavi yet.*pdf/);
    expect(laRessourceDesCapacites([])).not.toMatch(/PDF, AI/);
  });

  it('le rendu pour les moteurs de recherche se fait après la réponse : build_preview n’attend pas le navigateur', async () => {
    let lance: (() => Promise<void>) | null = null, rendu = 0;
    c = { ...c, enArrierePlan: (_n, t) => { lance = t; }, preRendre: async () => { rendu++; return null; } };
    const p = await creer(NOTES);
    const a = await appelerUnOutil(c, 'build_preview', { project: p.project });
    expect(a.connu && !('invalide' in a) && a.rendu).toMatchObject({ ok: true, prerendered: expect.stringContaining('background') });
    expect(rendu).toBe(0);
    await lance!();
    expect(rendu).toBe(1);
  });

  it('un exemple de clé dans un texte d’aide n’est pas une clé ; une vraie l’est toujours', () => {
    expect(unSecretDans('placeholder="sk-ant-xxxxxxxxxxxxxxxxxxxxxxxxxxxx"')).toBeNull();
    expect(unSecretDans('const k = "sk_test_XXXXXXXXXXXXXXXXXXXX";')).toBeNull();
    // Des clés fabriquées à l'essai (jamais écrites en entier ici : la protection des dépôts les prendrait pour vraies).
    const hasard = 'Zr8f2KqP0vX9mT4wL7yN1bC6dE3hJ5gA';
    expect(unSecretDans(`const k = "${['sk', 'live', hasard].join('_')}";`)).toMatchObject({ sorte: 'Stripe secret key' });
    expect(unSecretDans(`a\nb = "${['sk', 'ant', 'api03', hasard].join('-')}"`)).toMatchObject({ sorte: 'Anthropic API key', ligne: 2 });
  });
});
