/**
 * La page d'accueil publique : le bouton ouvre le connecteur déjà rempli à la bonne adresse, rien n'y promet ce que vavi
 * ne fait pas, et les prix sont ceux de la grille du code.
 */
import { describe, expect, it } from 'vitest';
import { laPageDAccueil, lesTextesSansTraduction } from '@/app/_accueil/la-page';
import { laLangueDuNavigateur } from '@/app/_partage/la-langue-du-navigateur';
import { lienDInstallation } from '@/lib/mcp/l-adresse';
import { CENTIMES_D_UN_PROJET_EN_PLUS, GRILLE_DU_CODE, OFFRES } from '@/lib/abonnements/les-offres';
import { TEXTES } from '@/app/_partage/textes';

const ADRESSE = 'https://vavi.test/api/mcp';
const T = { premier: TEXTES.fr.commencer.premierTexte, preference: TEXTES.fr.commencer.preferenceTexte };
const page = laPageDAccueil(T, ADRESSE, 'https://vavi.test');

describe('la page d’accueil', () => {
  it('le bouton « Ajouter vavi à Claude » ouvre le connecteur rempli ; l’adresse et le premier message se copient', () => {
    expect(page).toContain(`href="${lienDInstallation(ADRESSE).replace(/&/g, '&amp;')}"`);
    expect(page.match(/>Ajouter vavi à Claude</g)?.length).toBeGreaterThanOrEqual(3);
    expect(page).toContain(`<code id="adresse-mcp">${ADRESSE}</code>`);
    expect(page).toContain('data-copier="premier-message"');
    expect(page).toContain(`<code id="preference">${T.preference}</code>`);
    expect(page).not.toMatch(/__[A-Z_]+__/);
  });

  it('rien de ce que vavi ne fait pas encore n’est promis, ni l’offre payante de Claude exigée, ni un prix d’ailleurs', () => {
    expect(page).not.toMatch(/abonnement Claude payant|offre gratuite de Claude ne permet pas|Lovable|Replit|Bolt|suivi Google/);
    expect(page).not.toMatch(/agents IA déjà paramétrés|Agents IA déjà/);
    expect(page).toContain('Agents IA de votre app');
    expect(page).not.toContain('Agents IA (bientôt)');
    expect(page).toContain('Votre nom de domaine (bientôt)');
  });

  it('les prix sont ceux de la grille', () => {
    for (const o of Object.values(OFFRES)) expect(page).toContain(`${o.centimes / 100} € <small>/ mois</small>`);
    expect(page).toContain(`<b>${CENTIMES_D_UN_PROJET_EN_PLUS / 100} € / mois</b>`);
  });

  it('les prix et la promotion sont ceux de l’administration : un prix changé s’affiche, une réduction pour tous barre l’ancien prix et dit sa durée et sa fin', () => {
    const grille = { ...GRILLE_DU_CODE, site: 2400 };
    const reduction = { id: 'r', compte: null, pourcent: 20, mois: 3, coupon: 'c', valableJusquAu: '2026-12-31T12:00:00Z', retireeLe: null };
    const sans = laPageDAccueil(T, ADRESSE, 'https://vavi.test', 'fr', { grille, reduction: null });
    expect(sans).toContain('24 € <small>/ mois</small>');
    expect(sans).not.toMatch(/<s>|Offre en cours|class="promo"/);
    const avec = laPageDAccueil(T, ADRESSE, 'https://vavi.test', 'fr', { grille, reduction });
    expect(avec).toContain('<s>24 €</s> <span class="promo-prix">19,20 €</span> <small>/ mois</small>');
    expect(avec).toContain('<s>49 €</s> <span class="promo-prix">39,20 €</span>');
    expect(avec).toContain('−20 % les 3 premiers mois');
    expect(avec).toContain('pour un abonnement pris avant le 31 décembre 2026');
    const en = laPageDAccueil(T, ADRESSE, 'https://vavi.test', 'en', { grille, reduction });
    expect(en).toContain('<s>24 €</s> <span class="promo-prix">19.20 €</span>');
    expect(en).toContain('−20 % for the first 3 months on every plan, for a subscription taken before 31 December 2026');
    expect(en).not.toMatch(/__[A-Z_]+__/);
  });

  it('les liens mènent aux pages de la console, à son adresse (la page servie sous un autre nom y envoie), et le script se lit', () => {
    for (const h of ['/commencer', '/projets', '/confidentialite']) expect(page).toContain(`href="https://vavi.test${h}"`);
    expect(page).not.toMatch(/href="\/(commencer|projets|confidentialite)"/);
    expect(page).not.toContain('href="#haut">Mentions');
    const script = page.slice(page.lastIndexOf('<script>') + 8, page.lastIndexOf('</script>'));
    expect(() => new Function(script)).not.toThrow();
  });

  it('un texte avec des signes HTML ne casse pas la page', () => {
    expect(laPageDAccueil({ premier: 'a "b" <c> & d', preference: 'x' }, ADRESSE, 'https://vavi.test')).toContain('a &quot;b&quot; &lt;c&gt; &amp; d');
  });

  it('chaque texte de la page a sa traduction anglaise ; la page anglaise ne garde aucun mot français, son script compris', () => {
    expect(lesTextesSansTraduction()).toEqual([]);
    const en = laPageDAccueil({ premier: TEXTES.en.commencer.premierTexte, preference: TEXTES.en.commencer.preferenceTexte }, ADRESSE, 'https://vavi.test', 'en');
    expect(en).toContain('<html lang="en">');
    expect(en).toContain(`<code id="preference">${TEXTES.en.commencer.preferenceTexte}</code>`);
    expect(en.match(/>Add vavi to Claude</g)?.length).toBeGreaterThanOrEqual(3);
    for (const o of Object.values(OFFRES)) expect(en).toContain(`${o.centimes / 100} €`);
    const lu = en.replace(/<style[\s\S]*?<\/style>|<!--[\s\S]*?-->/g, '').replace(/\s(class|id|href|src|data-copier)="[^"]*"/g, '');
    expect(lu.replace('>Français<', '><').replace('clichés', '')).not.toMatch(/[àâçéèêîôûù]|\b(vous|votre|avec|pour|dans|bientôt)\b/i);
    expect(en).not.toMatch(/__[A-Z_]+__/);
    const script = en.slice(en.lastIndexOf('<script>') + 8, en.lastIndexOf('</script>'));
    expect(script).toContain("'Copied'");
    expect(() => new Function(script)).not.toThrow();
  });

  it('chaque langue mène à l’autre, et Google lit les deux adresses', () => {
    const en = laPageDAccueil(T, ADRESSE, 'https://vavi.test', 'en');
    expect(page).toContain('href="https://vavi.test/en" hreflang="en" lang="en">English</a>');
    expect(en).toContain('href="https://vavi.test/fr" hreflang="fr" lang="fr">Français</a>');
    for (const p of [page, en]) for (const l of ['fr', 'en']) expect(p).toContain(`<link rel="alternate" hreflang="${l}" href="https://vavi.test/${l}">`);
    expect(page).toContain('<link rel="canonical" href="https://vavi.test/fr">');
    expect(en).toContain('<link rel="canonical" href="https://vavi.test/en">');
  });

  it('la langue du navigateur se lit poids compris : le français s’il passe avant l’anglais, sinon l’anglais', () => {
    expect(laLangueDuNavigateur('fr-FR,fr;q=0.9,en;q=0.8')).toBe('fr');
    expect(laLangueDuNavigateur('en-US,en;q=0.9,fr;q=0.8')).toBe('en');
    expect(laLangueDuNavigateur('de-DE,fr;q=0.8,en;q=0.5')).toBe('fr');
    expect(laLangueDuNavigateur('es-ES,es;q=0.9')).toBe('en');
    expect(laLangueDuNavigateur('en;q=0.3, fr;q=0.7')).toBe('fr');
    expect(laLangueDuNavigateur(null)).toBe('fr');
    expect(laLangueDuNavigateur('', 'en')).toBe('en');
  });
});
