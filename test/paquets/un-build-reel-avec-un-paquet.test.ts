/**
 * De bout en bout, avec le VRAI atelier et le VRAI registre npm (VAVI_BATIR=oui) : `add_packages` vérifie une
 * bibliothèque d'éphémérides, une page l'importe, et `build_preview` est vert, la bibliothèque dans le dist
 * (essai « Thème astral » du 25/11 : la même bibliothèque était refusée).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { lesPaquetsDuGabarit, type Refus } from '@/lib/consignes';
import { derive } from '@/squelette/poser';
import { schemaDuProjet } from '@/lib/relais/le-schema-d-une-app';
import { construireLApp } from '@/lib/atelier/construire';
import { appelerUnOutil } from '@/lib/mcp/les-outils';
import type { Contexte } from '@/lib/mcp/les-gestes';
import { desProjetsEnMemoire } from '../aides/des-projets-en-memoire';
import { unMagasinEnMemoire } from '../aides/un-magasin-en-memoire';
import { unManifeste } from '../aides/un-manifeste';

const CHROME = "import type { ChromeProps } from '@/briques/chrome';\nexport default function Chrome({ children }: ChromeProps) { return <main>{children}</main>; }\n";
const PAGE = "import { PUBLIC } from '@/lib/acces';\nimport { Body, Equator, Ecliptic, GeoVector } from 'astronomy-engine';\nexport const acces = PUBLIC;\n"
  + "export default function Ciel() { const lon = Ecliptic(GeoVector(Body.Sun, new Date(Date.UTC(1990, 5, 21, 12)), true)).elon; void Equator; return <h1>Soleil {lon.toFixed(1)}</h1>; }\n";

describe.runIf(process.env.VAVI_BATIR === 'oui')('un paquet ajouté, construit pour de vrai', () => {
  it('add_packages → apply_changes → build_preview vert', async () => {
    const c: Contexte = {
      compte: 'aaaaaaaa-0000-4000-8000-00000000000a', projets: desProjetsEnMemoire(), magasin: unMagasinEnMemoire(), adresse: 'https://vavi.test',
      permis: lesPaquetsDuGabarit(readFileSync(join(__dirname, '../../squelette/gabarit/package.json'), 'utf8')), refusPrecedents: new Map<string, Refus>(),
      scellerUnSecret: () => 's', construire: construireLApp, preRendre: async () => null,
      base: { rpc: async (f: string, a: Record<string, unknown>) => ({ data: f === 'create_app_schema' ? schemaDuProjet(String(a.project_id)) : null, error: null }) },
    };
    const jouer = async (nom: string, args: Record<string, unknown>) => {
      const r = await appelerUnOutil(c, nom, args);
      if (!r.connu || 'invalide' in r || 'refuse' in r.rendu) throw new Error(`${nom} : ${JSON.stringify(r)}`);
      return r.rendu as Record<string, unknown>;
    };
    const p = await jouer('create_project', { app_json: JSON.parse(derive('app.json', unManifeste({ nature: 'site', nom: 'Le ciel' }))) });
    const ch = await jouer('ouvrir_chantier', { project: p.project, intention: 'le thème astral' });
    const w = { project: p.project, work_session: ch.work_session };
    const a = await jouer('add_packages', { ...w, packages: [{ name: 'astronomy-engine', version: '2.1.19' }] });
    expect(a.added).toEqual({ 'astronomy-engine': '2.1.19' });
    await jouer('apply_changes', { ...w, why: 'le ciel', changes: [{ path: 'src/Chrome.tsx', content: CHROME }, { path: 'src/pages/index.tsx', content: PAGE }] });
    const b = await jouer('build_preview', { project: p.project });
    expect(b.green, JSON.stringify(b)).toBe(true);
  }, 600_000);
});
