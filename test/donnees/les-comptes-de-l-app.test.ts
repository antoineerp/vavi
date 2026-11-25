/** Les comptes de l'app dans la console : chaque compte avec ses rôles (libellés d'app.json), les rôles non lus dits, un membre d'avant gardé. */
import { describe, expect, it } from 'vitest';
import { lesComptesAvecLeursRoles } from '@/lib/donnees/les-comptes-de-l-app';
import { laMigrationDesMembres, SQL_DES_MEMBRES } from '@/lib/donnees/le-sql-des-membres';

const A = '00000000-0000-4000-8000-00000000000a', B = '00000000-0000-4000-8000-00000000000b', V = '00000000-0000-4000-8000-00000000000c';
const COMPTES = [
  { id: A, email: 'ada@exemple.fr', confirmeLe: '2026-11-25T10:00:00Z', creeLe: '2026-11-25T09:00:00Z' },
  { id: B, email: 'bob@exemple.fr', confirmeLe: null, creeLe: '2026-11-25T11:00:00Z' },
];

describe('les comptes de l’app', () => {
  it('donne à chaque compte ses rôles par leur libellé, son état, et garde un membre né avant les comptes par app', () => {
    const r = lesComptesAvecLeursRoles(COMPTES, [
      { compte: A, email: 'ada@exemple.fr', role: 'responsable', depuis: '2026-11-25T10:00:00Z', expireLe: null },
      { compte: V, email: 'vieux@exemple.fr', role: 'salarie', depuis: '2026-11-01T10:00:00Z', expireLe: '2026-12-01T00:00:00Z' },
    ], new Set([A]), { responsable: 'Responsable', salarie: 'Salarié' });
    expect(r.map((x) => [x.email, x.confirme, x.connecte, x.roles.map((y) => y.libelle)])).toEqual([
      ['bob@exemple.fr', false, false, []],
      ['ada@exemple.fr', true, true, ['Responsable']],
      ['vieux@exemple.fr', true, false, ['Salarié']],
    ]);
    expect(r[2]!.roles[0]!.expireLe).toBe('2026-12-01T00:00:00Z');
  });
  it('sans la fonction des membres (base pas encore à jour), aucun rôle n’est inventé', () => {
    expect(lesComptesAvecLeursRoles(COMPTES, null, new Set(), {}).every((x) => x.roles.length === 0)).toBe(true);
  });
  it('la lecture des membres est réservée à la plateforme, le schéma validé avant d’être cité', () => {
    expect(SQL_DES_MEMBRES).toContain("p_schema !~ '^app_[a-z0-9_]{1,59}$'");
    expect(SQL_DES_MEMBRES).toContain('FROM PUBLIC, anon, authenticated');
    expect(SQL_DES_MEMBRES).toContain('TO service_role');
    expect(laMigrationDesMembres()).toContain('vavi_console_les_membres');
  });
});
