/**
 * Le texte réécrit par la personne dans l'aperçu (exception à la règle 4, décidée le 24/11) :
 *  - seul le passage désigné change, relu à sa place et à son texte ; ce qui l'entoure reste octet pour octet ;
 *  - un texte qui a bougé depuis le build, un fichier du cadre, un texte vide : refusé, rien n'est écrit ;
 *  - un texte que JSX lirait autrement (accolade, chevron) s'écrit en chaîne ; le build le relit à l'identique ;
 *  - pendant que Claude travaille (chantier ouvert), rien ne s'écrit ; sinon une version, puis l'aperçu rebâti.
 */
import { describe, expect, it } from 'vitest';
import { poserLesTextesSitues, textesDuCode } from '@/squelette/gabarit/src/lib/textes-situes';
import { lesPassagesDesignes, reecrireLesPassages } from '@/lib/contenus/les-textes';
import { reecrireUnTexte } from '@/lib/contenus/reecrire';
import { empreinteDuFichier } from '@/lib/projets/les-empreintes';
import { derive } from '@/squelette/poser';
import { desProjetsEnMemoire } from '../aides/des-projets-en-memoire';
import { unManifeste } from '../aides/un-manifeste';

const PAGE = `export default function Accueil() {\n  return (\n    <main>\n      <h1 className="grand">Nos thés du monde</h1>\n      <p>\n        Cueillis à la main,\n        livrés chez vous.\n      </p>\n    </main>\n  );\n}\n`;
/** Ce que l'aperçu renvoie pour l'élément qui porte ce texte : la valeur de son `data-texte`, posée au build. */
const situation = (code: string, fichier: string, texte: string): string => {
  const pose = poserLesTextesSitues(code, fichier)!;
  const t = textesDuCode(code).find((x) => x.texte === texte)!;
  const m = [...pose.matchAll(/data-texte="([^"]+)"/g)].map((x) => x[1]!).find((v) => v.includes(`:${t.debut}-${t.fin}`));
  return m!;
};

describe('les passages, relus puis réécrits', () => {
  const fichiers = new Map([['src/pages/Accueil.tsx', PAGE]]);
  it('seul le passage désigné change, à sa place', () => {
    const s = situation(PAGE, 'src/pages/Accueil.tsx', 'Nos thés du monde');
    const d = lesPassagesDesignes(fichiers, s);
    expect(d.lu && d.valeur.passages.map((p) => p.texte)).toEqual(['Nos thés du monde']);
    const r = reecrireLesPassages(PAGE, d.lu ? d.valeur.passages.map((p) => ({ ...p, apres: 'Nos thés choisis' })) : []);
    expect(r.lu && r.valeur).toBe(PAGE.replace('Nos thés du monde', 'Nos thés choisis'));
  });
  it('un texte sur plusieurs lignes se lit comme JSX le rend, et se réécrit en gardant ses espaces', () => {
    const s = situation(PAGE, 'src/pages/Accueil.tsx', 'Cueillis à la main, livrés chez vous.');
    const d = lesPassagesDesignes(fichiers, s);
    const r = reecrireLesPassages(PAGE, d.lu ? d.valeur.passages.map((p) => ({ ...p, apres: 'Cueillis le matin.' })) : []);
    expect(r.lu && r.valeur).toContain('<p>\n        Cueillis le matin.\n      </p>');
  });
  it('une accolade ou un chevron s’écrit en chaîne, relue à l’identique', () => {
    const s = situation(PAGE, 'src/pages/Accueil.tsx', 'Nos thés du monde');
    const d = lesPassagesDesignes(fichiers, s);
    const r = reecrireLesPassages(PAGE, d.lu ? d.valeur.passages.map((p) => ({ ...p, apres: 'Thés {rares} <et> fins & co' })) : []);
    expect(r.lu && textesDuCode(r.valeur).map((t) => t.texte)).toContain('Thés {rares} <et> fins & co');
  });
  it('un texte qui a bougé, un fichier du cadre, un texte vide : refusés', () => {
    const s = situation(PAGE, 'src/pages/Accueil.tsx', 'Nos thés du monde');
    const bouge = new Map([['src/pages/Accueil.tsx', `// une ligne de plus\n${PAGE}`]]);
    expect(lesPassagesDesignes(bouge, s)).toEqual({ lu: false, pourquoi: 'texte_change' });
    expect(lesPassagesDesignes(fichiers, 'src/main.tsx:1-5')).toEqual({ lu: false, pourquoi: 'fichier_du_cadre' });
    expect(lesPassagesDesignes(fichiers, '../x.tsx:1-5')).toEqual({ lu: false, pourquoi: 'designation_illisible' });
    const d = lesPassagesDesignes(fichiers, s);
    expect(reecrireLesPassages(PAGE, d.lu ? d.valeur.passages.map((p) => ({ ...p, apres: '  ' })) : [])).toEqual({ lu: false, pourquoi: 'texte_vide' });
    expect(reecrireLesPassages(PAGE, d.lu ? d.valeur.passages.map((p) => ({ ...p, texte: 'autre', apres: 'x y' })) : [])).toEqual({ lu: false, pourquoi: 'texte_change' });
  });
});

