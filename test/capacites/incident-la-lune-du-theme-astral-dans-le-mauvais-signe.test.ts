// Repris de constructor-v13@5bb786e : test/incident-la-lune-du-theme-astral-dans-le-mauvais-signe.test.ts (le ciel rendu ; la route et l'oracle restent à la voie D)
/**
 * ============================================================================
 * LA LUNE DU THÈME ASTRAL DANS LE MAUVAIS SIGNE (07/10, « Ciel Natal » — « personne n'a vérifié que le thème est juste »)
 * ============================================================================
 *
 * La voie neuve n'offrait aucune éphéméride : l'agent a écrit la sienne (`src/lib/ciel.ts`, éléments orbitaux approchés).
 * Mesurée contre la référence sur 200 naissances (1940–2010) : la LUNE dans le mauvais signe 177 fois — sa longitude
 * prise dans le plan de l'orbite, sans son nœud —, Pluton 5 fois. Et le bouton de l'accueil ne marchait pour aucun
 * visiteur : `lieu.chercher` exigeait un compte, la page publique n'en a pas.
 *
 * La plateforme REND le ciel (`ephemeride.theme`, capacité décidée à la commande, son module offert alors) ; le lieu et
 * le ciel servent l'app qui appelle, visiteur compris ; l'oracle tient l'appel d'une capacité décidée.
 * ⚠️ ROUGE AVANT : ni module, ni route, ni capacité « ephemeride » ; le lieu refusait un visiteur (401).
 */
import { describe, it, expect } from 'vitest';
import { leCielDUneNaissance, lireLEntreeDuCiel } from '@/lib/capacites/le-ciel-d-une-naissance';

const ecart = (a: number, b: number): number => Math.abs((((a - b) % 360) + 540) % 360 - 180);

describe('1 — le ciel rendu par la plateforme tient les cas PUBLIÉS (Meeus, Astronomical Algorithms)', () => {
  // 0 h TD ≈ 23 h 59 UT la veille (ΔT ≈ 59 s en 1992). Longitudes apparentes publiées, tolérance 0,01°.
  const CAS = [
    { source: 'Meeus, ex. 47.a — la Lune, 1992-04-12 0 h TD', date: '1992-04-11', corps: 'lune', attendu: 133.162655 },
    { source: 'Meeus, ex. 25.a — le Soleil, 1992-10-13 0 h TD', date: '1992-10-12', corps: 'soleil', attendu: 199.906106 },
    { source: 'Meeus, ex. 33.a — Vénus, 1992-12-20 0 h TD', date: '1992-12-19', corps: 'venus', attendu: 313.08102 },
  ] as const;
  for (const c of CAS) {
    it(c.source, async () => {
      const r = await leCielDUneNaissance({ date: c.date, heure: '23:59', fuseau: 'UTC', latitude: 45.76, longitude: 4.84 });
      if (!r.ok) throw new Error(r.raison);
      const l = r.ciel.astres.find((a) => a.corps === c.corps)!.longitude;
      expect(ecart(l, c.attendu)).toBeLessThan(0.01);
    });
  }

  it('une naissance à Lyon : l’heure du LIEU devient un instant (heure d’été comprise), dix corps, ascendant, douze maisons', async () => {
    const r = await leCielDUneNaissance({ date: '1990-04-12', heure: '08:30', fuseau: 'Europe/Paris', latitude: 45.76, longitude: 4.84 });
    if (!r.ok) throw new Error(r.raison);
    expect(r.ciel.instant).toBe('1990-04-12T06:30:00.000Z');
    expect(r.ciel.astres.map((a) => a.corps)).toEqual(['soleil', 'lune', 'mercure', 'venus', 'mars', 'jupiter', 'saturne', 'uranus', 'neptune', 'pluton']);
    expect(r.ciel.maisons.cuspides).toHaveLength(12);
    expect(r.ciel.maisons.cuspides[0]).toBe(r.ciel.ascendant);
    expect(r.ciel.unite).toBe('degres');
  });

  it('sans fuseau, sans lieu : un REFUS qui nomme chaque manque — jamais une heure lue dans le fuseau du serveur', () => {
    const r = lireLEntreeDuCiel({ date: '1990-04-12', heure: '08:30' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.raison).toMatch(/fuseau.*latitude.*longitude/);
  });
});

