/** « Gérer le contenu » : l'apparence et le référencement changés par la personne, relus avant d'être écrits. */
import { describe, expect, it } from 'vitest';
import { avecLApparence, avecLeLogo, avecUneImage, changerUneImage, changerLeReferencement, leReferencementRelu, leReferencementStocke, CHEMIN_DU_REFERENCEMENT } from '@/lib/contenus/le-contenu';
import { desProjetsEnMemoire } from '../aides/des-projets-en-memoire';
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
  it('INCIDENT 25/11 — changer un titre dans la console effaçait l’image de partage posée par Claude', async () => {
    const projets = desProjetsEnMemoire();
    const MOI = 'aaaaaaaa-0000-4000-8000-00000000000a';
    const p = await projets.creer(MOI, 'Le Thé', APP_JSON);
    const id = p.lu ? p.valeur.id : '';
    projets.etats.get(id)!.fichiers.set(CHEMIN_DU_REFERENCEMENT, `${JSON.stringify({ pages: {}, image: '/partage.jpg' })}\n`);
    const r = await changerLeReferencement({ compte: MOI, projets, construire: async () => ({ vert: true }) }, id, { '/': { titre: 'Thés rares' } });
    expect(r.change).toBe(true);
    expect(leReferencementStocke(projets.etats.get(id)!.fichiers.get(CHEMIN_DU_REFERENCEMENT))).toEqual({ pages: { '/': { titre: 'Thés rares' } }, image: '/partage.jpg' });
  });
  it('remplace une photo posée par celle que la personne choisit, garde les autres, et refuse un nom que l’app ne montre pas', async () => {
    const trouvee = { source: 'https://images.unsplash.com/photo-2', largeur: 2000, hauteur: 1300, decrit: 'sailboat', auteur: 'A', profil: 'p', banque: 'Unsplash', lienBanque: 'l' };
    const avant = `${JSON.stringify({ hero: { alt: 'Un voilier', largeur: 1, hauteur: 1, sources: [[640, 'https://images.unsplash.com/photo-1?w=640']], auteur: 'B', profil: '', banque: 'Unsplash', lienBanque: '' }, autre: { alt: 'x' } })}`;
    const r = avecUneImage(avant, 'hero', trouvee, '');
    const j = JSON.parse(r.ok ? r.texte : '{}');
    expect(j.hero.alt).toBe('Un voilier');
    expect(j.hero.sources[0][1]).toContain('photo-2');
    expect(j.autre).toEqual({ alt: 'x' });
    expect(avecUneImage(avant, 'inconnue', trouvee, 'y').ok).toBe(false);
    const projets = desProjetsEnMemoire();
    const MOI = 'aaaaaaaa-0000-4000-8000-00000000000a';
    const p = await projets.creer(MOI, 'Voile', APP_JSON);
    const id = p.lu ? p.valeur.id : '';
    projets.etats.get(id)!.fichiers.set('src/images.json', avant);
    const c = await changerUneImage({ compte: MOI, projets, construire: async () => ({ vert: true }) }, id, 'hero', trouvee, 'Un voilier au large');
    expect(c).toMatchObject({ change: true, apercu: 'a_jour' });
    expect(JSON.parse(projets.etats.get(id)!.fichiers.get('src/images.json')!).hero.alt).toBe('Un voilier au large');
  });
});

describe('INCIDENT 26/11 — l’apparence ne s’enregistrait jamais depuis la console', () => {
  it('la couleur du texte et la police du texte ne partagent plus un nom : le formulaire rend la police choisie', async () => {
    const { lApparenceDuFormulaire, CHAMPS_DES_POLICES, COULEURS } = await import('@/lib/contenus/le-contenu');
    const noms = [...COULEURS, 'rayon', CHAMPS_DES_POLICES.titres, CHAMPS_DES_POLICES.texte];
    expect(new Set(noms).size).toBe(noms.length);
    // Ce que le navigateur envoie, champ par champ, du formulaire de la page.
    const f = new FormData();
    for (const [k, v] of Object.entries({ fond: '#f6f1ea', texte: '#2a211b', accent: '#2f6b4f', surface: '#fffaf4', bordure: '#e2d6c6', rayon: 'doux' })) f.append(k, v);
    f.append(CHAMPS_DES_POLICES.titres, 'Fraunces'); f.append(CHAMPS_DES_POLICES.texte, 'Inter');
    const a = lApparenceDuFormulaire(f);
    expect(a).toEqual({ lue: true, apparence: { couleurs: { fond: '#f6f1ea', texte: '#2a211b', accent: '#2f6b4f', surface: '#fffaf4', bordure: '#e2d6c6' }, rayon: 'doux', polices: { titres: 'Fraunces', texte: 'Inter' } } });
    // La page nomme ses listes de polices par ces noms, jamais par celui d'une couleur.
    const page = (await import('node:fs')).readFileSync('app/projets/[id]/gerer/l-apparence.tsx', 'utf8');
    expect(page).toContain('name={CHAMPS_DES_POLICES.texte}');
    expect(page).not.toMatch(/<select name="(texte|titres)"/);
  });
  it('enregistrer l’apparence garde la seconde couleur et l’ancre, que la console ne montre pas', async () => {
    const { avecLApparence } = await import('@/lib/contenus/le-contenu');
    const app = JSON.parse(APP_JSON);
    app.direction = { ...app.direction, couleurs: { ...app.direction.couleurs, second: '#5f7a5a', ancre: '#2f2420' } };
    const r = avecLApparence(JSON.stringify(app), { couleurs: { fond: '#ffffff', texte: '#111111', accent: '#2f6b4f', surface: '#fafafa', bordure: '#dddddd' }, rayon: 'net', polices: { titres: 'Fraunces', texte: 'Inter' } });
    if (!r.ok) throw new Error(r.detail);
    expect(JSON.parse(r.texte).direction.couleurs).toMatchObject({ accent: '#2f6b4f', second: '#5f7a5a', ancre: '#2f2420' });
  });
});

