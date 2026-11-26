/** Le jugement du relevé de la page rendue (26/11) : seuils purs, dits avec leur remplaçant, jamais sur un écran de travail. */
import { describe, expect, it } from 'vitest';
import { ceQuiTrahitLaPage, FORMES_QUI_TRAHISSENT } from '@/lib/design/ce-qui-trahit-la-page';
import { FORMES_RELEVEES } from '@/lib/seo/le-releve-de-la-page';
import { unManifeste } from '../aides/un-manifeste';

const vide = Object.fromEntries(FORMES_RELEVEES.map((id) => [id, { n: 0, exemple: '' }]));

describe('ce qui trahit la page rendue', () => {
  it('chaque forme relevée a son seuil, ses mots et son remplaçant, et rien d’autre', () => {
    expect(FORMES_QUI_TRAHISSENT.map((f) => f.id).sort()).toEqual([...FORMES_RELEVEES].sort());
    for (const f of FORMES_QUI_TRAHISSENT) expect(f.auLieu.length).toBeGreaterThan(20);
  });
  it('sous le seuil, rien ; au seuil, la forme dite avec son exemple et ce qui la remplace', () => {
    const site = unManifeste({ nature: 'site' });
    expect(ceQuiTrahitLaPage(site, vide)).toEqual([]);
    expect(ceQuiTrahitLaPage(site, { ...vide, 'chiffres-nus': { n: 2, exemple: '' } })).toEqual([]);
    const r = ceQuiTrahitLaPage(site, { ...vide, 'bande-d-appel': { n: 1, exemple: 'Prêt à commencer ?' } });
    expect(r).toHaveLength(1);
    expect(r[0]!.found).toContain('Prêt à commencer ?');
    expect(r[0]!.instead).toContain('AppelFinal');
  });
  it('rien sur une app sans vitrine publique, rien sans relevé', () => {
    const privee = unManifeste({ nature: 'app', roles: [{ nom: 'gerant', libelle: 'Gérant', obtenu: 'proprietaire' }],
      tables: [{ nom: 'note', libelle: 'Notes', appartenance: 'personnelle', lecture: ['gerant'], ecriture: ['gerant'], champs: [{ nom: 'texte', libelle: 'Texte', type: 'texte' }] }] });
    expect(ceQuiTrahitLaPage(unManifeste({ nature: 'site' }), null)).toEqual([]);
    const tout = Object.fromEntries(FORMES_RELEVEES.map((id) => [id, { n: 9, exemple: 'x' }]));
    expect(ceQuiTrahitLaPage(unManifeste({ nature: 'site' }), tout)).toHaveLength(FORMES_RELEVEES.length);
    expect(ceQuiTrahitLaPage(privee, tout)).toEqual([]);
  });
});
