/** Le lien de connexion du courriel arrive sur vavi : la page lit l'empreinte du jeton dans le fragment, et rien d'autre. */
import { describe, expect, it } from 'vitest';
import { LE_COURRIEL_DU_LIEN, leJetonDuLien, MODELE_DU_LIEN } from '@/app/_partage/le-lien-de-connexion';

describe('le lien de connexion', () => {
  it('lit l’empreinte posée par le modèle, seule ou parmi d’autres paramètres', () => {
    expect(leJetonDuLien('#vavi_lien=pkce_0a1b2c3d4e5f6a7b8c9d')).toBe('pkce_0a1b2c3d4e5f6a7b8c9d');
    expect(leJetonDuLien('#x=1&vavi_lien=0a1b2c3d4e5f6a7b8c9d&y=2')).toBe('0a1b2c3d4e5f6a7b8c9d');
  });
  it('ne prend rien d’autre', () => {
    expect(leJetonDuLien('')).toBeNull();
    expect(leJetonDuLien('#access_token=abc')).toBeNull();
    expect(leJetonDuLien('#vavi_lien=<script>')).toBeNull();
    expect(leJetonDuLien('#pas_vavi_lien=0a1b2c3d4e5f6a7b8c9d')).toBeNull();
  });
  it('le modèle à coller dans Supabase porte ce lien, et plus l’adresse de Supabase', () => {
    const modele = LE_COURRIEL_DU_LIEN;
    expect(modele.split(MODELE_DU_LIEN).length).toBe(3);
    expect(modele).toContain(MODELE_DU_LIEN);
    expect(modele).not.toContain('ConfirmationURL');
  });
});
