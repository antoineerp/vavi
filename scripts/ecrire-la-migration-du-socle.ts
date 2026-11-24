/** Écrit les migrations depuis leurs sources (le socle, `lib/relais` ; les projets, `lib/projets` ; la vente, `lib/vente` ; les formulaires, `lib/formulaires` ; Stripe Connect, `lib/stripe-connect` ; la conformité, `lib/conformite` ; les capacités, `lib/capacites`). npx tsx scripts/ecrire-la-migration-du-socle.ts */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { CHEMIN_DE_LA_MIGRATION_DU_SOCLE, laMigrationDuSocle } from '../lib/relais/le-socle-de-la-base';
import { CHEMIN_DE_LA_MIGRATION_DE_LA_VENTE, laMigrationDeLaVente } from '../lib/vente/le-sql-de-la-vente';
import { CHEMIN_DE_LA_MIGRATION_DES_FORMULAIRES, laMigrationDesFormulaires } from '../lib/formulaires/le-sql-des-formulaires';
import { CHEMIN_DE_LA_MIGRATION_DE_STRIPE_CONNECT, laMigrationDeStripeConnect } from '../lib/stripe-connect/le-sql-de-stripe-connect';
import { CHEMIN_DE_LA_MIGRATION_DES_CAPACITES, laMigrationDesCapacites } from '../lib/capacites/le-sql-des-capacites';
import { CHEMIN_DE_LA_MIGRATION_DE_LA_CONFORMITE, laMigrationDeLaConformite } from '../lib/conformite/le-sql-de-la-conformite';
import { CHEMIN_DE_LA_MIGRATION_DES_PROJETS, CHEMIN_DE_LA_MIGRATION_DE_LA_MISE_EN_LIGNE, laMigrationDesProjets, laMigrationDeLaMiseEnLigne } from '../lib/projets/le-sql-des-projets';

for (const [chemin, texte] of [[CHEMIN_DE_LA_MIGRATION_DU_SOCLE, laMigrationDuSocle()], [CHEMIN_DE_LA_MIGRATION_DES_PROJETS, laMigrationDesProjets()], [CHEMIN_DE_LA_MIGRATION_DE_LA_MISE_EN_LIGNE, laMigrationDeLaMiseEnLigne()], [CHEMIN_DE_LA_MIGRATION_DE_LA_VENTE, laMigrationDeLaVente()], [CHEMIN_DE_LA_MIGRATION_DES_FORMULAIRES, laMigrationDesFormulaires()], [CHEMIN_DE_LA_MIGRATION_DE_STRIPE_CONNECT, laMigrationDeStripeConnect()], [CHEMIN_DE_LA_MIGRATION_DE_LA_CONFORMITE, laMigrationDeLaConformite()], [CHEMIN_DE_LA_MIGRATION_DES_CAPACITES, laMigrationDesCapacites()]] as const) {
  mkdirSync(dirname(chemin), { recursive: true });
  writeFileSync(chemin, texte);
  console.log(`écrit : ${chemin}`);
}
