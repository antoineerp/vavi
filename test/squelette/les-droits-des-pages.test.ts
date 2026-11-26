/**
 * Le public d'une page croisé avec l'`acces` de ses tables (`squelette/les-droits-des-pages.ts`, refonte du 26/11).
 * L'incident : Yokono, la carte du restaurant, page publique, lisait `plats`, que personne sans compte ne lisait ; rien
 * ne le disait avant que Claude essaie l'app. Chaque écart nomme la page, ce qui manque et ce qui le lève.
 */
import { describe, expect, it } from 'vitest';
import { lireLeManifeste, type Manifeste } from '@/lib/backend/app/manifeste';
import { lesEcartsDeDroit, lePublicDeLaPage } from '@/squelette/les-droits-des-pages';
import { DIRECTION } from '../aides/un-manifeste';

const champ = { nom: 'nom', libelle: 'Nom', type: 'texte', obligatoire: true };
const lire = (platsLire: string[]): Manifeste => {
  const r = lireLeManifeste({ version: 1, nom: 'Essai', description: 'Un essai.', langues: { principale: 'fr' }, direction: DIRECTION, nature: 'app',
    organisations: 'une',
    roles: [{ nom: 'gerant', libelle: 'Gérant', obtenu: 'proprietaire' }, { nom: 'serveur', libelle: 'Serveur', obtenu: 'invitation' }],
    tables: [
      { nom: 'plats', libelle: 'Plats', champs: [champ], acces: { lire: platsLire, creer: ['gerant'], modifier: ['gerant'], supprimer: ['gerant'], lignes: 'toutes' } },
      { nom: 'notes', libelle: 'Notes', champs: [champ], acces: { lire: ['gerant'], creer: ['gerant'], modifier: ['gerant'], supprimer: ['gerant'] } },
    ] });
  if (!r.ok) throw new Error(r.erreurs.join(' ; '));
  return r.manifeste;
};

const CARTE = "import { Lignes } from '@/lib/donnees';\nexport default function Carte() { return <Lignes table=\"plats\" rendu={() => null} />; }\n";
const files = (x: Record<string, string>) => new Map(Object.entries(x));

describe('le public d’une page et ses tables', () => {
  it('une page publique qui lit une table que personne sans compte ne lit est dite, avec `tous` pour la lever (Yokono)', () => {
    const e = lesEcartsDeDroit(lire(['gerant']), files({ 'src/pages/carte.tsx': CARTE }));
    expect(e).toHaveLength(1);
    expect(e[0]!.page).toBe('src/pages/carte.tsx');
    expect(e[0]!.geste).toContain('`tous`');
    expect(lesEcartsDeDroit(lire(['tous']), files({ 'src/pages/carte.tsx': CARTE }))).toEqual([]);
  });

  it('la table nommée par un composant que la page importe compte, et un rôle qui ne la lit pas est nommé', () => {
    const e = lesEcartsDeDroit(lire(['tous']), files({
      'src/pages/equipe.tsx': "import { Bloc } from '../Bloc';\nexport const acces = COMPTE;\nexport default function P() { return <Bloc />; }\n",
      'src/Bloc.tsx': "import { useLecture, useEcriture } from '@/lib/donnees';\nexport function Bloc() { useLecture('notes'); useEcriture('plats'); return null; }\n",
    }));
    expect(e.map((x) => x.fait).join(' | ')).toContain('`serveur`, who does not read `notes`');
    expect(e.map((x) => x.fait).join(' | ')).toContain('`serveur`, who can neither create');
    expect(e.every((x) => x.page === 'src/pages/equipe.tsx')).toBe(true);
  });

  it('une page réservée à ceux qui lisent et écrivent ne dit rien ; un rôle inconnu est dit', () => {
    const page = "export const acces = reserveA('gerant');\nexport default function P() { useLecture('notes'); useEcriture('plats'); return null; }\n";
    expect(lesEcartsDeDroit(lire(['gerant']), files({ 'src/pages/admin.tsx': page }))).toEqual([]);
    const e = lesEcartsDeDroit(lire(['gerant']), files({ 'src/pages/admin.tsx': "export const acces = reserveA('chef');\nexport default function P() { return null; }\n" }));
    expect(e[0]!.fait).toContain('`chef`');
  });

  it('lit l’accès déclaré : absent vaut public, une forme calculée n’est pas jugée', () => {
    expect(lePublicDeLaPage('export default 1')).toEqual({ nature: 'public' });
    expect(lePublicDeLaPage("export const acces = reserveA('a', 'b');")).toEqual({ nature: 'role', roles: ['a', 'b'] });
    expect(lePublicDeLaPage('export const acces = choisir();')).toBeNull();
  });
});
