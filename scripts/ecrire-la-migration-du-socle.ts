/** Écrit les migrations depuis leurs sources (le socle, `lib/relais` ; les projets, `lib/projets` ; la vente et les commandes, `lib/vente` ; les formulaires, `lib/formulaires` ; Stripe Connect, `lib/stripe-connect` ; la conformité, `lib/conformite` ; les capacités et les pièces jointes, `lib/capacites` ; les abonnements, `lib/abonnements` ; l'administration, `lib/administration` ; l'export, `lib/export` ; l'accès MCP, `lib/mcp` ; le réveil des agents, `lib/agents` ; les données de la console, `lib/donnees`). npx tsx scripts/ecrire-la-migration-du-socle.ts */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { CHEMIN_DE_LA_MIGRATION_DU_SOCLE, CHEMIN_DE_LA_MIGRATION_DES_COMPTES_DES_APPS, CHEMIN_DE_LA_MIGRATION_DES_OCCUPATIONS, laMigrationDesComptesDesApps, laMigrationDesOccupations, laMigrationDuSocle } from '../lib/relais/le-socle-de-la-base';
import { CHEMIN_DE_LA_MIGRATION_DE_LA_VENTE, laMigrationDeLaVente } from '../lib/vente/le-sql-de-la-vente';
import { CHEMIN_DE_LA_MIGRATION_DES_FORMULAIRES, laMigrationDesFormulaires } from '../lib/formulaires/le-sql-des-formulaires';
import { CHEMIN_DE_LA_MIGRATION_DE_STRIPE_CONNECT, laMigrationDeStripeConnect } from '../lib/stripe-connect/le-sql-de-stripe-connect';
import { CHEMIN_DE_LA_MIGRATION_DES_CAPACITES, CHEMIN_DE_LA_MIGRATION_DES_PIECES, laMigrationDesCapacites, laMigrationDesPieces } from '../lib/capacites/le-sql-des-capacites';
import { SQL_DES_PIECES_ORPHELINES } from '../lib/capacites/les-pieces-orphelines';
import { CHEMIN_DE_LA_MIGRATION_DES_COMMANDES, laMigrationDesCommandes } from '../lib/vente/les-commandes';
import { CHEMIN_DE_LA_MIGRATION_DE_L_ACCES_PAYE, laMigrationDeLAccesPaye } from '../lib/vente/l-acces-paye';
import { CHEMIN_DE_LA_MIGRATION_DES_ABONNEMENTS, laMigrationDesAbonnements } from '../lib/abonnements/le-sql-des-abonnements';
import { CHEMIN_DE_LA_MIGRATION_DE_L_ADMINISTRATION, laMigrationDeLAdministration } from '../lib/administration/le-sql-de-l-administration';
import { CHEMIN_DE_LA_MIGRATION_DU_PREMIER_SITE, laMigrationDuPremierSite } from '../lib/administration/le-premier-site';
import { CHEMIN_DE_LA_MIGRATION_DE_L_EXPORT, laMigrationDeLExport } from '../lib/export/l-export';
import { CHEMIN_DE_LA_MIGRATION_DES_DONNEES, CHEMIN_DE_LA_MIGRATION_DU_PLANNING, laMigrationDesDonnees, laMigrationDuPlanning } from '../lib/donnees/le-sql-des-donnees';
import { CHEMIN_DE_LA_MIGRATION_DES_MEMBRES, laMigrationDesMembres } from '../lib/donnees/le-sql-des-membres';
import { CHEMIN_DE_LA_MIGRATION_DES_DOMAINES, CHEMIN_DE_LA_MIGRATION_DES_NOMS, laMigrationDesDomaines, laMigrationDesNoms } from '../lib/domaines/le-sql-des-domaines';
import { CHEMIN_DE_LA_MIGRATION_DE_L_ACCES, laMigrationDeLAcces } from '../lib/mcp/l-etat-de-l-acces';
import { CHEMIN_DE_LA_MIGRATION_DE_LA_CONFORMITE, SQL_DE_LA_CONFORMITE, laMigrationDeLaConformite } from '../lib/conformite/le-sql-de-la-conformite';
import { CHEMIN_DE_LA_MIGRATION_DES_PROJETS, CHEMIN_DE_LA_MIGRATION_DE_LA_MISE_EN_LIGNE, CHEMIN_DE_LA_MIGRATION_DES_REGLAGES, CHEMIN_DE_LA_MIGRATION_DES_NOTES, laMigrationDesProjets, laMigrationDeLaMiseEnLigne, laMigrationDesReglages, laMigrationDesNotes } from '../lib/projets/le-sql-des-projets';
import { CHEMIN_DE_LA_MIGRATION_DES_AGENTS, laMigrationDesAgents } from '../lib/agents/le-sql-des-agents';

