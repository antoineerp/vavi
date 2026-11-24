/**
 * Les règles de design sont des données : uniques, sans recouvrement, sans métier ni chiffre, et ce qu'elles nomment
 * existe (repris de constructor-v13@5bb786e : test/generateur-v2/les-gardes.test.ts, parties 2, 3, 4 et 7). Un contrôle
 * nommé n'existe pas encore dans vavi : il est dans la liste des contrôles à reprendre, et le test le dit.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REGLES } from '@/lib/design/regles/toutes';
import { CONTROLES_A_REPRENDRE } from '@/lib/design/regles/regle';
import { POLICES } from '@/lib/backend/fige/polices';
import { DOSSIER_DU_GABARIT, fichiersFiges } from '@/squelette/registre';

const horsDuCode = (t: string) => t.replace(/`[^`]*`/g, '');
const mots = (t: string) => new Set(horsDuCode(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z]+/).filter((m) => m.length > 3));
/** Des mots de métier et de domaine : un seul suffit à refuser le texte. La liste vit ici, dans le test, jamais dans vavi. */
const METIER = ['carburant', 'vehicule', 'facture', 'frais', 'audit', 'qualiopi', 'chantier', 'menuiserie', 'bois',
  'patient', 'osteopathe', 'restaurant', 'plat', 'expedie', 'hotel', 'avocat', 'banque', 'releve', 'fleur', 'formation',
  'conformite', 'flotte', 'suisse', 'immobilier', 'ecole', 'eleve', 'velo', 'magicien', 'mariage'];

describe('les règles sont des données, sans doublon', () => {
  it('chaque identifiant est unique', () => {
    const ids = REGLES.map((r) => r.id);
    expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([]);
  });
  it('aucune paire de règles ne se recouvre à plus de la moitié de ses mots', () => {
    const recouvrements: string[] = [];
    for (let i = 0; i < REGLES.length; i++) for (let j = i + 1; j < REGLES.length; j++) {
      const a = mots(REGLES[i]!.texte); const b = mots(REGLES[j]!.texte);
      const communs = [...a].filter((m) => b.has(m)).length;
      if (communs / Math.min(a.size, b.size) > 0.5) recouvrements.push(`${REGLES[i]!.id} ~ ${REGLES[j]!.id}`);
    }
    expect(recouvrements).toEqual([]);
  });
  it('aucune ne nomme un métier ni n’écrit un chiffre hors du code', () => {
    expect(REGLES.flatMap((r) => [...mots(r.texte)].filter((m) => METIER.includes(m)).map((m) => `${r.id} : ${m}`))).toEqual([]);
    expect(REGLES.filter((r) => /\d/.test(horsDuCode(r.texte))).map((r) => r.id)).toEqual([]);
  });
});

describe('ce qu’une règle nomme existe', () => {
  it('un fichier figé nommé est un fichier du squelette', () => {
    const figes = new Set(fichiersFiges().map((f) => f.chemin));
    expect(REGLES.filter((r) => r.tenuePar && 'fige' in r.tenuePar && !figes.has(r.tenuePar.fige)).map((r) => r.id)).toEqual([]);
  });
  it('un contrôle nommé est à reprendre, et chaque contrôle à reprendre tient au moins une règle', () => {
    const nommes = new Set(REGLES.flatMap((r) => (r.tenuePar && 'controle' in r.tenuePar ? [r.tenuePar.controle] : [])));
    expect([...nommes].filter((c) => !(CONTROLES_A_REPRENDRE as readonly string[]).includes(c))).toEqual([]);
    expect(CONTROLES_A_REPRENDRE.filter((c) => !nommes.has(c))).toEqual([]);
  });
  it('chaque module `@/…` qu’une règle cite est dans le squelette', () => {
    const cites = REGLES.flatMap((r) => [...r.texte.matchAll(/`@\/([a-z/*-]+)`/g)].map((m) => [r.id, m[1]!] as const));
    const absents = cites.filter(([, m]) => {
      const base = join(DOSSIER_DU_GABARIT, 'src', m.replace(/\/\*$/, ''));
      return !(existsSync(base) || existsSync(`${base}.ts`) || existsSync(`${base}.tsx`));
    });
    expect(absents).toEqual([]);
  });
  it('chaque police du catalogue est un paquet du gabarit, et le gabarit n’en livre pas d’autre', () => {
    const deps = Object.keys((JSON.parse(readFileSync(join(DOSSIER_DU_GABARIT, 'package.json'), 'utf8')) as { dependencies: Record<string, string> }).dependencies);
    expect(deps.filter((d) => d.startsWith('@fontsource')).sort()).toEqual([...POLICES.values()].map((p) => p.paquet).sort());
  });
});
