/**
 * La page d'accueil publique : le bouton ouvre le connecteur déjà rempli à la bonne adresse, rien n'y promet ce que vavi
 * ne fait pas, et les prix sont ceux de la grille du code.
 */
import { describe, expect, it } from 'vitest';
import { laPageDAccueil } from '@/app/_accueil/la-page';
import { lienDInstallation } from '@/lib/mcp/l-adresse';
import { CENTIMES_D_UN_PROJET_EN_PLUS, OFFRES } from '@/lib/abonnements/les-offres';
import { TEXTES } from '@/app/_partage/textes';

const ADRESSE = 'https://vavi.test/api/mcp';
const page = laPageDAccueil(TEXTES.fr.commencer.premierTexte, ADRESSE, 'https://vavi.test');

describe('la page d’accueil', () => {
  it('le bouton « Ajouter vavi à Claude » ouvre le connecteur rempli ; l’adresse et le premier message se copient', () => {
    expect(page).toContain(`href="${lienDInstallation(ADRESSE).replace(/&/g, '&amp;')}"`);
    expect(page.match(/>Ajouter vavi à Claude</g)?.length).toBeGreaterThanOrEqual(3);
    expect(page).toContain(`<code id="adresse-mcp">${ADRESSE}</code>`);
    expect(page).toContain('data-copier="premier-message"');
    expect(page).not.toMatch(/__[A-Z_]+__/);
  });

  it('rien de ce que vavi ne fait pas encore n’est promis, ni l’offre payante de Claude exigée, ni un prix d’ailleurs', () => {
    expect(page).not.toMatch(/abonnement Claude payant|offre gratuite de Claude ne permet pas|Lovable|Replit|Bolt|suivi Google/);
    expect(page).not.toMatch(/agents IA déjà paramétrés|Agents IA déjà/);
    expect(page).toContain('Agents IA (bientôt)');
    expect(page).toContain('Votre nom de domaine (bientôt)');
  });

  it('les prix sont ceux de la grille', () => {
    for (const o of Object.values(OFFRES)) expect(page).toContain(`${o.centimes / 100} € <small>/ mois</small>`);
    expect(page).toContain(`<b>${CENTIMES_D_UN_PROJET_EN_PLUS / 100} € / mois</b>`);
  });

  it('les liens mènent aux pages de la console, à son adresse (la page servie sous un autre nom y envoie), et le script se lit', () => {
    for (const h of ['/commencer', '/projets', '/confidentialite']) expect(page).toContain(`href="https://vavi.test${h}"`);
    expect(page).not.toMatch(/href="\/(commencer|projets|confidentialite)"/);
    expect(page).not.toContain('href="#haut">Mentions');
    const script = page.slice(page.lastIndexOf('<script>') + 8, page.lastIndexOf('</script>'));
    expect(() => new Function(script)).not.toThrow();
  });

  it('un texte avec des signes HTML ne casse pas la page', () => {
    expect(laPageDAccueil('a "b" <c> & d', ADRESSE, 'https://vavi.test')).toContain('a &quot;b&quot; &lt;c&gt; &amp; d');
  });
});
