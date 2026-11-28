/**
 * APPLIQUER LES MIGRATIONS DE LA BASE DE VAVI, AU DÉPLOIEMENT (Antoine, 28/11 : « il faut que tout cela se fasse de
 * manière automatique »). Avant le déploiement sur Fly, la CI applique les migrations de `supabase/migrations/` en
 * attente : dans l'ordre de leur nom, chacune dans UNE transaction avec sa trace dans `public.vavi_migrations` (nom,
 * empreinte). Une migration qui échoue arrête tout : rien d'elle n'est posé, le déploiement n'a pas lieu. Une migration
 * dont le fichier change (elles s'écrivent depuis leurs sources, `ecrire-la-migration-du-socle.ts`) se réapplique : elles
 * sont toutes rejouables (`create or replace`, `if not exists`, `on conflict`), ce que le test prouve sur toute la liste.
 *
 * Ce qui SUPPRIME des données (`drop table`, `drop column`, `drop schema`, `truncate`, `delete from`, hors du corps d'une
 * fonction) n'est jamais appliqué seul : la migration est refusée, sauf si elle porte la ligne
 * `-- vavi : suppression acceptée par Antoine le <date>`, posée après son oui.
 *
 * Sans `VAVI_BASE_URL` (le secret GitHub de la connexion à la base), rien n'est appliqué et c'est dit.
 * npx tsx scripts/appliquer-les-migrations.ts
 *
 * Ce qu'il remplace : les fichiers SQL qu'Antoine collait à la main dans Supabase (la migration du planning ne l'avait
 * pas été : l'écran affichait « Could not find the function »).
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface UneMigration { readonly nom: string; readonly sql: string; readonly empreinte: string }
export type Executer = (sql: string) => string;

export const TABLE_DES_MIGRATIONS = `CREATE TABLE IF NOT EXISTS public.vavi_migrations (
  nom TEXT PRIMARY KEY CHECK (nom ~ '^[0-9]{14}_[a-z0-9_]+\\.sql$'),
  empreinte TEXT NOT NULL,
  appliquee_le TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.vavi_migrations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vavi_migrations FROM PUBLIC;
DO $r$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN REVOKE ALL ON public.vavi_migrations FROM anon; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN REVOKE ALL ON public.vavi_migrations FROM authenticated; END IF;
END $r$;`;

const NOM = /^[0-9]{14}_[a-z0-9_]+\.sql$/;
export const ACCORD = /^--\s*vavi\s*:\s*suppression acceptée par Antoine le \S+/m;
const SUPPRIME = /\b(drop\s+table|drop\s+schema|drop\s+column|truncate|delete\s+from)\b/i;

/** PURE — l'empreinte d'une migration. */
export const empreinteDe = (sql: string): string => createHash('sha256').update(sql).digest('hex');

/** PURE — ce qui supprime des données dans une migration, hors du corps des fonctions et des commentaires ; `null` sinon. */
export function ceQuiSupprime(sql: string): string | null {
  const nu = sql.replace(/--[^\n]*/g, '').replace(/\bAS\s+\$(\w*)\$[\s\S]*?\$\1\$/gi, 'AS $corps$');
  const m = SUPPRIME.exec(nu);
  return m ? m[0].replace(/\s+/g, ' ') : null;
}

/** PURE — les migrations à appliquer, dans l'ordre : absentes de la trace, ou dont le fichier a changé. */
export function aAppliquer(toutes: readonly UneMigration[], appliquees: ReadonlyMap<string, string>): UneMigration[] {
  return [...toutes].sort((a, b) => a.nom.localeCompare(b.nom)).filter((m) => appliquees.get(m.nom) !== m.empreinte);
}

/** Les migrations du dépôt. */
export function lesMigrationsDuDepot(dossier = join(process.cwd(), 'supabase/migrations')): UneMigration[] {
  return readdirSync(dossier).filter((n) => NOM.test(n)).map((nom) => {
    const sql = readFileSync(join(dossier, nom), 'utf8');
    return { nom, sql, empreinte: empreinteDe(sql) };
  });
}

export type Bilan = { readonly ok: true; readonly appliquees: readonly string[] } | { readonly ok: false; readonly appliquees: readonly string[]; readonly arret: string; readonly pourquoi: string };

/** Applique ce qui est en attente ; s'arrête à la première qui échoue ou supprime sans accord. */
export function appliquer(executer: Executer, toutes: readonly UneMigration[]): Bilan {
  executer(TABLE_DES_MIGRATIONS);
  const lues = executer("SELECT nom || ' ' || empreinte FROM public.vavi_migrations;").split('\n').map((l) => l.trim()).filter(Boolean);
  const appliquees = new Map(lues.map((l) => l.split(' ') as [string, string]));
  const faites: string[] = [];
  for (const m of aAppliquer(toutes, appliquees)) {
    const supprime = ceQuiSupprime(m.sql);
    if (supprime && !ACCORD.test(m.sql)) {
      return { ok: false, appliquees: faites, arret: m.nom, pourquoi: `elle supprime des données (« ${supprime} ») : elle attend le oui d'Antoine, puis la ligne « -- vavi : suppression acceptée par Antoine le <date> »` };
    }
    try {
      executer(`BEGIN;\n${m.sql}\n;\nINSERT INTO public.vavi_migrations (nom, empreinte) VALUES ('${m.nom}', '${m.empreinte}')
  ON CONFLICT (nom) DO UPDATE SET empreinte = EXCLUDED.empreinte, appliquee_le = now();\nCOMMIT;`);
    } catch (e) {
      const dit = String((e as { stderr?: unknown }).stderr ?? (e as Error).message ?? e).trim().split('\n').slice(0, 6).join('\n');
      return { ok: false, appliquees: faites, arret: m.nom, pourquoi: dit };
    }
    faites.push(m.nom);
  }
  return { ok: true, appliquees: faites };
}

// La porte de la CI : `VAVI_BASE_URL` (la connexion « Session pooler » de Supabase), psql.
if (process.argv[1]?.endsWith('appliquer-les-migrations.ts')) {
  const url = process.env.VAVI_BASE_URL;
  if (!url) {
    console.log('::warning::VAVI_BASE_URL absent : aucune migration appliquée (à poser une fois dans les secrets GitHub du dépôt).');
    process.exit(0);
  }
  const executer: Executer = (sql) => execFileSync('psql', [url, '-v', 'ON_ERROR_STOP=1', '-X', '-tAq'], { input: sql, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  const bilan = appliquer(executer, lesMigrationsDuDepot());
  for (const n of bilan.appliquees) console.log(`appliquée : ${n}`);
  if (!bilan.ok) {
    console.log(`::error::migration ${bilan.arret} non appliquée, déploiement arrêté : ${bilan.pourquoi.replaceAll(url, '<base>')}`);
    process.exit(1);
  }
  console.log(bilan.appliquees.length ? `${bilan.appliquees.length} migration(s) appliquée(s).` : 'Aucune migration en attente.');
}
