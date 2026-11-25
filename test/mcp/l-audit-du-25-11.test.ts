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
import { typesDesTables, FONCTIONS_PAS_ENCORE_SERVIES, CE_QUE_CLAUDE_FAIT_DANS_LA_PAGE, lesFonctionsAFaireDansLaPage } from '@/squelette/les-types-des-tables';
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
    expect(laRessourceDesCapacites([], lesFonctionsAFaireDansLaPage(FONCTIONS_PAS_ENCORE_SERVIES))).toMatch(/pdf: generate the PDF in the page/);
    expect(laRessourceDesCapacites([])).not.toMatch(/PDF, AI/);
  });

  // INCIDENT 25/11 (Antoine : « il faut que Claude fasse tout ce que vavi ne fait pas ») : un PDF demandé était annoncé
  // « pas encore disponible » à la personne, alors que Claude peut le faire dans la page.
  it('ce que vavi ne sert pas, Claude le fait lui-même dans la page ; seul ce qui demande une clé attend', async () => {
    const r = await creer({ ...NOTES, fonctions: { pdf: true, ia: true } });
    expect(r.not_available_yet).toMatch(/pdf: .*build it yourself.*jspdf/);
    expect(r.not_available_yet).not.toMatch(/pdf[^.]*not available yet/);
    expect(r.not_available_yet).toMatch(/ia: needs a secret key/);
    const ressource = laRessourceDesCapacites([], lesFonctionsAFaireDansLaPage(FONCTIONS_PAS_ENCORE_SERVIES));
    expect(ressource).not.toMatch(/Do not promise them/);
    expect(ressource).toMatch(/Waiting for vavi.*ia, connecteur, telephone/);
  });

  it('chaque paquet nommé pour le faire dans la page est dans le gabarit', () => {
    const permis = lesPaquetsDuGabarit(readFileSync(join(process.cwd(), 'squelette', 'gabarit', 'package.json'), 'utf8'));
    const nommes = Object.values(CE_QUE_CLAUDE_FAIT_DANS_LA_PAGE).flatMap((t) => [...(t ?? '').matchAll(/`([^`]+)`/g)].map((m) => m[1]!.replace(/\/browser$/, '')));
    expect(nommes.length).toBeGreaterThan(4);
    for (const p of nommes) expect(permis).toContain(p);
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
