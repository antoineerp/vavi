/** La porte des capacités (déclarée, membre, plafond), le courriel par le fournisseur du propriétaire, les lieux. */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ouvrirLaPorte, type DependancesDeLaPorte } from '@/lib/capacites/la-porte';
import { envoyer, laRequete, leFournisseur, lireLEnvoi, type Appel } from '@/lib/capacites/le-courriel';
import { chercherUnLieu, laQuestion, lesLieux } from '@/lib/capacites/les-lieux';
import { CHEMIN_DE_LA_MIGRATION_DES_CAPACITES, laMigrationDesCapacites } from '@/lib/capacites/le-sql-des-capacites';
import type { Manifeste } from '@/lib/backend/app/manifeste';
import { unManifeste } from '../aides/un-manifeste';

const P = '0f1e2d3c-4b5a-4968-8776-655443322110';
const ADA = 'cccccccc-0000-4000-8000-00000000000c';
const M = unManifeste({ nature: 'app', roles: [{ nom: 'gerant', libelle: 'Gérant', obtenu: 'proprietaire' }],
  tables: [{ nom: 'note', libelle: 'Notes', appartenance: 'personnelle', lecture: ['gerant'], ecriture: ['gerant'], champs: [{ nom: 'objet', libelle: 'Objet', type: 'texte' }] }],
  fonctions: { courriel: true, lieu: true } });
const PL = { fenetreS: 60, parProjet: 3, parCompte: 2 };

function porte(x: { manifeste?: Manifeste | null; membres?: string[] } = {}): DependancesDeLaPorte & { comptes: Map<string, number> } {
  const comptes = new Map<string, number>();
  return {
    comptes,
    leManifeste: async (p) => ({ lu: true, valeur: p === P ? (x.manifeste === undefined ? M : x.manifeste) : null }),
    laPersonne: async (j) => (j === 'session-ada' ? ADA : j === 'session-autre' ? 'dddddddd-0000-4000-8000-00000000000d' : null),
    estMembre: async (_p, c) => ({ lu: true, valeur: (x.membres ?? [ADA]).includes(c) }),
    plafond: async (cle, _f, max) => { const n = (comptes.get(cle) ?? 0) + 1; comptes.set(cle, n); return { lu: true, valeur: n <= max }; },
  };
}

describe('la porte des capacités', () => {
  it('une fonction que l’app ne déclare pas n’existe pas pour elle', async () => {
    expect(await ouvrirLaPorte(porte(), P, 'sms', 'session-ada', PL)).toMatchObject({ ouverte: false, statut: 404 });
    expect(await ouvrirLaPorte(porte(), 'x', 'courriel', 'session-ada', PL)).toMatchObject({ ouverte: false, statut: 404 });
  });
  it('une fonction qui dépense exige un membre de CETTE app ; un compte d’ailleurs n’y suffit pas', async () => {
    expect(await ouvrirLaPorte(porte(), P, 'courriel', null, PL)).toMatchObject({ ouverte: false, statut: 401 });
    expect(await ouvrirLaPorte(porte(), P, 'courriel', 'session-autre', PL)).toMatchObject({ ouverte: false, statut: 403 });
    expect(await ouvrirLaPorte(porte(), P, 'courriel', 'session-ada', PL)).toMatchObject({ ouverte: true, compte: ADA });
  });
  it('un lieu s’ouvre au visiteur ; le plafond du projet et celui du compte tiennent', async () => {
    const d = porte();
    expect(await ouvrirLaPorte(d, P, 'lieu', null, PL)).toMatchObject({ ouverte: true, compte: null });
    expect(await ouvrirLaPorte(d, P, 'lieu', 'session-ada', PL)).toMatchObject({ ouverte: true, compte: ADA });
    expect(await ouvrirLaPorte(d, P, 'lieu', 'session-ada', PL)).toMatchObject({ ouverte: true });
    expect(await ouvrirLaPorte(d, P, 'lieu', null, PL)).toMatchObject({ ouverte: false, statut: 429 });
    const e = porte();
    await ouvrirLaPorte(e, P, 'courriel', 'session-ada', { ...PL, parProjet: 100 });
    await ouvrirLaPorte(e, P, 'courriel', 'session-ada', { ...PL, parProjet: 100 });
    expect(await ouvrirLaPorte(e, P, 'courriel', 'session-ada', { ...PL, parProjet: 100 })).toMatchObject({ ouverte: false, statut: 429 });
  });
});

const secrets = (s: Record<string, string>) => async (n: string) => ({ lu: true as const, valeur: s[n] ?? null });

