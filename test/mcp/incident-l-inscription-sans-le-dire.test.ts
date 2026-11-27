/**
 * INCIDENT 27/11 (Antoine, app « Mes dépenses ») : bloqué à l'entrée de sa propre app, « ce courriel n'est pas encore
 * confirmé », sans savoir que la validation de l'adresse se règle dans la console. Claude ne le disait pas : rien ne le lui
 * disait. `configure_backend` le lui dit désormais quand on s'inscrit seul à l'app.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CE_QU_IL_FAUT_DIRE_DE_L_INSCRIPTION, onSInscrit } from '@/lib/mcp/les-gestes';

describe('INCIDENT 27/11 — la validation du courriel, dite à la personne', () => {
  it('seulement quand un rôle s’obtient seul (inscription, paiement)', () => {
    expect(onSInscrit({ roles: [{ nom: 'p', libelle: 'P', obtenu: 'proprietaire' }, { nom: 'm', libelle: 'M', obtenu: 'inscription' }] } as never)).toBe(true);
    expect(onSInscrit({ roles: [{ nom: 'c', libelle: 'C', obtenu: 'paiement' }] } as never)).toBe(true);
    expect(onSInscrit({ roles: [{ nom: 'p', libelle: 'P', obtenu: 'proprietaire' }, { nom: 'e', libelle: 'E', obtenu: 'invitation' }] } as never)).toBe(false);
  });
  it('configure_backend le rend à Claude, et nomme l’écran de la console', () => {
    expect(CE_QU_IL_FAUT_DIRE_DE_L_INSCRIPTION).toContain('Réglages > Fonctions');
    expect(readFileSync(join(process.cwd(), 'lib', 'mcp', 'les-gestes.ts'), 'utf8')).toContain('tell_the_person: CE_QU_IL_FAUT_DIRE_DE_L_INSCRIPTION');
  });
});
