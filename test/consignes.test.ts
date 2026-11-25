import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  INSTRUCTIONS, OUTILS, CODES_DE_REFUS, GUIDE, LANGUES, lesPrompts, unPrompt, refuser, suiteDeRefus,
  paquetInconnu, lesPaquetsDuGabarit, lesRessources, uneRessource,
} from '@/lib/consignes';

const gabarit = readFileSync(join(__dirname, '..', 'squelette/gabarit/package.json'), 'utf8');
const nomsCites = (t: string): string[] => [...t.matchAll(/`([a-z]+(?:_[a-z]+)+)`/g)].map((m) => m[1]!);
const codes = Object.keys(CODES_DE_REFUS);
const outils: readonly string[] = OUTILS;

describe('les instructions du serveur', () => {
  it('ne nomment que des outils du serveur ou des refus de la liste fermée', () => {
    const inconnus = nomsCites(INSTRUCTIONS).filter((n) => !outils.includes(n) && !codes.includes(n));
    expect(inconnus).toEqual([]);
  });
  it('restent courtes : ce qu’un outil refuse ne s’y répète pas', () => {
    expect(INSTRUCTIONS.split(/\s+/).length).toBeLessThanOrEqual(800);
  });
  it('disent de répondre dans la langue de la personne', () => {
    expect(INSTRUCTIONS).toMatch(/language they write in/);
  });
});

describe('les refus', () => {
  it('chaque geste par défaut ne nomme que des outils du serveur', () => {
    const inconnus = Object.values(CODES_DE_REFUS).flatMap(nomsCites).filter((n) => !outils.includes(n));
    expect(inconnus).toEqual([]);
  });
  it('un refus porte toujours son geste', () => {
    const r = refuser('conflit', 'src/App.tsx changed since version 3.', { fichiers: ['src/App.tsx'] });
    expect(r.geste).toBe(CODES_DE_REFUS.conflit);
    expect(r.fichiers).toEqual(['src/App.tsx']);
  });
  it('le même refus deux fois dit d’arrêter, un autre refus non (l’instrument discrimine)', () => {
    const a = refuser('build_rouge', 'x', { fichier: 'src/A.tsx', ligne: 3 });
    expect(suiteDeRefus(a, refuser('build_rouge', 'x', { fichier: 'src/A.tsx', ligne: 3 })).arreter).toBeDefined();
    expect(suiteDeRefus(a, refuser('build_rouge', 'y', { fichier: 'src/A.tsx', ligne: 4 })).arreter).toBeUndefined();
    expect(suiteDeRefus(null, a).arreter).toBeUndefined();
  });
  it('INCIDENT 25/11 — une autre erreur au même endroit n’est pas « le même refus » : Claude avance, il ne s’arrête pas', () => {
    const a = refuser('passage_introuvable', 'This passage is not in src/A.tsx: "un".', { fichier: 'src/A.tsx' });
    expect(suiteDeRefus(a, refuser('passage_introuvable', 'This passage is not in src/A.tsx: "deux".', { fichier: 'src/A.tsx' })).arreter).toBeUndefined();
  });
});

describe('les prompts', () => {
  it('existent dans chaque langue, avec les mêmes noms et arguments', () => {
    const formes = LANGUES.map((l) => JSON.stringify(lesPrompts(l).map((p) => [p.name, p.arguments.map((a) => a.name)])));
    expect(new Set(formes).size).toBe(1);
  });
  it('ne nomment que des outils du serveur', () => {
    for (const l of LANGUES) for (const p of lesPrompts(l)) {
      const r = unPrompt(p.name, Object.fromEntries(p.arguments.map((a) => [a.name, 'x'])), l);
      expect('messages' in r && nomsCites(r.messages[0].content.text).filter((n) => !outils.includes(n))).toEqual([]);
    }
  });
  it('portent la demande de la personne, et refusent un argument manquant', () => {
    const r = unPrompt('modifier', { projet: 'p1', demande: 'un bouton Réserver' }, 'fr');
    expect('messages' in r && r.messages[0].content.text).toMatch(/un bouton Réserver/);
    expect(unPrompt('modifier', { projet: 'p1' }, 'fr')).toEqual({ erreur: 'Missing argument(s): demande.' });
    expect(unPrompt('inconnu', {})).toHaveProperty('erreur');
  });
  it('une autre langue reçoit l’anglais et l’ordre de répondre dans la sienne', () => {
    const r = unPrompt('reprendre', { projet: 'p1' }, 'de');
    expect('messages' in r && r.messages[0].content.text).toMatch(/I am picking[\s\S]*code is "de"/);
  });
});

