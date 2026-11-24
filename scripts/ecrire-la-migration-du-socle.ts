/** Écrit la migration du socle depuis sa source (`lib/relais/le-socle-de-la-base.ts`). npx tsx scripts/ecrire-la-migration-du-socle.ts */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { CHEMIN_DE_LA_MIGRATION_DU_SOCLE, laMigrationDuSocle } from '../lib/relais/le-socle-de-la-base';

mkdirSync(dirname(CHEMIN_DE_LA_MIGRATION_DU_SOCLE), { recursive: true });
writeFileSync(CHEMIN_DE_LA_MIGRATION_DU_SOCLE, laMigrationDuSocle());
console.log(`écrit : ${CHEMIN_DE_LA_MIGRATION_DU_SOCLE}`);
