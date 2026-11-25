/**
 * INCIDENT 25/11 (audit du pipeline) : chaque déploiement du gabarit rendait périmé le build de tous les projets, l'arbre
 * d'un projet étant posé sur le gabarit du jour. Décision d'Antoine : « Gabarit fixé par projet ». Sur le code d'avant,
 * `lArbreLu` n'existait pas et l'arbre suivait toujours le gabarit courant : l'empreinte d'un projet fixé changeait.
 */
import { describe, expect, it } from 'vitest';
import { derive } from '@/squelette/poser';
import { empreinteDuGabarit, leGabaritCourant, type Gabarit } from '@/squelette/registre';
import { lArbreDUnProjet } from '@/lib/projets/l-arbre-d-un-projet';
import { CHEMIN_DU_GABARIT, garderLeGabaritCourant, lArbreLu, laVersionFixee, leFichierDuGabarit } from '@/lib/projets/le-gabarit-du-projet';
import { unManifeste } from '../aides/un-manifeste';
import { unMagasinEnMemoire } from '../aides/un-magasin-en-memoire';

const APP = new Map([['app.json', derive('app.json', unManifeste({ nature: 'site', nom: 'Le port' }))], ['src/pages/index.tsx', 'export default function P() { return null; }']]);

/** Le gabarit d'hier : celui du jour, une brique changée depuis. */
function unGabaritDHier(): Gabarit {
  const fichiers = new Map(leGabaritCourant().fichiers);
  fichiers.set('src/main.tsx', `${fichiers.get('src/main.tsx')}\n// la version d'hier\n`);
  return { empreinte: empreinteDuGabarit(fichiers), fichiers };
}

describe('le gabarit fixé sur un projet', () => {
  it('un projet fixé sur une version passée garde son arbre, et donc son build, quand le gabarit du jour change', async () => {
    const hier = unGabaritDHier();
    const magasin = unMagasinEnMemoire();
    await magasin.poser(`gabarits/${hier.empreinte}.json`, Buffer.from(JSON.stringify(Object.fromEntries(hier.fichiers))), { type: 'application/json', cache: '' });
    const fixe = new Map([...APP, [CHEMIN_DU_GABARIT, leFichierDuGabarit(hier.empreinte)]]);
    const lu = await lArbreLu(fixe, magasin);
    expect(lu.lu && lu.empreinte).toBe((lArbreDUnProjet(fixe, hier) as { empreinte: string }).empreinte);
    expect(lu.lu && lu.empreinte).not.toBe((lArbreDUnProjet(fixe) as { empreinte: string }).empreinte);
    expect(lu.lu && lu.construit.get('src/main.tsx')).toContain("la version d'hier");
    expect(lu.repli).toBeUndefined();
  });

  it('une version illisible cède au gabarit du jour, et le dit ; rien n’est refusé', async () => {
    const fixe = new Map([...APP, [CHEMIN_DU_GABARIT, leFichierDuGabarit('0'.repeat(32))]]);
    const lu = await lArbreLu(fixe, unMagasinEnMemoire());
    expect(lu.lu).toBe(true);
    expect(lu.repli).toContain('could not be read');
    expect(lu.lu && lu.construit.get('src/main.tsx')).toBe(leGabaritCourant().fichiers.get('src/main.tsx'));
  });

  it('sans version fixée, le projet suit le gabarit du jour ; le gabarit du jour se garde une fois au magasin', async () => {
    expect(laVersionFixee(APP)).toBeNull();
    const lu = await lArbreLu(APP, null);
    expect(lu.lu && lu.empreinte).toBe((lArbreDUnProjet(APP) as { empreinte: string }).empreinte);
    const magasin = unMagasinEnMemoire();
    const v = await garderLeGabaritCourant(magasin);
    expect(v).toBe(leGabaritCourant().empreinte);
    const o = magasin.objets.get(`gabarits/${v}.json`);
    expect(o && empreinteDuGabarit(new Map(Object.entries(JSON.parse(o.octets.toString('utf8')) as Record<string, string>)))).toBe(v);
  });
});