describe('le guide', () => {
  it('a les mêmes sept habitudes dans chaque langue', () => {
    for (const l of LANGUES) expect(GUIDE[l].match(/^\d\. /gm)?.length).toBe(7);
  });
  it('ne cite que des prompts qui existent dans sa langue', () => {
    for (const l of LANGUES) {
      const titres = lesPrompts(l).map((p) => p.title);
      const derniere = GUIDE[l].trim().split('\n').at(-1)!;
      const cites = [...derniere.matchAll(/\*\*([^*]+)\*\*/g)].map((m) => m[1]!);
      expect(cites.filter((t) => !titres.includes(t))).toEqual([]);
      expect(cites.length).toBe(3);
    }
  });
});

describe('les paquets du gabarit', () => {
  const permis = lesPaquetsDuGabarit(gabarit);
  it('se lisent du gabarit verrouillé', () => {
    expect(permis).toContain('react');
    expect(permis).toContain('lucide-react');
  });
  it('un paquet hors du gabarit est refusé à sa ligne ; les chemins locaux et les sous-chemins passent', () => {
    const texte = "import { useState } from 'react';\nimport { X } from '@/briques/X';\nimport z from 'radix-ui/dialog';\nimport axios from 'axios';\n";
    expect(paquetInconnu('src/A.tsx', texte, permis)).toMatchObject({ code: 'paquet_inconnu', fichier: 'src/A.tsx', ligne: 4 });
    expect(paquetInconnu('src/A.tsx', texte.replace(/import axios.*\n/, ''), permis)).toBeNull();
  });
});

describe('les ressources', () => {
  const ctx = { gabaritPackageJson: gabarit, noteDuChantier: async (id: string) => (id === 'p1' ? 'Fait : accueil. Reste : contact.' : null) };
  it('listent les capacités tirées du gabarit', async () => {
    expect(lesRessources().map((r) => r.uri)).toEqual(['vavi://capacites']);
    const r = await uneRessource('vavi://capacites', ctx);
    expect('contents' in r && r.contents[0]!.text).toMatch(/- react\n/);
  });
  it('rendent la note du chantier, ou disent qu’il n’y en a pas', async () => {
    const a = await uneRessource('vavi://projet/p1/chantier', ctx);
    const b = await uneRessource('vavi://projet/p2/chantier', ctx);
    expect('contents' in a && a.contents[0]!.text).toMatch(/Reste : contact/);
    expect('contents' in b && b.contents[0]!.text).toMatch(/No work session/);
    expect(await uneRessource('vavi://autre', ctx)).toHaveProperty('erreur');
  });
});

describe('les erreurs masquées (INCIDENT 25/11 : le refus du 24/11 avait disparu)', () => {
  it('ne refuse que la ligne NOUVELLE : une ligne déjà dans le fichier passe', async () => {
    const { uneErreurMasquee } = await import('@/lib/consignes');
    const avant = 'const v = (window as any).x;\nexport const a = 1;';
    expect(uneErreurMasquee('src/B.tsx', 'const v = (window as any).x;\nexport const a = 2;', avant)).toBeNull();
    expect(uneErreurMasquee('src/B.tsx', 'const v = (window as any).x;\nconst w = (document as any).y;', avant)).toMatchObject({ code: 'erreur_masquee', ligne: 2 });
    expect(uneErreurMasquee('src/B.css', '/* @ts-ignore */')).toBeNull();
  });
});
