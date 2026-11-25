/**
 * L'IA d'une app : la demande relue, l'outil forcé, la réponse coupée ou vide qui n'est pas une décision, la clé du
 * propriétaire refusée dite, la proposition écrite au nom du compte. INCIDENT 25/11 : `<ProposerParLIA>` appelait
 * `ai/<projet>/complete`, que vavi ne servait pas — la page affichait une erreur.
 */
import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  appelerLeModele, enregistrerLaProposition, laReponseHttp, laRequete, lireLaDemande, lireLaReponse, type Appel,
} from '@/lib/capacites/l-ia';
import { derriereUnCompte } from '@/lib/capacites/la-porte';
import { FONCTIONS_PAS_ENCORE_SERVIES, typesDesTables } from '@/squelette/les-types-des-tables';
import { NOTES, lu } from '../donnees/une-app';

const SCHEMA = { type: 'object', properties: { objet: { type: 'string' } }, required: ['objet'] };

describe('l’IA d’une app', () => {
  it('la route est servie, derrière un compte membre, et l’IA n’est plus « pas encore servie »', () => {
    expect(existsSync(join(process.cwd(), 'app', 'api', 'ai', '[projet]', 'complete', 'route.ts'))).toBe(true);
    expect(derriereUnCompte('ia')).toBe(true);
    expect(FONCTIONS_PAS_ENCORE_SERVIES as readonly string[]).not.toContain('ia');
    expect(typesDesTables(lu({ ...NOTES, fonctions: { ia: true } }))).toContain('export type CapaciteDeclaree = "ia";');
  });

  it('la demande relue : texte requis, schéma d’objet, images en data:, proposition avec un schéma', () => {
    expect(lireLaDemande({})).toMatchObject({ lu: false });
    expect(lireLaDemande({ prompt: 'x', schema: { type: 'array' } })).toMatchObject({ lu: false });
    expect(lireLaDemande({ prompt: 'x', images: ['https://exemple.fr/a.jpg'] })).toMatchObject({ lu: false });
    expect(lireLaDemande({ prompt: 'x', proposer: { table: 'notes' } })).toMatchObject({ lu: false });
    const d = lireLaDemande({ prompt: 'Une note', schema: SCHEMA, proposer: { table: 'notes' }, images: ['data:image/jpeg;base64,AAAA'], maxTokens: 99999 });
    expect(d).toMatchObject({ lu: true, valeur: { proposer: 'notes', maxTokens: 8000, images: [{ type: 'image/jpeg', donnees: 'AAAA' }] } });
  });

  it('l’outil est forcé, l’image vient avant la consigne', () => {
    const d = lireLaDemande({ prompt: 'Lis', schema: SCHEMA, images: ['data:image/png;base64,AAAA'] });
    if (!d.lu) throw new Error(d.pourquoi);
    const r = laRequete(d.valeur, 'm') as { tool_choice: unknown; messages: { content: { type: string }[] }[] };
    expect(r.tool_choice).toEqual({ type: 'tool', name: 'reponse' });
    expect(r.messages[0]!.content.map((b) => b.type)).toEqual(['image', 'text']);
  });

  it('une réponse coupée ou un outil vide ne sont jamais une donnée', () => {
    expect(lireLaReponse({ stop_reason: 'max_tokens', content: [{ type: 'tool_use', name: 'reponse', input: { objet: 'x' } }] }, true)).toEqual({ etat: 'tronque' });
    expect(lireLaReponse({ content: [{ type: 'tool_use', name: 'reponse', input: {} }] }, true)).toMatchObject({ etat: 'sans-decision' });
    expect(laReponseHttp(lireLaReponse({ content: [{ type: 'tool_use', name: 'reponse', input: { objet: 'x' } }] }, true))).toEqual({ statut: 200, corps: { data: { objet: 'x' } } });
    expect(laReponseHttp(lireLaReponse({ content: [{ type: 'text', text: 'Bonjour' }] }, false))).toEqual({ statut: 200, corps: { text: 'Bonjour' } });
    expect(laReponseHttp({ etat: 'tronque' }).statut).toBe(422);
  });

  it('la clé du propriétaire part chez Anthropic ; un refus dit quoi faire', async () => {
    let vu: Record<string, string> = {};
    const ok: Appel = async (_u, i) => { vu = i.headers; return { ok: true, status: 200, text: async () => '{"content":[{"type":"text","text":"ok"}]}' }; };
    expect(await appelerLeModele(ok, 'cle-du-proprietaire', {})).toMatchObject({ lu: true });
    expect(vu['x-api-key']).toBe('cle-du-proprietaire');
    const non: Appel = async () => ({ ok: false, status: 401, text: async () => 'invalid x-api-key' });
    expect(await appelerLeModele(non, 'x', {})).toMatchObject({ lu: false, pourquoi: expect.stringContaining('ANTHROPIC_API_KEY') });
  });

  it('la proposition est écrite par la plateforme, au nom du compte', async () => {
    const appels: unknown[] = [];
    const r = await enregistrerLaProposition('app_x', 'compte-1', 'notes', { objet: 'x' }, async (...a) => { appels.push(a); return { lu: true, valeur: 'id-1' }; });
    expect(r).toEqual({ lu: true, valeur: 'id-1' });
    expect(appels).toEqual([['compte-1', 'app_x', 'notes_proposer', { p_ligne: { objet: 'x' } }]]);
    expect(await enregistrerLaProposition('app_x', 'c', 'notes', {}, async () => ({ lu: false, pourquoi: 'new row violates row-level security' })))
      .toMatchObject({ lu: false, pourquoi: expect.stringContaining('ne peut pas ajouter') });
  });
});
