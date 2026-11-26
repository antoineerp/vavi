/**
 * LE LANGAGE VISUEL ET LA DIRECTION RÉDIGÉE (Antoine, 26/11 : « on a perdu beaucoup de qualité design ») : Claude reçoit,
 * avant `create_project`, comment écrire la direction, et avec le projet, sa direction, le langage commun et le style du
 * registre qu'il a choisi. Ce qui manquait avant : six phrases de guide et une direction choisie sans aucune consigne.
 */
import { describe, expect, it } from 'vitest';
import { leGuideAvantLeProjet, leGuideDeDesign } from '@/lib/design/le-guide';
import { CE_QUI_TRAHIT, LE_LANGAGE, PAR_REGISTRE, leLangageDe } from '@/lib/design/le-langage';
import { lesEffets, poserLesJetons, jetonsDeLaPeau, contraste } from '@/lib/design/la-peau';
import { Direction, lireLeManifeste } from '@/lib/backend/app/manifeste';
import { EXEMPLE_D_APP_JSON } from '@/lib/backend/app/l-exemple-d-app-json';
import { readFileSync } from 'node:fs';
import { unManifeste } from '../aides/un-manifeste';

const METIER = ['carburant', 'vehicule', 'facture', 'audit', 'restaurant', 'hotel', 'avocat', 'banque', 'fleur', 'formation', 'mariage',
  'food', 'hospitality', 'finance', 'health', 'sport', 'music', 'children', 'wood', 'jewellery', 'perfume', 'fashion', 'wine'];

describe('le langage visuel', () => {
  it('ne nomme aucun métier : il parle d’ambiance et de forme, pour toutes les apps', () => {
    const tout = [...LE_LANGAGE, ...CE_QUI_TRAHIT, ...Object.values(PAR_REGISTRE), ...leGuideAvantLeProjet().direction].join(' ').toLowerCase();
    expect(METIER.filter((m) => new RegExp(`\\b${m}\\b`).test(tout))).toEqual([]);
  });
  it('avant le projet : comment écrire la direction, le langage, le guide de la nature', () => {
    const g = leGuideAvantLeProjet('boutique');
    expect(g.direction.join(' ')).toMatch(/art director[\s\S]*Never violet[\s\S]*Space Grotesk is not proposed/);
    expect(g.langage.join(' ')).toMatch(/Typography is the design/);
    expect(g.guide.join(' ')).toMatch(/catalogue shows each product/);
  });
  it('avec le projet : sa direction rendue telle quelle, le langage et le seul style de son registre', () => {
    const m = unManifeste({ nature: 'site' });
    const intention = { signature: 'Une idée.', premierEcran: 'Une photo pleine page.' };
    const g = leGuideDeDesign({ ...m, direction: { ...m.direction, registre: 'narratif', intention } });
    expect(g.direction).toEqual(intention);
    expect(g.langage).toContain(PAR_REGISTRE.narratif);
    expect(g.langage).not.toContain(PAR_REGISTRE.catalogue);
    expect(leLangageDe({ ...m.direction, verre: false }).join(' ')).toMatch(/no glass/);
  });
  it('ce qui trahit un site généré (constructor-v13, 24/09) atteint Claude, chaque interdit avec son remplaçant', () => {
    const g = leGuideDeDesign(unManifeste({ nature: 'site' }));
    expect(g.langage).toEqual(expect.arrayContaining([...CE_QUI_TRAHIT]));
    expect(CE_QUI_TRAHIT.slice(1).every((l) => /instead/.test(l))).toBe(true);
    expect(CE_QUI_TRAHIT.join(' ')).toMatch(/full-width band in the accent colour[\s\S]*centred hero[\s\S]*counters[\s\S]*sparkles/);
  });
});

describe('la direction rédigée dans app.json', () => {
  it('un app.json d’avant (sans les champs du 26/11) se lit tel quel', () => {
    const d = Direction.parse({ couleurs: { fond: '#ffffff', texte: '#111111', accent: '#1f6f5c', surface: '#ffffff', bordure: '#dddddd' }, polices: { titres: 'Inter', texte: 'Inter' }, rayon: 'doux' });
    expect(d).toMatchObject({ mouvement: 'vivant', verre: true, degrade: true });
    expect(d.registre).toBeUndefined();
  });
  it('l’exemple d’app.json, direction complète comprise, est accepté', () => {
    expect(lireLeManifeste(EXEMPLE_D_APP_JSON).ok).toBe(true);
  });
  it('une seconde teinte violette non demandée est refusée, comme l’accent', () => {
    const r = Direction.safeParse({ couleurs: { fond: '#ffffff', texte: '#111111', accent: '#1f6f5c', surface: '#ffffff', bordure: '#dddddd', second: '#7c3aed' }, polices: { titres: 'Inter', texte: 'Inter' }, rayon: 'doux' });
    expect(r.success).toBe(false);
  });
});

describe('les effets de la peau', () => {
  const base = unManifeste({ nature: 'site' }).direction;
  it('le gabarit de tokens.css est rempli entier : aucun jeton laissé', () => {
    const gabarit = readFileSync('squelette/gabarit/src/styles/tokens.css', 'utf8');
    const css = poserLesJetons(gabarit, base);
    expect(css).not.toMatch(/__[A-Z_]+__/);
    expect(css).toMatch(/@utility texte-degrade[\s\S]*@utility verre[\s\S]*\.apparait/);
  });
  it('la direction règle les effets : sans verre, opaque ; sans dégradé, un aplat ; immobile, rien ne bouge', () => {
    const sans = lesEffets({ ...base, verre: false, degrade: false, mouvement: 'immobile' });
    expect(sans).not.toMatch(/backdrop-filter|linear-gradient|@keyframes|translateY/);
    expect(lesEffets(base)).toMatch(/linear-gradient[\s\S]*backdrop-filter[\s\S]*@keyframes vavi-apparait/);
  });
  it('la seconde teinte et la bande sombre se lisent : sur le fond, et sous le texte de la bande', () => {
    const j = jetonsDeLaPeau(base);
    expect(contraste(j.SECONDE_TEXTE!, base.couleurs.fond)).toBeGreaterThanOrEqual(4.5);
    expect(contraste(j.SUR_ANCRE!, j.ANCRE!)).toBeGreaterThanOrEqual(4.5);
    expect(contraste(j.SUR_ANCRE_ATTENUE!, j.ANCRE!)).toBeGreaterThanOrEqual(4.5);
  });
});