describe('le courriel', () => {
  it('l’envoi relu : adresses valides, dédoublonnées ; un destinataire faux refuse tout', () => {
    expect(lireLEnvoi({ to: ['Ada@a.fr', 'ada@a.fr'], subject: 'Bonjour\r\nBcc: x@y.z', text: 'Salut' })).toEqual({ lu: true, valeur: { a: ['ada@a.fr'], sujet: 'Bonjour Bcc: x@y.z', texte: 'Salut' } });
    expect(lireLEnvoi({ to: ['ada@a.fr', 'pas une adresse'], subject: 's', text: 't' })).toMatchObject({ lu: false });
    expect(lireLEnvoi({ to: 'ada@a.fr', subject: '', text: 't' })).toMatchObject({ lu: false });
  });
  it('le fournisseur du propriétaire, dans l’ordre ; sans clé ou sans expéditeur, aucun — jamais celui de vavi', async () => {
    expect(await leFournisseur(secrets({ RESEND_API_KEY: 're_x', BREVO_API_KEY: 'b', COURRIEL_EXPEDITEUR: 'moi@a.fr' }))).toEqual({ lu: true, valeur: { fournisseur: 'brevo', cles: ['b'], de: 'moi@a.fr' } });
    expect(await leFournisseur(secrets({ MAILJET_API_KEY: 'k', RESEND_API_KEY: 're_x', COURRIEL_EXPEDITEUR: 'moi@a.fr' }))).toMatchObject({ valeur: { fournisseur: 'resend' } });
    expect(await leFournisseur(secrets({ RESEND_API_KEY: 're_x' }))).toEqual({ lu: true, valeur: null });
    expect(await leFournisseur(secrets({ COURRIEL_EXPEDITEUR: 'moi@a.fr' }))).toEqual({ lu: true, valeur: null });
  });
  it('chaque fournisseur reçoit sa forme ; un refus rend son message', async () => {
    const e = { a: ['ada@a.fr'], sujet: 'S', texte: 'T' };
    expect(JSON.parse(laRequete({ fournisseur: 'brevo', cles: ['b'], de: 'moi@a.fr' }, e).body)).toEqual({ sender: { email: 'moi@a.fr' }, to: [{ email: 'ada@a.fr' }], subject: 'S', textContent: 'T' });
    expect(laRequete({ fournisseur: 'mailjet', cles: ['k', 's'], de: 'moi@a.fr' }, e).headers.Authorization).toBe(`Basic ${Buffer.from('k:s').toString('base64')}`);
    const ok: Appel = async () => ({ ok: true, status: 200, text: async () => '{"id":"m_1"}', headers: { get: () => null } });
    expect(await envoyer(ok, { fournisseur: 'resend', cles: ['re'], de: 'moi@a.fr' }, e)).toEqual({ lu: true, valeur: { id: 'm_1', fournisseur: 'resend' } });
    const non: Appel = async () => ({ ok: false, status: 403, text: async () => 'domain not verified', headers: { get: () => null } });
    expect(await envoyer(non, { fournisseur: 'resend', cles: ['re'], de: 'moi@a.fr' }, e)).toEqual({ lu: false, pourquoi: 'resend 403 : domain not verified' });
  });
});

describe('les lieux', () => {
  it('la demande relue, la réponse avec son fuseau', () => {
    expect(laQuestion({ query: ' Lyon ' })).toEqual({ lu: true, valeur: { question: 'Lyon', limite: 5, langue: 'fr' } });
    expect(laQuestion({})).toMatchObject({ lu: false });
    expect(lesLieux([{ display_name: 'Lyon, France', lat: '45.76', lon: '4.83' }, { display_name: '', lat: '1', lon: '1' }]))
      .toEqual([{ label: 'Lyon, France', latitude: 45.76, longitude: 4.83, timezone: 'Europe/Paris' }]);
  });
  it('un lieu trouvé ne se redemande pas ; une panne est dite', async () => {
    let appels = 0;
    const osm = (async () => { appels += 1; return new Response(JSON.stringify([{ display_name: 'Québec', lat: '46.8', lon: '-71.2' }])); }) as unknown as typeof fetch;
    const q = { question: 'Québec essai', limite: 1, langue: 'fr' };
    expect(await chercherUnLieu(q, osm)).toEqual({ lu: true, valeur: [{ label: 'Québec', latitude: 46.8, longitude: -71.2, timezone: 'America/Toronto' }] });
    await chercherUnLieu(q, osm);
    expect(appels).toBe(1);
    const panne = (async () => new Response('', { status: 503 })) as unknown as typeof fetch;
    expect(await chercherUnLieu({ ...q, question: 'ailleurs' }, panne)).toEqual({ lu: false, pourquoi: 'le service des lieux ne répond pas (503)' });
  });
});

describe('la migration des capacités', () => {
  it('est exactement celle que sa source écrit (sinon : npx tsx scripts/ecrire-la-migration-du-socle.ts)', () => {
    expect(readFileSync(join(__dirname, '../..', CHEMIN_DE_LA_MIGRATION_DES_CAPACITES), 'utf8')).toBe(laMigrationDesCapacites());
  });
});
