/** « Gérer le contenu » : l'apparence et le référencement changés par la personne, relus avant d'être écrits. */
import { describe, expect, it } from 'vitest';
import { avecLApparence, leReferencementRelu, leReferencementStocke, CHEMIN_DU_REFERENCEMENT } from '@/lib/contenus/le-contenu';
import { lArbreDUnProjet } from '@/lib/projets/l-arbre-d-un-projet';
import { NOTES } from '../donnees/une-app';

const APP_JSON = JSON.stringify(NOTES);
const COULEURS = { fond: '#ffffff', texte: '#111111', accent: '#6d28d9', surface: '#f5f5f5', bordure: '#e5e5e5' };

describe('gérer le contenu', () => {
  it('change la direction seule, les couleurs de la personne comprises (le violet aussi), et garde le reste d’app.json', () => {
    const r = avecLApparence(APP_JSON, { couleurs: COULEURS, polices: { titres: 'Inter', texte: 'Inter' }, rayon: 'rond' });
    expect(r.ok).toBe(true);
    const j = JSON.parse(r.ok ? r.texte : '{}');
    expect(j.direction).toMatchObject({ couleurs: COULEURS, rayon: 'rond', couleursDemandees: true });
    expect(j.tables).toEqual(NOTES.tables);
  });
  it('refuse une police inconnue ou un app.json illisible, sans rien écrire', () => {
    expect(avecLApparence(APP_JSON, { couleurs: COULEURS, polices: { titres: 'Comic Sans', texte: 'Inter' }, rayon: 'doux' }).ok).toBe(false);
    expect(avecLApparence('{ pas du json', { couleurs: COULEURS, polices: { titres: 'Inter', texte: 'Inter' }, rayon: 'doux' }).ok).toBe(false);
  });
  it('relit le référencement : adresses de page, longueurs bornées, le vide retiré', () => {
    expect(leReferencementRelu({ '/': { titre: ' Vélos à Lyon ', description: '' }, '/contact': { titre: '', description: '' } }))
      .toEqual({ ok: true, texte: `${JSON.stringify({ pages: { '/': { titre: 'Vélos à Lyon' } } }, null, 2)}\n` });
    expect(leReferencementRelu({ '/': { titre: 'x'.repeat(71) } }).ok).toBe(false);
    expect(leReferencementRelu({ 'javascript:alert(1)': { titre: 'x' } }).ok).toBe(false);
    expect(leReferencementStocke('pas du json')).toEqual({ pages: {} });
  });
  it('INCIDENT 25/11 — le référencement posé par la plateforme était remplacé par le fichier vide du gabarit', () => {
    const ref = `${JSON.stringify({ pages: { '/': { titre: 'Mon titre' } } })}\n`;
    const a = lArbreDUnProjet(new Map([['app.json', APP_JSON], [CHEMIN_DU_REFERENCEMENT, ref]]));
    expect(a.lu && a.fige.get(CHEMIN_DU_REFERENCEMENT)).not.toBe(ref);
    expect(a.lu && a.construit.get(CHEMIN_DU_REFERENCEMENT)).toBe(ref);
  });
});
