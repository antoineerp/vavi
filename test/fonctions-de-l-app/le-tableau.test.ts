/** Le tableau des fonctions d'une app : lu d'app.json, chaque état réel, jamais « actif » pour ce que vavi ne fait pas. */
import { describe, expect, it } from 'vitest';
import { leTableauDesFonctions } from '@/lib/fonctions-de-l-app/le-tableau';
import { NOTES, lu } from '../donnees/une-app';

const app = (ajout: Record<string, unknown>) => lu({ ...NOTES, ...ajout });

describe('le tableau des fonctions', () => {
  it('dit la nature, les rôles et leur accès, les données et leur cycle, lus d’app.json', () => {
    const t = leTableauDesFonctions(lu(NOTES), 'fr');
    const section = (titre: string) => t.find((s) => s.titre === titre)?.fonctions ?? [];
    expect(section('Nature')[0]).toMatchObject({ libelle: 'app', etat: 'actif' });
    expect(section('Rôles et accès').map((f) => [f.libelle, f.detail])).toEqual([['Responsable', 'le vôtre'], ['Salarié', 'sur invitation']]);
    expect(section('Données')[0]).toMatchObject({ libelle: 'Notes', detail: 'suit un cycle : Brouillon → Soumise → Approuvée', ou: 'donnees' });
    expect(t.find((s) => s.titre === 'Vente')).toBeUndefined();
  });
  it('une automatisation déclarée est « pas encore », jamais active ; une capacité à clé sans secret est à régler', () => {
    const avecAuto = { ...app({ fonctions: { sms: true, pdf: true } }), automatisations: [{ dit: 'Relance les notes en brouillon' }] } as unknown as Parameters<typeof leTableauDesFonctions>[0];
    const t = leTableauDesFonctions(avecAuto, 'fr');
    const capacites = t.find((s) => s.titre === 'Capacités')!.fonctions;
    expect(capacites.find((f) => f.libelle === 'SMS')).toMatchObject({ etat: 'a_regler', ou: 'secrets' });
    expect(capacites.find((f) => f.libelle === 'documents PDF')).toMatchObject({ etat: 'actif' });
    expect(leTableauDesFonctions(app({ fonctions: { sms: true } }), 'fr', new Set(['TWILIO_SID'])).find((s) => s.titre === 'Capacités')!.fonctions[0]).toMatchObject({ etat: 'actif' });
    expect(t.find((s) => s.titre === 'Automatisations et agents')!.fonctions).toEqual([{ libelle: 'Relance les notes en brouillon', detail: 'déclarée dans l’app, pas encore active dans vavi', etat: 'pas_encore' }]);
  });
  it('en anglais aussi', () => {
    expect(leTableauDesFonctions(lu(NOTES), 'en')[0]).toMatchObject({ titre: 'Kind' });
  });
});
