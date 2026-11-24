// Repris de constructor-v13@5bb786e : test/generateur-v2/les-prospects.test.ts (la recherche ; la couverture et l'agent restent à la voie D)
/**
 * La fonction `prospects` d'une app : des entreprises cherchées dans le registre public (l'API Recherche
 * d'entreprises de l'État, simulée ici par sa forme de réponse), chacune avec sa fiche, sa source ; une forme courante mal
 * écrite est réparée et dite, une recherche sans critère refusée ; une panne du registre est dite, jamais une liste vide.
 */
import { describe, expect, it } from 'vitest';
import { chercherDesEntreprises, laRecherche, lesEntreprises, lesTranches, SOURCE_DES_ENTREPRISES } from '@/lib/capacites/les-entreprises';

const REPONSE = {
  results: [
    { siren: '123456789', nom_complet: 'ATELIER DU PAIN (ATELIER DU PAIN)', activite_principale: '10.71C', tranche_effectif_salarie: '11', date_creation: '2015-03-02',
      siege: { adresse: '3 RUE DES LILAS 69001 LYON', code_postal: '69001', libelle_commune: 'LYON', activite_principale: '10.71C' },
      dirigeants: [{ nom: 'MARTIN', prenoms: 'Claire', qualite: 'Gérant', type_dirigeant: 'personne physique' }, { denomination: 'HOLDING X', qualite: 'Associé', type_dirigeant: 'personne morale' }] },
    { nom_complet: 'SANS SIREN' },
  ],
  total_results: 41, page: 1, per_page: 20, total_pages: 3,
};

describe('la recherche dans le registre public', () => {
  it('l’adresse porte les critères ; un code d’activité sans point et un département sur un chiffre sont réparés et dits', () => {
    const r = laRecherche({ texte: 'pain', activite: '1071c', departement: '1', effectif: { min: 10, max: 49 } });
    expect(r.lu).toBe(true);
    if (!r.lu) return;
    const u = new URL(r.valeur);
    expect(u.origin + u.pathname).toBe('https://recherche-entreprises.api.gouv.fr/search');
    expect(Object.fromEntries(u.searchParams)).toEqual({ q: 'pain', activite_principale: '10.71C', departement: '01', tranche_effectif_salarie: '11,12',
      etat_administratif: 'A', per_page: '20', page: '1' });
    expect(r.repare).toEqual(['code d’activité « 1071c » lu « 10.71C »', 'département « 1 » lu « 01 »']);
  });

  it('sans critère, un code illisible, un code postal faux : refusés, avec ce qui les lèverait', () => {
    expect(laRecherche({})).toEqual({ lu: false, pourquoi: 'une recherche nomme au moins des mots, une activité, un code postal ou un département' });
    expect(laRecherche({ activite: 'boulangerie' })).toMatchObject({ lu: false, pourquoi: expect.stringContaining('n’est pas un code d’activité') });
    expect(laRecherche({ codePostal: '6900' })).toMatchObject({ lu: false, pourquoi: '« 6900 » n’est pas un code postal : cinq chiffres' });
    expect(lesTranches({ min: 10000 })).toEqual(['53']);
    expect(lesTranches({ max: 2 })).toEqual(['00', '01']);
  });

  it('la réponse, à la forme de l’app : chaque entreprise avec sa fiche publique ; une ligne sans identifiant est écartée', () => {
    expect(lesEntreprises(REPONSE)).toEqual({
      entreprises: [{ siren: '123456789', nom: 'ATELIER DU PAIN (ATELIER DU PAIN)', activite: '10.71C', adresse: '3 RUE DES LILAS 69001 LYON', codePostal: '69001',
        ville: 'LYON', effectif: '10 à 19', creeeLe: '2015-03-02', dirigeants: [{ nom: 'Claire MARTIN', qualite: 'Gérant' }, { nom: 'HOLDING X', qualite: 'Associé' }],
        fiche: 'https://annuaire-entreprises.data.gouv.fr/entreprise/123456789' }],
      total: 41, page: 1, pages: 3, source: SOURCE_DES_ENTREPRISES,
    });
  });

  it('par la file et le cache : un second appel identique ne rappelle pas le registre ; une panne est dite', async () => {
    let appels = 0;
    const registre = (async () => { appels += 1; return new Response(JSON.stringify(REPONSE), { status: 200 }); }) as unknown as typeof fetch;
    const a = await chercherDesEntreprises({ codePostal: '69001', texte: 'cache' }, registre);
    const b = await chercherDesEntreprises({ codePostal: '69001', texte: 'cache' }, registre);
    expect(a).toMatchObject({ lu: true, valeur: { total: 41 } });
    expect(b).toEqual(a);
    expect(appels).toBe(1);
    const panne = (async () => new Response('', { status: 503 })) as unknown as typeof fetch;
    expect(await chercherDesEntreprises({ codePostal: '69002' }, panne)).toEqual({ lu: false, pourquoi: 'le registre des entreprises ne répond pas (503)' });
  });
});

