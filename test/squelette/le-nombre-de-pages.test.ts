/**
 * Antoine, 28/11 : « appliquer la règle de 4 pages minimum pour tous les sites web ». Un site ou une boutique à moins de
 * quatre pages publiques le reçoit avec son build vert (jamais un refus) ; une app métier n'est pas comptée ; le guide
 * et les consignes disent quatre pages, et plus « un site d'une page n'a pas de menu ».
 */
import { describe, expect, it } from 'vitest';
import { leGuideDeDesign } from '@/lib/design/le-guide';
import { INSTRUCTIONS_DU_SERVEUR as INSTRUCTIONS } from '@/lib/consignes/instructions';
import { lesPagesPubliques, lesPagesQuiManquent } from '@/squelette/le-nombre-de-pages';
import { unManifeste } from '../aides/un-manifeste';

const PUBLIQUE = "import { PUBLIC } from '@/lib/acces';\nexport const acces = PUBLIC;\nexport default function P() { return <h1>x</h1>; }\n";
const RESERVEE = "import { COMPTE } from '@/lib/acces';\nexport const acces = COMPTE;\nexport default function P() { return null; }\n";
const BOUTIQUE = unManifeste({ nature: 'boutique', fonctions: { panier: true },
  roles: [{ nom: 'gerant', libelle: 'Gérant', obtenu: 'proprietaire' }, { nom: 'client', libelle: 'Client', obtenu: 'inscription' }],
  tables: [{ nom: 'article', libelle: 'Articles', appartenance: 'publique', lecture: ['visiteur', 'client', 'gerant'], ecriture: ['gerant'],
    champs: [{ nom: 'nom', libelle: 'Nom', type: 'texte', obligatoire: true }, { nom: 'prix', libelle: 'Prix', type: 'montant', obligatoire: true }],
    vente: { prix: 'prix', libelle: 'nom' } }],
  vente: { pays: 'FR', devise: 'EUR', livraison: { pays: ['FR'], prix: 5 } } });
const APP = unManifeste({ nature: 'app', roles: [{ nom: 'gerant', libelle: 'Gérant', obtenu: 'proprietaire' }],
  tables: [{ nom: 'note', libelle: 'Notes', appartenance: 'personnelle', lecture: ['gerant'], ecriture: ['gerant'], champs: [{ nom: 'texte', libelle: 'Texte', type: 'texte' }] }] });
const SITE = unManifeste({ nature: 'site' });
const VITRINE_D_APP = unManifeste({ nature: 'app', roles: [{ nom: 'gerant', libelle: 'Gérant', obtenu: 'proprietaire' }, { nom: 'client', libelle: 'Client', obtenu: 'inscription' }],
  resultat: 'note', tables: [{ nom: 'note', libelle: 'Notes', appartenance: 'personnelle', lecture: ['client', 'gerant'], ecriture: ['client', 'gerant'],
    champs: [{ nom: 'texte', libelle: 'Texte', type: 'texte' }], exemples: [{ texte: 'Une note' }] }] });
const arbre = (pages: readonly string[], autres: Record<string, string> = {}) =>
  new Map<string, string>([...pages.map((p) => [`src/pages/${p}.tsx`, PUBLIQUE] as [string, string]), ...Object.entries(autres), ['src/Chrome.tsx', 'export default function C() { return null; }']]);

describe('quatre pages au moins pour un site', () => {
  it('compte les pages publiques, la fiche comprise, sans la page introuvable ni une page réservée', () => {
    expect(lesPagesPubliques(arbre(['index', 'contact', 'articles/$id', '404'], { 'src/pages/espace.tsx': RESERVEE }))).toEqual(['/', '/articles/:id', '/contact']);
  });
  it('un site ou une boutique de trois pages reçoit la page qui manque ; à quatre, rien', () => {
    const trois = arbre(['index', 'offre', 'contact']);
    expect(lesPagesQuiManquent(SITE, trois)).toEqual({ public_pages: ['/', '/contact', '/offre'], to_add: 1 });
    expect(lesPagesQuiManquent(BOUTIQUE, trois)?.to_add).toBe(1);
    expect(lesPagesQuiManquent(SITE, arbre(['index']))?.to_add).toBe(3);
    expect(lesPagesQuiManquent(SITE, arbre(['index', 'offre', 'approche', 'contact']))).toBeUndefined();
  });
  it('la vitrine d’une app est comptée (Antoine, 28/11 12h) ; une app privée ne l’est pas, ses écrans de travail non plus', () => {
    expect(lesPagesQuiManquent(VITRINE_D_APP, arbre(['index', 'contact'], { 'src/pages/espace.tsx': RESERVEE }))).toEqual({ public_pages: ['/', '/contact'], to_add: 2 });
    expect(lesPagesQuiManquent(APP, arbre(['index']))).toBeUndefined();
  });
  it('le guide d’un site et d’une boutique dit quatre pages, sans rien inventer ; les consignes ne parlent plus d’un site d’une page', () => {
    for (const m of [unManifeste({ nature: 'site' }), BOUTIQUE]) {
      const g = leGuideDeDesign(m).guide.join(' ');
      expect(g).toMatch(/at least four public pages[\s\S]*always a contact page[\s\S]*"to be completed" placeholder[\s\S]*never invented/);
      expect(g).not.toMatch(/one-page site/);
    }
    expect(leGuideDeDesign(APP).guide.join(' ')).not.toMatch(/four public pages/);
    expect(leGuideDeDesign(VITRINE_D_APP).guide.join(' ')).toMatch(/at least four public pages[\s\S]*prices only if the person gave them[\s\S]*never invented/);
    expect(INSTRUCTIONS).toMatch(/at least four public pages/);
    expect(INSTRUCTIONS).not.toMatch(/one-page site has no menu/);
  });
});
