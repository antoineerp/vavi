/** Écrit les migrations depuis leurs sources (le socle, `lib/relais` ; les projets, `lib/projets`). npx tsx scripts/ecrire-la-migration-du-socle.ts */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { CHEMIN_DE_LA_MIGRATION_DU_SOCLE, laMigrationDuSocle } from '../lib/relais/le-socle-de-la-base';
import { CHEMIN_DE_LA_MIGRATION_DES_PROJETS, laMigrationDesProjets } from '../lib/projets/le-sql-des-projets';

for (const [chemin, texte] of [[CHEMIN_DE_LA_MIGRATION_DU_SOCLE, laMigrationDuSocle()], [CHEMIN_DE_LA_MIGRATION_DES_PROJETS, laMigrationDesProjets()]] as const) {
  mkdirSync(dirname(chemin), { recursive: true });
  writeFileSync(chemin, texte);
  console.log(`écrit : ${chemin}`);
}
