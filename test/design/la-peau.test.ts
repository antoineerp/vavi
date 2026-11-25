/**
 * La peau : la direction d'app.json choisit, le calcul garantit la lecture (4,5 pour 1 sur le fond et sur la surface),
 * quelle que soit la direction. Les exemples de design : chaque capture du catalogue est livrée avec vavi.
 */
import { describe, expect, it } from 'vitest';
import { contraste, jetonsDeLaPeau } from '@/lib/design/la-peau';
import { unManifeste } from '../aides/un-manifeste';

const hex = (n: number) => `#${(n & 0xffffff).toString(16).padStart(6, '0')}`;
/** Un tirage déterministe : le même à chaque essai. */
function* tirages(graine: number) { let x = graine; for (;;) { x = (x * 1103515245 + 12345) & 0x7fffffff; yield x; } }

describe('la peau', () => {
  it('sur 300 directions tirées au hasard, dès qu’une couleur peut s’y lire, le texte, le texte atténué, l’accent en texte et le danger se lisent', () => {
    const t = tirages(7);
    const illisibles: string[] = [];
    for (let i = 0; i < 300; i++) {
      const fond = t.next().value! & 0xffffff;
      // La surface est voisine du fond (une carte posée dessus), comme dans toute direction.
      const surface = [16, 8, 0].reduce((s, d) => s | (Math.max(0, Math.min(255, ((fond >> d) & 0xff) + (t.next().value! % 25) - 12)) << d), 0);
      const couleurs = { fond: hex(fond), texte: hex(t.next().value!), accent: hex(t.next().value!), surface: hex(surface), bordure: hex(t.next().value!) };
      const j = jetonsDeLaPeau({ couleurs, polices: { titres: 'Inter', texte: 'Inter' }, rayon: 'doux' } as never);
      // Près du ton où le blanc et le noir se valent, un fond et sa surface peuvent n'admettre aucune couleur lisible sur
      // les deux : rien à garantir alors. Partout ailleurs, chaque jeton de texte se lit.
      if (!['#ffffff', '#000000'].some((x) => contraste(x, couleurs.fond) >= 4.5 && contraste(x, couleurs.surface) >= 4.5)) continue;
      for (const cle of ['TEXTE', 'TEXTE_ATTENUE', 'ACCENT_TEXTE', 'DANGER'] as const) {
        for (const fond of [couleurs.fond, couleurs.surface]) if (contraste(j[cle]!, fond) < 4.5) illisibles.push(`${cle} ${j[cle]} sur ${fond}`);
      }
    }
    expect(illisibles).toEqual([]);
  });
  it('une direction lisible garde ses couleurs', () => {
    const j = jetonsDeLaPeau(unManifeste({ nature: 'site' }).direction);
    expect(j.TEXTE).toBe('#111111');
    expect(j.ACCENT).toBe('#1f6f5c');
    expect(j.SUR_ACCENT).toBe('#ffffff');
  });
});

const BOUTIQUE = { nature: 'boutique', fonctions: { panier: true },
  roles: [{ nom: 'gerant', libelle: 'Gérant', obtenu: 'proprietaire' }, { nom: 'client', libelle: 'Client', obtenu: 'inscription' }],
  tables: [{ nom: 'article', libelle: 'Articles', appartenance: 'publique', lecture: ['visiteur', 'client', 'gerant'], ecriture: ['gerant'],
    champs: [{ nom: 'nom', libelle: 'Nom', type: 'texte', obligatoire: true }, { nom: 'prix', libelle: 'Prix', type: 'montant', obligatoire: true }],
    vente: { prix: 'prix', libelle: 'nom' } }],
  vente: { pays: 'FR', devise: 'EUR', livraison: { pays: ['FR'], prix: 5 } } };
