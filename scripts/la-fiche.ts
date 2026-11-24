/** Refait `squelette/la-fiche.md` depuis le gabarit : `npx tsx scripts/la-fiche.ts`. */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { lesVersionsDuGabarit } from '../lib/consignes/paquets';
import { laFicheDe } from '../squelette/la-fiche';
import { CHEMINS_EN_FICHE, CHEMIN_DE_LA_FICHE, DOSSIER_DU_GABARIT } from '../squelette/registre';

const fiche = laFicheDe(CHEMINS_EN_FICHE.map((c) => [c, readFileSync(join(DOSSIER_DU_GABARIT, c), 'utf8')] as const),
  lesVersionsDuGabarit(readFileSync(join(DOSSIER_DU_GABARIT, 'package.json'), 'utf8')));
writeFileSync(CHEMIN_DE_LA_FICHE, fiche);
console.log(`${CHEMIN_DE_LA_FICHE} : ${fiche.length} caractères`);
