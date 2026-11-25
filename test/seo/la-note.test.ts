/**
 * La note de référencement d'une page (écran « Référencement (SEO) », demande d'Antoine du 25/11) et la balise Google
 * Search Console : pesée sur ce que le pré-rendu a relevé ; une balise mal formée n'est jamais posée ; l'aperçu ne la porte pas.
 */
import { describe, expect, it } from 'vitest';
import { avecLaVerificationGoogle, laNoteDuSite, leJetonGoogle, lesNotes } from '@/lib/seo/la-note';
import { MARQUE_DU_PRE_RENDU, FICHIER_DE_DECOUVERTE, type Decouverte } from '@/lib/seo/la-decouverte';
import { servirLeSite } from '@/lib/seo/servir-le-site';
import { fichierDuPreRendu } from '@/lib/seo/le-pre-rendu';
import { racineDuBuild } from '@/lib/publication/publier';
import type { EnvDeLApp } from '@/lib/publication/servir';
import { unMagasinEnMemoire } from '../aides/un-magasin-en-memoire';

const BONNE = { adresse: '/', titre: 'Vélos électriques à Lyon · Atelier du Rhône', description: 'Location et réparation de vélos électriques à Lyon, du lundi au samedi : réservez en ligne en deux minutes.', texte: 'x'.repeat(400) };
const D: Decouverte = { nom: 'Atelier', description: '', langue: 'fr', routes: ['/', '/contact'], editeur: { nom: 'Atelier du Rhône' },
  pages: [BONNE, { adresse: '/contact', titre: 'Atelier', description: 'Court.', texte: 'Écrivez-nous.' }, { adresse: '/aide', titre: 'Atelier', description: '' }] };

describe('la note d’une page', () => {
  it('pèse chaque critère sur la page lue ; une page complète a 100, une page pauvre dit ce qui manque', () => {
    const [a, b] = lesNotes(D, { image: true });
    expect(a!.note).toBe(100);
    expect(b!.points.filter((p) => !p.ok).map((p) => p.critere)).toEqual(['titre', 'titre_unique', 'description', 'texte']);
    expect(b!.points.find((p) => p.critere === 'description')!.mesure).toBe(6);
  });
  it('sans image de partage ni éditeur déclaré, chaque page le dit ; la moyenne du site, jamais 0 sans page', () => {
    const notes = lesNotes({ ...D, editeur: null }, { image: false });
    expect(notes.every((n) => n.points.filter((p) => p.critere === 'image' || p.critere === 'editeur').every((p) => !p.ok))).toBe(true);
    expect(laNoteDuSite(notes)).toBeGreaterThan(0);
    expect(laNoteDuSite([])).toBeNull();
  });
});

describe('la balise Google Search Console', () => {
  it('se colle entière ou en son seul contenu ; vide, elle se retire ; autre chose est refusé', () => {
    expect(leJetonGoogle('<meta name="google-site-verification" content="AbC_123-xyzXYZ0987" />')).toBe('AbC_123-xyzXYZ0987');
    expect(leJetonGoogle('  AbC_123-xyzXYZ0987 ')).toBe('AbC_123-xyzXYZ0987');
    expect(leJetonGoogle('')).toBeNull();
    expect(leJetonGoogle('"><script>alert(1)</script>')).toBe(false);
    expect(leJetonGoogle('<meta content="x"><script>')).toBe(false);
  });
  it('se pose avant </head> ; un jeton mal formé n’est jamais écrit dans la page', () => {
    expect(avecLaVerificationGoogle('<html><head><title>t</title></head></html>', 'AbC_123-xyzXYZ0987')).toContain('<meta name="google-site-verification" content="AbC_123-xyzXYZ0987"></head>');
    expect(avecLaVerificationGoogle('<html><head></head></html>', '"><script>')).toBe('<html><head></head></html>');
  });
  it('le site en ligne la porte, page pré-rendue comme coquille ; l’aperçu jamais', async () => {
    const P = '0f1e2d3c-4b5a-4968-8776-655443322110';
    const racine = racineDuBuild(P, 'e'.repeat(64));
    const m = unMagasinEnMemoire();
    await m.poser(`${racine}/index.html`, Buffer.from('<html><head><title>App</title></head><body></body></html>'), { type: 'text/html', cache: 'no-store' });
    await m.poser(`${racine}/${FICHIER_DE_DECOUVERTE}`, Buffer.from(JSON.stringify(D)), { type: 'application/json', cache: 'no-store' });
    await m.poser(`${racine}/${fichierDuPreRendu('/')}`, Buffer.from(`<html ${MARQUE_DU_PRE_RENDU}><head><title>Accueil</title></head><body><h1>A</h1></body></html>`), { type: 'text/html', cache: 'no-store' });
    const env = (base: string): EnvDeLApp => ({ supabaseUrl: 'https://x.supabase.co', cleAnonyme: 'k'.repeat(30), schema: 's', base, projet: P });
    const balise = 'google-site-verification" content="AbC_123-xyzXYZ0987"';
    const enLigne = (segments: string[]) => servirLeSite(m, racine, segments, env(`/s/${P}/`), 'en_ligne', `https://vavi.test/s/${P}`, 'AbC_123-xyzXYZ0987');
    expect((await enLigne([])).corps.toString()).toContain(balise);
    expect((await enLigne(['contact'])).corps.toString()).toContain(balise);
    expect((await servirLeSite(m, racine, [], env(`/p/${P}/`), 'apercu', `https://vavi.test/p/${P}`, 'AbC_123-xyzXYZ0987')).corps.toString()).not.toContain(balise);
  });
});
