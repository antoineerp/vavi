/**
 * Ce que l'annuaire des connecteurs de Claude exige (claude.com/docs/connectors/building/review-criteria) et le lien
 * d'installation de la page /commencer (claude.com/docs/connectors/building/directory-vs-custom).
 */
import { describe, expect, it } from 'vitest';
import { lesOutils, DEFINITIONS_DE_LA_VUE } from '@/lib/mcp/les-outils';
import { lienDInstallation } from '@/lib/mcp/l-adresse';

const LECTURE = new Set(['list_projects', 'get_project_state', 'read_files', 'history', 'vavi_fiche_du_projet']);
/** Ce qui écrase ou retire ce qui existait : fichiers, déclaration des données, secret, version, site en ligne. */
const DESTRUCTEURS = new Set(['apply_changes', 'configure_backend', 'set_secret', 'rollback', 'abandonner_chantier', 'vavi_mettre_en_ligne']);

describe('l’annuaire des connecteurs', () => {
  it('chaque outil a un titre et ses annotations : lecture seule, ou destructeur s’il écrase', () => {
    for (const o of lesOutils()) {
      const a = (o as { annotations?: { title?: string; readOnlyHint?: boolean; destructiveHint?: boolean } }).annotations;
      expect(a?.title, o.name).toBeTruthy();
      expect(a?.readOnlyHint, o.name).toBe(LECTURE.has(o.name));
      expect(a?.destructiveHint, o.name).toBe(DESTRUCTEURS.has(o.name));
      expect(o.name.length, o.name).toBeLessThanOrEqual(64);
    }
    for (const vue of Object.keys(DEFINITIONS_DE_LA_VUE)) expect(lesOutils().some((o) => o.name === vue), vue).toBe(true);
  });

  it('le lien d’installation ouvre l’ajout du connecteur, nom et adresse remplis et encodés', () => {
    const lien = new URL(lienDInstallation('https://vavi.exemple/api/mcp'));
    expect(lien.origin + lien.pathname).toBe('https://claude.ai/customize/connectors');
    expect(lien.searchParams.get('modal')).toBe('add-custom-connector');
    expect(lien.searchParams.get('connectorName')).toBe('vavi');
    expect(lien.searchParams.get('connectorUrl')).toBe('https://vavi.exemple/api/mcp');
    expect(lienDInstallation('https://vavi.exemple/api/mcp')).toContain('connectorUrl=https%3A%2F%2Fvavi.exemple%2Fapi%2Fmcp');
  });
});