for (const [chemin, texte] of [[CHEMIN_DE_LA_MIGRATION_DU_SOCLE, laMigrationDuSocle()], [CHEMIN_DE_LA_MIGRATION_DES_PROJETS, laMigrationDesProjets()], [CHEMIN_DE_LA_MIGRATION_DE_LA_MISE_EN_LIGNE, laMigrationDeLaMiseEnLigne()], [CHEMIN_DE_LA_MIGRATION_DE_LA_VENTE, laMigrationDeLaVente()], [CHEMIN_DE_LA_MIGRATION_DES_FORMULAIRES, laMigrationDesFormulaires()], [CHEMIN_DE_LA_MIGRATION_DE_STRIPE_CONNECT, laMigrationDeStripeConnect()], [CHEMIN_DE_LA_MIGRATION_DE_LA_CONFORMITE, laMigrationDeLaConformite()], [CHEMIN_DE_LA_MIGRATION_DES_CAPACITES, laMigrationDesCapacites()], [CHEMIN_DE_LA_MIGRATION_DES_PIECES, laMigrationDesPieces(SQL_DES_PIECES_ORPHELINES)], [CHEMIN_DE_LA_MIGRATION_DES_COMMANDES, laMigrationDesCommandes()], [CHEMIN_DE_LA_MIGRATION_DE_L_ACCES_PAYE, laMigrationDeLAccesPaye()], [CHEMIN_DE_LA_MIGRATION_DES_ABONNEMENTS, laMigrationDesAbonnements()], [CHEMIN_DE_LA_MIGRATION_DE_L_ADMINISTRATION, laMigrationDeLAdministration()], [CHEMIN_DE_LA_MIGRATION_DU_PREMIER_SITE, laMigrationDuPremierSite()], [CHEMIN_DE_LA_MIGRATION_DE_L_EXPORT, laMigrationDeLExport()], [CHEMIN_DE_LA_MIGRATION_DE_L_ACCES, laMigrationDeLAcces()], [CHEMIN_DE_LA_MIGRATION_DES_DONNEES, laMigrationDesDonnees()], [CHEMIN_DE_LA_MIGRATION_DES_MEMBRES, laMigrationDesMembres()], [CHEMIN_DE_LA_MIGRATION_DES_DOMAINES, laMigrationDesDomaines()], [CHEMIN_DE_LA_MIGRATION_DES_NOMS, laMigrationDesNoms()], [CHEMIN_DE_LA_MIGRATION_DES_REGLAGES, laMigrationDesReglages()], [CHEMIN_DE_LA_MIGRATION_DES_NOTES, laMigrationDesNotes()], [CHEMIN_DE_LA_MIGRATION_DES_AGENTS, laMigrationDesAgents()], [CHEMIN_DE_LA_MIGRATION_DES_OCCUPATIONS, laMigrationDesOccupations()], [CHEMIN_DE_LA_MIGRATION_DU_PLANNING, laMigrationDuPlanning()], [CHEMIN_DE_LA_MIGRATION_DES_COMPTES_DES_APPS, `${laMigrationDesComptesDesApps()}\n-- L'effacement d'un compte lit les comptes des apps (lib/conformite).\n${SQL_DE_LA_CONFORMITE.trim()}\n`]] as const) {
  mkdirSync(dirname(chemin), { recursive: true });
  writeFileSync(chemin, texte);
  console.log(`écrit : ${chemin}`);
}
