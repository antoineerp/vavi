/** La boîte de réception de la console : résumé par formulaire, vues, réponse au visiteur, raison du spam, export CSV sans formule. */
import { describe, expect, it } from 'vitest';
import { laRaisonDuSpam, laReponseA, laVueDemandee, leCsvDesMessages, lesMessagesDeLaVue, leResumeDesFormulaires } from '@/lib/formulaires/la-boite-de-reception';
import { leCourrielDuMessage, type Message } from '@/lib/formulaires/les-messages';

const m = (id: string, formulaire: string, statut: 'recu' | 'spam', creeLe: string, donnees: Record<string, unknown> = {}, motif: string | null = null): Message =>
  ({ id, formulaire, statut, creeLe, donnees, page: '/contact', motif, courriel: statut === 'spam' ? 'non_envoye' : 'envoye' });

const BOITE = [
  m('1', 'contact', 'recu', '2026-11-25T10:00:00Z', { nom: 'Ada', email: 'ada@exemple.fr', message: 'Bonjour' }),
  m('2', 'contact', 'spam', '2026-11-25T11:00:00Z', { nom: 'wGQUmrSLaJtONEZD' }, 'texte-aleatoire : champs tirés au hasard : nom'),
  m('3', 'devis', 'recu', '2026-11-24T09:00:00Z', { societe: '=HYPERLINK("http://x")', remarque: 'dit "oui"' }),
];

describe('la boîte de réception', () => {
  it('résume chaque formulaire, le plus récent d’abord', () => {
    expect(leResumeDesFormulaires(BOITE)).toEqual([
      { formulaire: 'contact', recus: 1, spam: 1, dernier: '2026-11-25T11:00:00Z' },
      { formulaire: 'devis', recus: 1, spam: 0, dernier: '2026-11-24T09:00:00Z' },
    ]);
  });
  it('lit la vue de l’adresse (reçus par défaut, un formulaire inconnu ignoré) et filtre', () => {
    const v = laVueDemandee({ vue: 'nimporte', formulaire: 'inconnu' }, ['contact', 'devis']);
    expect(v).toEqual({ vue: 'recus', formulaire: null });
    expect(lesMessagesDeLaVue(BOITE, v).map((x) => x.id)).toEqual(['1', '3']);
    expect(lesMessagesDeLaVue(BOITE, { vue: 'spam', formulaire: null }).map((x) => x.id)).toEqual(['2']);
    expect(lesMessagesDeLaVue(BOITE, laVueDemandee({ vue: 'tous', formulaire: 'contact' }, ['contact'])).map((x) => x.id)).toEqual(['1', '2']);
  });
  it('trouve à qui répondre, la même adresse que le courriel envoyé', () => {
    expect(laReponseA(BOITE[0]!.donnees)).toBe('ada@exemple.fr');
    expect(laReponseA({ email: 'pas une adresse' })).toBeNull();
    expect(leCourrielDuMessage('Le Thé', 'contact', BOITE[0]!.donnees, null).repondreA).toBe('ada@exemple.fr');
  });
  it('dit la raison du spam en mots simples', () => {
    expect(laRaisonDuSpam(BOITE[1]!.motif, 'fr')).toBe('des champs remplis de lettres tirées au hasard');
    expect(laRaisonDuSpam('autre chose', 'fr')).toBe('autre chose');
    expect(laRaisonDuSpam(null, 'en')).toBeNull();
  });
  it('exporte en CSV : chaque champ en colonne, guillemets doublés, jamais une formule pour le tableur', () => {
    const csv = leCsvDesMessages(BOITE);
    const [tete, , , devis] = csv.replace(/^﻿/, '').trim().split('\r\n');
    expect(tete).toBe('"date";"formulaire";"page";"statut";"nom";"email";"message";"societe";"remarque"');
    expect(devis).toContain(`"'=HYPERLINK(""http://x"")"`);
    expect(devis).toContain('"dit ""oui"""');
  });
});