describe('le geste de la console', () => {
  const MOI = 'aaaaaaaa-0000-4000-8000-00000000000a';
  async function unProjet() {
    const projets = desProjetsEnMemoire();
    const p = await projets.creer(MOI, 'Le Thé', derive('app.json', unManifeste({ nature: 'site', nom: 'Le Thé' })));
    if (!p.lu) throw new Error(p.pourquoi);
    await projets.appliquer(MOI, p.valeur.id, { chantier: null, attendus: { 'src/pages/Accueil.tsx': null }, ecrits: new Map([['src/pages/Accueil.tsx', PAGE]]), supprimes: [], pourquoi: 'accueil' });
    return { projets, id: p.valeur.id };
  }
  const s = situation(PAGE, 'src/pages/Accueil.tsx', 'Nos thés du monde');

  it('écrit une version, puis rebâtit l’aperçu', async () => {
    const { projets, id } = await unProjet();
    const bati: string[] = [];
    const r = await reecrireUnTexte({ compte: MOI, projets, construire: async (x) => { bati.push(x); return { vert: true }; } }, id, s, ['Nos thés choisis']);
    expect(r).toEqual({ reecrit: true, version: 3, apercu: 'a_jour' });
    expect(bati).toEqual([id]);
    const f = await projets.fichiers(MOI, id);
    expect(f.lu && f.valeur.get('src/pages/Accueil.tsx')).toBe(PAGE.replace('Nos thés du monde', 'Nos thés choisis'));
  });
  // INCIDENT 25/11 (Antoine) : un texte réécrit dans la console était refusé tant que Claude travaillait. Décision : toujours
  // accepter ; l'empreinte empêche Claude d'écrire par-dessus sans relire.
  it('pendant que Claude travaille, le texte s’écrit ; Claude, qui avait lu l’ancien fichier, reçoit le conflit', async () => {
    const { projets, id } = await unProjet();
    const o = await projets.ouvrirChantier(MOI, id, 'refaire le menu', false);
    const chantier = o.lu && 'chantier' in o.valeur ? o.valeur.chantier : '';
    const r = await reecrireUnTexte({ compte: MOI, projets, construire: async () => ({ vert: true }) }, id, s, ['Nos thés choisis']);
    expect(r).toMatchObject({ reecrit: true });
    const a = await projets.appliquer(MOI, id, { chantier, attendus: { 'src/pages/Accueil.tsx': empreinteDuFichier(PAGE) }, ecrits: new Map([['src/pages/Accueil.tsx', PAGE]]), supprimes: [], pourquoi: 'Claude' });
    expect(a.lu && a.valeur.applique).toBe(false);
    const f = await projets.fichiers(MOI, id);
    expect(f.lu && f.valeur.get('src/pages/Accueil.tsx')).toBe(PAGE.replace('Nos thés du monde', 'Nos thés choisis'));
  });
  it('le même texte ne fait pas de version', async () => {
    const { projets, id } = await unProjet();
    const r = await reecrireUnTexte({ compte: MOI, projets, construire: async () => ({ vert: true }) }, id, s, ['Nos thés du monde']);
    expect(r).toEqual({ reecrit: true, version: 2, apercu: 'rien_change' });
  });
});
