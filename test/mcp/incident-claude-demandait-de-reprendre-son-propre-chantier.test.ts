/**
 * INCIDENT 25/11 (essai d'Antoine, « Cap Équipage ») : Claude trouvait le chantier d'une autre conversation, endormi
 * depuis une heure, et demandait à la personne s'il pouvait le reprendre. Le chantier est le sien : l'état du projet dit
 * de le reprendre, sans question. Rougit sur le code d'avant : l'état ne disait rien, le refus disait « Ask the person ».
 */
import { describe, expect, it } from 'vitest';
import { commentContinuer } from '@/lib/mcp/les-gestes';
import { CODES_DE_REFUS } from '@/lib/consignes';
import { MINUTES_DU_VERROU } from '@/lib/projets/le-sql-des-projets';

const T = Date.parse('2026-11-25T15:20:00Z');
const ilYa = (min: number) => new Date(T - min * 60_000).toISOString();

describe('un chantier trouvé ouvert', () => {
  it('endormi : relâché, repris sans rien demander', () => {
    expect(commentContinuer(ilYa(60), T)).toMatch(/^Idle for 60 min, so released: .*resume: true.*Nothing to ask the person\.$/);
    expect(commentContinuer(ilYa(MINUTES_DU_VERROU), T)).toMatch(/released/);
  });
  it('vivant : repris si la personne demande d’y travailler ici, une question seulement si sa demande le contredit', () => {
    const d = commentContinuer(ilYa(5), T);
    expect(d).toMatch(/Last change 5 min ago/);
    expect(d).toMatch(/resume: true/);
    expect(d).toMatch(/only if their request contradicts/);
  });
  it('le refus d’un chantier ouvert ne renvoie plus la décision à la personne', () => {
    expect(CODES_DE_REFUS.chantier_ouvert).not.toMatch(/Ask the person whether/);
    expect(CODES_DE_REFUS.chantier_ouvert).toMatch(/resume: true/);
  });
});