// 26/11 (oui d'Antoine : un logo déposé dans la console) : il entre dans la direction d'app.json, s'en retire, et le
// manifeste refuse ce qui n'est pas une adresse https.
describe('le logo déposé', () => {
  it('posé dans direction.logo, le reste inchangé ; retiré par null', () => {
    const r = avecLeLogo(APP_JSON, 'https://www.vavi.dev/photos/abc/logo.webp');
    expect(r.ok).toBe(true);
    const j = JSON.parse((r as { texte: string }).texte);
    expect(j.direction.logo).toBe('https://www.vavi.dev/photos/abc/logo.webp');
    expect(j.direction.couleurs).toEqual(JSON.parse(APP_JSON).direction.couleurs);
    const sans = JSON.parse((avecLeLogo((r as { texte: string }).texte, null) as { texte: string }).texte);
    expect('logo' in sans.direction).toBe(false);
  });
  it('une adresse qui n’est pas https est refusée', () => {
    expect(avecLeLogo(APP_JSON, 'javascript:alert(1)').ok).toBe(false);
    expect(avecLeLogo(APP_JSON, 'http://x.fr/logo.png').ok).toBe(false);
  });
});

// 28/11 (Antoine : « Réglages puis 3 directions ») : le mouvement, le verre et le dégradé, que la peau applique sans modèle,
// se changent dans la console. Avant, le formulaire ne les envoyait pas et app.json les gardait tels que Claude les avait posés.
describe('les effets de l’apparence', () => {
  const formulaire = async (effets: Record<string, string>) => {
    const { CHAMPS_DES_POLICES } = await import('@/lib/contenus/le-contenu');
    const f = new FormData();
    for (const [k, v] of Object.entries({ fond: '#f6f1ea', texte: '#2a211b', accent: '#2f6b4f', surface: '#fffaf4', bordure: '#e2d6c6', rayon: 'doux', [CHAMPS_DES_POLICES.titres]: 'Fraunces', [CHAMPS_DES_POLICES.texte]: 'Inter', ...effets })) f.append(k, v);
    return f;
  };
  it('le formulaire les rend, et app.json les reçoit, le reste gardé', async () => {
    const { lApparenceDuFormulaire, avecLApparence, CHAMPS_DES_EFFETS } = await import('@/lib/contenus/le-contenu');
    const a = lApparenceDuFormulaire(await formulaire({ [CHAMPS_DES_EFFETS.mouvement]: 'immobile', [CHAMPS_DES_EFFETS.verre]: 'non', [CHAMPS_DES_EFFETS.degrade]: 'non' }));
    if (!a.lue) throw new Error(a.detail);
    expect(a.apparence.effets).toEqual({ mouvement: 'immobile', verre: false, degrade: false });
    const r = avecLApparence(APP_JSON, a.apparence);
    if (!r.ok) throw new Error(r.detail);
    expect(JSON.parse(r.texte).direction).toMatchObject({ mouvement: 'immobile', verre: false, degrade: false, rayon: 'doux' });
  });
  it('absents du formulaire, ceux d’app.json restent ; mal formés, refusés', async () => {
    const { lApparenceDuFormulaire, avecLApparence, CHAMPS_DES_EFFETS } = await import('@/lib/contenus/le-contenu');
    const app = JSON.parse(APP_JSON);
    app.direction = { ...app.direction, mouvement: 'discret', verre: false };
    const a = lApparenceDuFormulaire(await formulaire({}));
    if (!a.lue) throw new Error(a.detail);
    const r = avecLApparence(JSON.stringify(app), a.apparence);
    if (!r.ok) throw new Error(r.detail);
    expect(JSON.parse(r.texte).direction).toMatchObject({ mouvement: 'discret', verre: false });
    expect(lApparenceDuFormulaire(await formulaire({ [CHAMPS_DES_EFFETS.mouvement]: 'tourbillon', [CHAMPS_DES_EFFETS.verre]: 'oui', [CHAMPS_DES_EFFETS.degrade]: 'oui' })).lue).toBe(false);
  });
  it('la page envoie les trois champs', async () => {
    const page = (await import('node:fs')).readFileSync('app/projets/[id]/gerer/l-apparence.tsx', 'utf8');
    for (const champ of ['CHAMPS_DES_EFFETS.mouvement', 'CHAMPS_DES_EFFETS.verre', 'CHAMPS_DES_EFFETS.degrade']) expect(page).toContain(`name={${champ}}`);
  });
});

