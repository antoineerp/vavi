// Repris de constructor-v13@5bb786e : test/generateur-v2/un-postgres.ts (auth.users porte les colonnes que lit la plateforme)
/**
 * Un PostgreSQL réel pour un test : démarré dans un dossier jetable, avec ce que Supabase fournit à une app (le schéma
 * `auth`, `auth.uid()` lu dans la requête, les rôles `anon`, `authenticated` et `service_role`). Absent de la machine : `null`.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync, chmodSync } from 'node:fs';
import { join } from 'node:path';

export interface UnPostgres {
  /** Exécute en administrateur (la pose de la plateforme). */
  admin(sql: string): string;
  /** Exécute comme la plateforme (`service_role`, qui passe la RLS sans être administrateur). */
  service(sql: string): { ok: boolean; sortie: string };
  /** Exécute comme le navigateur : `anon`, ou `authenticated` avec ce compte. Rend la sortie, ou l'erreur levée. */
  comme(compte: string | null, sql: string): { ok: boolean; sortie: string };
  arreter(): void;
}

const BIN = existsSync('/usr/lib/postgresql') ? readdirSync('/usr/lib/postgresql').map((v) => `/usr/lib/postgresql/${v}/bin`).find((b) => existsSync(join(b, 'initdb'))) : undefined;
export const POSTGRES_PRESENT = Boolean(BIN) && process.getuid?.() === 0;
// En CI, un essai sur Postgres ne se saute jamais en silence : l'absence de Postgres est une panne de la porte.
if (process.env.VAVI_EXIGER_POSTGRES === 'oui' && !POSTGRES_PRESENT) throw new Error('PostgreSQL exigé (VAVI_EXIGER_POSTGRES=oui) : absent, ou les essais ne tournent pas en root');

export function demarrer(nom: string, port: number): UnPostgres {
  if (!BIN) throw new Error('PostgreSQL absent');
  const base = `/var/tmp/${nom}`;
  rmSync(base, { recursive: true, force: true });
  mkdirSync(join(base, 'sock'), { recursive: true });
  chmodSync(base, 0o777);
  try { execFileSync('id', ['-u', 'postgres'], { stdio: 'ignore' }); } catch { execFileSync('useradd', ['-m', 'postgres']); }
  execFileSync('chown', ['-R', 'postgres:postgres', base]);
  const su = (cmd: string): void => { execFileSync('su', ['postgres', '-c', cmd], { stdio: 'ignore' }); };
  su(`${BIN}/initdb -U postgres -A trust -D ${base}/data`);
  su(`${BIN}/pg_ctl -D ${base}/data -o "-p ${port} -k ${base}/sock -c listen_addresses=''" -l ${base}/pg.log -w start`);
  const psql = (sql: string): string => execFileSync('psql', ['-h', `${base}/sock`, '-p', String(port), '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-tAq'],
    { input: sql, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  psql(`create extension if not exists pgcrypto;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create table auth.users (id uuid primary key, email text, created_at timestamptz not null default now(), raw_user_meta_data jsonb, email_confirmed_at timestamptz);
create role authenticated nologin; create role anon nologin; create role service_role nologin bypassrls;
grant usage on schema auth to authenticated, anon, service_role;
grant select on auth.users to service_role;
grant execute on function auth.uid() to authenticated, anon, service_role;`);
  const essayer = (sql: string): { ok: boolean; sortie: string } => {
    try { return { ok: true, sortie: psql(sql) }; } catch (e) { return { ok: false, sortie: String((e as { stderr?: string }).stderr ?? e) }; }
  };
  return {
    admin: psql,
    service: (sql) => essayer(`set role service_role;\n${sql}`),
    comme(compte, sql) {
      const entete = compte ? `set role authenticated; set request.jwt.claim.sub = '${compte}';` : 'set role anon;';
      return essayer(`${entete}\n${sql}`);
    },
    arreter() { try { su(`${BIN}/pg_ctl -D ${base}/data -m fast stop`); } catch { /* déjà arrêté */ } rmSync(base, { recursive: true, force: true }); },
  };
}
