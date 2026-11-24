/**
 * Le squelette posé depuis app.json : le gabarit copié tel quel, cinq fichiers dérivés, rien d'autre ; et une app ne
 * garde du figé que ce qu'elle tire (repris de constructor-v13@5bb786e : test/generateur-v2/ce-que-l-app-tire.test.ts,
 * sans l'essai de la boucle, qui n'existe pas dans vavi).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Manifeste } from '@/lib/backend/app/manifeste';
import { ceQueLAppTire, poserLeFige } from '@/squelette/poser';
import { DOSSIER_DU_GABARIT, estFige, fichiersFiges } from '@/squelette/registre';
import { unManifeste } from '../aides/un-manifeste';

const ACCUEIL = "import { PUBLIC } from '@/lib/acces';\nimport { Ouverture } from '@/briques/vitrine';\nexport const acces = PUBLIC;\nexport default function A() { return <Ouverture />; }\n";
const avecLAgent = (m: Manifeste, fichiers: Record<string, string>): Map<string, string> => {
  const a = poserLeFige(m);
  for (const [c, x] of Object.entries(fichiers)) a.set(c, x);
  return a;
};

describe('le figé posé depuis app.json', () => {
  const m = unManifeste({ nature: 'site', nom: 'Café « Les Arcs » & co' });
  const fige = poserLeFige(m);

  it('le gabarit est lu dans vavi, et chaque fichier copié l’est octet pour octet', () => {
    expect(DOSSIER_DU_GABARIT).toBe(join(process.cwd(), 'squelette', 'gabarit'));
    for (const f of fichiersFiges().filter((x) => !x.derive)) {
      expect(fige.get(f.chemin), f.chemin).toBe(readFileSync(join(DOSSIER_DU_GABARIT, f.chemin), 'utf8'));
    }
  });

  it('les fichiers dérivés ne gardent aucun repère du gabarit, et disent l’app', () => {
    for (const c of ['app.json', 'index.html', 'package.json', 'src/styles/tokens.css', 'src/donnees/types.ts']) {
      expect(fige.get(c), c).toBeDefined();
      expect(fige.get(c)!, c).not.toMatch(/__[A-Z_]+__|\/\*__POLICES__\*\//);
    }
    expect(JSON.parse(fige.get('app.json')!)).toEqual(m);
    expect(JSON.parse(fige.get('package.json')!).name).toBe('cafe-les-arcs-co');
    expect(fige.get('index.html')).toContain('<title>Café « Les Arcs » &amp; co</title>');
    expect(fige.get('src/styles/tokens.css')).toContain('#1f6f5c');
  });

  it('ce que l’agent écrit n’est jamais figé : ses pages et son chrome sont à lui', () => {
    expect(estFige('src/Chrome.tsx')).toBe(false);
    expect(estFige('src/pages/index.tsx')).toBe(false);
    expect(estFige('src/lib/donnees.tsx')).toBe(true);
  });
});

describe('ce que l’app tire du figé', () => {
  it('un site : ni panier, ni équipe, ni coffre, ni agent ; le noyau, ses fichiers et ceux de l’agent restent', () => {
    const m = unManifeste({ nature: 'site' });
    const tire = ceQueLAppTire(avecLAgent(m, { 'src/pages/index.tsx': ACCUEIL, 'src/Chrome.tsx': 'export default function C() { return null; }', 'public/logo.svg': '<svg/>' }), m);
    for (const c of ['src/briques/pieces/panier.tsx', 'src/briques/Agent.tsx', 'src/briques/Coffre.tsx', 'src/briques/AccesPaye.tsx', 'src/lib/capacites.ts']) expect(tire.has(c), c).toBe(false);
    for (const c of ['app.json', 'package.json', 'index.html', 'vite.config.ts', 'src/main.tsx', 'src/routes.tsx', 'src/briques/vitrine.tsx', 'src/styles/tokens.css',
      'src/lib/faits.ts', 'src/vite-env.d.ts', 'src/pages/index.tsx', 'src/Chrome.tsx', 'public/logo.svg',
      'src/briques/pieces/mentions-legales.tsx', 'src/briques/pieces/confidentialite.tsx']) expect(tire.has(c), c).toBe(true);
    expect(tire.size).toBeLessThan(poserLeFige(m).size);
  });

  it('une boutique tire la pièce du panier qu’app.json offre ; une brique importée par l’agent est tirée avec ce qu’elle importe', () => {
    const m = unManifeste({ nature: 'boutique', fonctions: { panier: true },
      roles: [{ nom: 'gerant', libelle: 'Gérant', obtenu: 'proprietaire' }, { nom: 'client', libelle: 'Client', obtenu: 'inscription' }],
      tables: [{ nom: 'the', libelle: 'Thés', appartenance: 'publique', lecture: ['visiteur', 'client', 'gerant'], ecriture: ['gerant'],
        champs: [{ nom: 'nom', libelle: 'Nom', type: 'texte', obligatoire: true }, { nom: 'prix', libelle: 'Prix', type: 'montant', obligatoire: true }],
        vente: { prix: 'prix', libelle: 'nom' } }],
      vente: { pays: 'FR', devise: 'EUR', livraison: { pays: ['FR'], prix: 5 } } });
    const page = "import { AjouterAuPanier } from '../briques/AjouterAuPanier';\nexport default function P() { return <AjouterAuPanier />; }\n";
    const tire = ceQueLAppTire(avecLAgent(m, { 'src/pages/index.tsx': ACCUEIL, 'src/pages/article.tsx': page }), m);
    expect(tire.has('src/briques/pieces/panier.tsx')).toBe(true);
    expect(tire.has('src/briques/AjouterAuPanier.tsx')).toBe(true);
    expect(tire.has('src/lib/panier.ts')).toBe(true);
  });
});