// 28/11 (Antoine : « Réglages puis 3 directions ») : Claude propose deux autres directions dans app.json ; la console en pose
// une, sans modèle, et la posée rejoint les autres pour qu'on y revienne.
describe('les autres directions', () => {
  const app = () => {
    const a = JSON.parse(APP_JSON);
    a.direction = { ...a.direction, nom: 'Atelier', logo: 'https://exemple.fr/logo.png', travail: 'sobre' };
    a.autresDirections = [
      { nom: 'Brut', couleurs: { fond: '#111111', texte: '#f5f5f5', accent: '#e4572e', surface: '#1c1c1c', bordure: '#333333' }, polices: { titres: 'Archivo', texte: 'Inter' }, rayon: 'net', registre: 'brut', mouvement: 'discret', verre: false },
      { nom: 'Jardin', couleurs: { fond: '#f4f1e8', texte: '#1f2a1f', accent: '#4f7a3a', surface: '#fbfaf4', bordure: '#dcd6c4' }, polices: { titres: 'Fraunces', texte: 'DM Sans' }, rayon: 'doux' },
    ];
    return a;
  };
  it('le manifeste les lit, et refuse une autre direction violette comme la direction', async () => {
    const { lireLeManifeste } = await import('@/lib/backend/app/manifeste');
    const r = lireLeManifeste(app());
    if (!r.ok) throw new Error(r.erreurs.join(' ; '));
    expect(r.manifeste.autresDirections?.map((d) => d.nom)).toEqual(['Brut', 'Jardin']);
    const violette = app();
    violette.autresDirections[0].couleurs.accent = '#6d28d9';
    expect(lireLeManifeste(violette).ok).toBe(false);
  });
  it('poser « Brut » : elle devient la direction, le logo et l’allure des écrans de travail restent, « Atelier » rejoint les autres', async () => {
    const { avecLaDirectionChoisie } = await import('@/lib/contenus/le-contenu');
    const r = avecLaDirectionChoisie(JSON.stringify(app()), 'Brut');
    if (!r.ok) throw new Error(r.detail);
    const j = JSON.parse(r.texte);
    expect(j.direction).toMatchObject({ nom: 'Brut', registre: 'brut', verre: false, logo: 'https://exemple.fr/logo.png', travail: 'sobre', polices: { titres: 'Archivo' } });
    expect(j.autresDirections.map((d: { nom: string }) => d.nom)).toEqual(['Atelier', 'Jardin']);
    expect(j.autresDirections[0].logo).toBeUndefined();
    // Et l'on revient en un geste.
    const retour = avecLaDirectionChoisie(r.texte, 'Atelier');
    if (!retour.ok) throw new Error(retour.detail);
    expect(JSON.parse(retour.texte).direction).toMatchObject({ nom: 'Atelier', polices: app().direction.polices, logo: 'https://exemple.fr/logo.png' });
  });
  it('une direction sans nom prend « Direction d’origine » ; un nom inconnu est refusé', async () => {
    const { avecLaDirectionChoisie } = await import('@/lib/contenus/le-contenu');
    const a = app();
    delete a.direction.nom;
    const r = avecLaDirectionChoisie(JSON.stringify(a), 'Jardin');
    if (!r.ok) throw new Error(r.detail);
    expect(JSON.parse(r.texte).autresDirections[1].nom).toBe(a.langues.principale === 'fr' ? 'Direction d’origine' : 'Original direction');
    expect(avecLaDirectionChoisie(JSON.stringify(a), 'Inconnue').ok).toBe(false);
  });
  it('enregistrer l’apparence garde les autres directions', () => {
    const r = avecLApparence(JSON.stringify(app()), { couleurs: { fond: '#ffffff', texte: '#111111', accent: '#2f6b4f', surface: '#fafafa', bordure: '#dddddd' }, rayon: 'net', polices: { titres: 'Fraunces', texte: 'Inter' } });
    if (!r.ok) throw new Error(r.detail);
    expect(JSON.parse(r.texte).autresDirections).toHaveLength(2);
  });
});
