/**
 * LE SOCLE DE LA BASE DE VAVI — ce qu'un projet Supabase neuf reçoit avant toute app, dans cet ordre.
 * Une seule autorité : ces chaînes. La migration `supabase/migrations/*_le_socle_de_vavi.sql` en est écrite par
 * `scripts/ecrire-la-migration-du-socle.ts`, et `test/relais.test.ts` refuse qu'elles divergent.
 */
import { SQL_DU_SCHEMA_D_UNE_APP } from './le-schema-d-une-app';
import { SQL_DU_RELAIS } from './le-relais';
import { SQL_DE_L_ORIGINE_DES_COMPTES } from './l-origine-des-comptes';
import { SQL_DE_LA_PLATEFORME_POUR_UN_COMPTE } from './la-plateforme-pour-un-compte';
import { SQL_D_AGIR_POUR_UN_COMPTE } from './agir-pour-un-compte';

export const CHEMIN_DE_LA_MIGRATION_DU_SOCLE = 'supabase/migrations/20261124000000_le_socle_de_vavi.sql';

export const SQL_DU_SOCLE: readonly { readonly nom: string; readonly sql: string }[] = [
  { nom: 'le schéma d’une app', sql: SQL_DU_SCHEMA_D_UNE_APP },
  { nom: 'l’origine des comptes', sql: SQL_DE_L_ORIGINE_DES_COMPTES },
  { nom: 'le relais', sql: SQL_DU_RELAIS },
  { nom: 'agir pour un compte', sql: SQL_D_AGIR_POUR_UN_COMPTE },
  { nom: 'la plateforme pour un compte', sql: SQL_DE_LA_PLATEFORME_POUR_UN_COMPTE },
];

/** PURE — le texte de la migration. */
export function laMigrationDuSocle(): string {
  return [
    '-- LE SOCLE DE LA BASE DE VAVI — écrit par scripts/ecrire-la-migration-du-socle.ts depuis lib/relais/le-socle-de-la-base.ts.',
    '-- Ne pas modifier à la main : modifier la source, puis relancer le script.',
    ...SQL_DU_SOCLE.map((p) => `\n-- ── ${p.nom}\n${p.sql.trim()}\n`),
  ].join('\n');
}
