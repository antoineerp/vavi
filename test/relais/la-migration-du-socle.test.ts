import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CHEMIN_DE_LA_MIGRATION_DU_SOCLE, laMigrationDuSocle } from '@/lib/relais/le-socle-de-la-base';

describe('la migration du socle', () => {
  it('est exactement celle que sa source écrit (sinon : npx tsx scripts/ecrire-la-migration-du-socle.ts)', () => {
    expect(readFileSync(join(__dirname, '../..', CHEMIN_DE_LA_MIGRATION_DU_SOCLE), 'utf8')).toBe(laMigrationDuSocle());
  });
  it('ne donne exec_sql ni create_app_schema qu’à service_role', () => {
    const sql = laMigrationDuSocle();
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.exec_sql\(TEXT\) TO service_role;/);
    expect(sql).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.exec_sql\(TEXT\) TO [^;]*(anon|authenticated)/);
    expect(sql).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.create_app_schema\(UUID\) TO [^;]*(anon|authenticated)/);
  });
});
