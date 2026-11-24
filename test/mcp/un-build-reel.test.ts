/**
 * De bout en bout, avec le VRAI atelier (VAVI_BATIR=oui) : un projet créé par les outils, deux fichiers écrits par
 * Claude, un `build_preview` vert, puis l'aperçu servi par l'empreinte qu'il désigne.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { lesPaquetsDuGabarit, type Refus } from '@/lib/consignes';
import { derive } from '@/squelette/poser';
import { schemaDuProjet } from '@/lib/relais/le-schema-d-une-app';
import { construireLApp } from '@/lib/atelier/construire';
import { racineDuBuild } from '@/lib/publication/publier';
import { servirUnDist } from '@/lib/publication/servir';
import { appelerUnOutil } from '@/lib/mcp/les-outils';
import type { Contexte } from '@/lib/mcp/les-gestes';
import { desProjetsEnMemoire } from '../aides/des-projets-en-memoire';
import { unMagasinEnMemoire } from '../aides/un-magasin-en-memoire';
import { unManifeste } from '../aides/un-manifeste';

const CHROME = "import type { ChromeProps } from '@/briques/chrome';\nexport default function Chrome({ children }: ChromeProps) { return <main>{children}</main>; }\n";
const PAGE = "import { PUBLIC } from '@/lib/acces';\nexport const acces = PUBLIC;\nexport default function Accueil() { return <h1>Bonjour</h1>; }\n";

describe.runIf(process.env.VAVI_BATIR === 'oui')('un projet construit par les outils, avec le vrai atelier', () => {
  it('create_project → ouvrir_chantier → apply_changes → build_preview vert → publish : l’aperçu sert ce build', async () => {
    const magasin = unMagasinEnMemoire();
    const c: Contexte = {
      compte: 'aaaaaaaa-0000-4000-8000-00000000000a', projets: desProjetsEnMemoire(), magasin, adresse: 'https://vavi.test',
      permis: lesPaquetsDuGabarit(readFileSync(join(__dirname, '../../squelette/gabarit/package.json'), 'utf8')), refusPrecedents: new Map<string, Refus>(),
      scellerUnSecret: () => 's', construire: construireLApp,
      base: { rpc: async (f: string, a: Record<string, unknown>) => ({ data: f === 'create_app_schema' ? schemaDuProjet(String(a.project_id)) : null, error: null }) },
    };
    const jouer = async (nom: string, args: Record<string, unknown>) => {
      const r = await appelerUnOutil(c, nom, args);
      if (!r.connu || 'invalide' in r || 'refuse' in r.rendu) throw new Error(`${nom} : ${JSON.stringify(r)}`);
      return r.rendu as Record<string, unknown>;
    };
    const p = await jouer('create_project', { app_json: JSON.parse(derive('app.json', unManifeste({ nature: 'site', nom: 'Atelier' }))) });
    const ch = await jouer('ouvrir_chantier', { project: p.project, intention: 'la page d’accueil' });
    const w = { project: p.project, work_session: ch.work_session };
    await jouer('apply_changes', { ...w, why: 'le chrome et l’accueil', changes: [{ path: 'src/Chrome.tsx', content: CHROME }, { path: 'src/pages/index.tsx', content: PAGE }] });
    const b = await jouer('build_preview', { project: p.project });
    expect(b.green).toBe(true);
    await jouer('publish', w);
    const servi = await servirUnDist(magasin, racineDuBuild(String(p.project), String(b.fingerprint)), [], { supabaseUrl: 'https://x', cleAnonyme: 'k', schema: 's', base: `/p/${p.project}/`, projet: String(p.project) });
    expect(servi.statut).toBe(200);
    expect(servi.corps.toString()).toContain(`<base href="/p/${p.project}/">`);
    expect(servi.corps.toString()).toMatch(/src="\.\/assets\/[^"]+\.js"/);
  }, 600_000);
});
