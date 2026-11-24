/**
 * Les gestes de la console, sur des projets en mémoire (la règle SQL est prouvée sur PostgreSQL réel dans test/projets/) :
 *  - « Revenir à cet état » ramène les fichiers en une version nouvelle, et désigne l'aperçu sur le build déjà vert de cet
 *    état sans rien reconstruire ; un état jamais construit le dit ;
 *  - « Publier » met en ligne l'aperçu regardé, seulement s'il est vert ; rien n'est publié sans aperçu.
 */
import { describe, expect, it } from 'vitest';
import { derive } from '@/squelette/poser';
import { schemaDuProjet } from '@/lib/relais/le-schema-d-une-app';
import { lArbreDUnProjet } from '@/lib/projets/l-arbre-d-un-projet';
import { empreinteDuFichier } from '@/lib/projets/les-empreintes';
import { lEtatDeLaMiseEnLigne, mettreLApercuEnLigne } from '@/lib/projets/la-mise-en-ligne';
import { revenirDepuisLaConsole } from '@/lib/versions/revenir';
import { desProjetsEnMemoire } from '../aides/des-projets-en-memoire';
import { unManifeste } from '../aides/un-manifeste';

const MOI = 'aaaaaaaa-0000-4000-8000-00000000000a';
const base = { rpc: async (f: string, a: Record<string, unknown>) => ({ data: f === 'create_app_schema' ? schemaDuProjet(String(a.project_id)) : null, error: null }) };

async function unProjet() {
  const projets = desProjetsEnMemoire();
  const p = await projets.creer(MOI, 'Café', derive('app.json', unManifeste({ nature: 'site', nom: 'Café' })));
  if (!p.lu) throw new Error(p.pourquoi);
  const id = p.valeur.id;
  await projets.appliquer(MOI, id, { chantier: null, attendus: { 'src/A.tsx': null }, ecrits: new Map([['src/A.tsx', 'un']]), supprimes: [], pourquoi: 'un' });
  const f = await projets.fichiers(MOI, id);
  if (!f.lu) throw new Error(f.pourquoi);
  const v2 = lArbreDUnProjet(f.valeur);
  if (!v2.lu) throw new Error('arbre');
  await projets.enregistrerUnBuild(MOI, id, { empreinte: v2.empreinte, vert: true, ecarts: [] });
  await projets.appliquer(MOI, id, { chantier: null, attendus: { 'src/A.tsx': empreinteDuFichier('un') }, ecrits: new Map([['src/A.tsx', 'deux']]), supprimes: [], pourquoi: 'deux' });
  return { projets, id, empreinteV2: v2.empreinte };
}

describe('revenir à cet état, depuis la console', () => {
  it('ramène les fichiers en une version nouvelle et désigne l’aperçu sur le build vert de cet état', async () => {
    const { projets, id, empreinteV2 } = await unProjet();
    const r = await revenirDepuisLaConsole({ compte: MOI, projets, base }, id, 2);
    expect(r).toMatchObject({ revenu: true, version: 4, apercu: 'designe' });
    const f = await projets.fichiers(MOI, id);
    expect(f.lu && f.valeur.get('src/A.tsx')).toBe('un');
    const p = await projets.lire(MOI, id);
    expect(p.lu && p.valeur?.apercuEmpreinte).toBe(empreinteV2);
  });
  it('un état jamais construit est ramené, et l’aperçu reste : il est à construire', async () => {
    const { projets, id } = await unProjet();
    const r = await revenirDepuisLaConsole({ compte: MOI, projets, base }, id, 1);
    expect(r).toMatchObject({ revenu: true, apercu: 'a_construire' });
    const p = await projets.lire(MOI, id);
    expect(p.lu && p.valeur?.apercuEmpreinte).toBeNull();
  });
  it('le projet d’un autre compte ne se ramène pas', async () => {
    const { projets, id } = await unProjet();
    expect(await revenirDepuisLaConsole({ compte: 'dddddddd-0000-4000-8000-00000000000d', projets, base }, id, 1)).toMatchObject({ revenu: false });
  });
});

describe('publier, depuis la console', () => {
  it('sans aperçu, rien à publier ; un aperçu vert se met en ligne ; l’état le dit', async () => {
    const { projets, id, empreinteV2 } = await unProjet();
    expect(await mettreLApercuEnLigne(projets, MOI, id)).toMatchObject({ publie: false, pourquoi: 'rien_a_publier' });
    await projets.publierLApercu(MOI, id, empreinteV2);
    const avant = await projets.lire(MOI, id);
    expect(avant.lu && avant.valeur && lEtatDeLaMiseEnLigne(avant.valeur)).toBe('a_publier');
    expect(await mettreLApercuEnLigne(projets, MOI, id)).toEqual({ publie: true, empreinte: empreinteV2 });
    const apres = await projets.lire(MOI, id);
    expect(apres.lu && apres.valeur && lEtatDeLaMiseEnLigne(apres.valeur)).toBe('en_ligne');
  });
  it('un aperçu dont le build n’est pas vert ne se met pas en ligne', async () => {
    const { projets, id } = await unProjet();
    await projets.publierLApercu(MOI, id, 'f'.repeat(64));
    expect(await mettreLApercuEnLigne(projets, MOI, id)).toMatchObject({ publie: false, pourquoi: 'build_rouge' });
  });
});
