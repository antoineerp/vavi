/**
 * Les connecteurs (demande d'Antoine du 25/11 : « les connecteurs pré définis » de constructor) :
 *  - la forme d'une déclaration (un nom que le code écrit, une BASE https, ni identifiant ni IP en clair) ;
 *  - chaque modèle, complété, donne une déclaration acceptée ; la clé part selon sa forme ;
 *  - le chemin reste sous la base, jugé sur l'URL résolue ;
 *  - la porte de sortie : https seul, aucune adresse interne (même derrière un nom), redirections revalidées, la clé
 *    jamais renvoyée au saut suivant ;
 *  - l'appel par le nom, de bout en bout, sur une sortie simulée au transport et au DNS seuls.
 */
import { describe, expect, it } from 'vitest';
import { completerLeModele, entetesDeLAcces, lireLAcces, MODELES_DE_CONNECTEURS } from '@/lib/connecteurs/l-acces';
import { adresseInterne, fetchSortant, verifierSortie, type OptionsSortie } from '@/lib/connecteurs/la-sortie';
import { appelerUnConnecteur, connecteurDuSecret, duSecret, enSecret, lireUnConnecteur, secretDuConnecteur, urlDeLAppel, type Connecteur } from '@/lib/connecteurs/les-connecteurs';

const GESTION: Connecteur = { nom: 'gestion', libelle: 'Gestion', baseUrl: 'https://gestion.entreprise.test/api/v2', acces: { forme: 'bearer' }, cle: 'sk_1' };
const PUBLIC = async (nom: string) => (nom === 'gestion.entreprise.test' ? ['93.184.216.34'] : ['10.0.0.9']);

describe('la déclaration', () => {
  it('un nom que le code écrit, une BASE https ; chaque faute nommée', () => {
    expect(lireUnConnecteur({ nom: 'Gestion', libelle: 'Gestion', baseUrl: 'https://gestion.entreprise.test/api/v2/', cle: 'sk_1' }))
      .toEqual({ ok: true, valeur: GESTION });
    for (const baseUrl of ['http://gestion.test', 'https://u:p@gestion.test', 'https://gestion.test/?x=1', 'https://10.0.0.1/api', 'https://[::1]/']) {
      expect(lireUnConnecteur({ nom: 'gestion', baseUrl }).ok, baseUrl).toBe(false);
    }
    expect(lireUnConnecteur({ nom: 'Mon ERP!', baseUrl: 'https://erp.test' }).ok).toBe(false);
  });
  it('le secret garde la déclaration, relue ; son nom donne celui du connecteur, et rien d’autre', () => {
    expect(duSecret(enSecret(GESTION))).toEqual({ ok: true, valeur: GESTION });
    expect(duSecret('pas du json').ok).toBe(false);
    expect(secretDuConnecteur('gestion')).toBe('CONNECTEUR_GESTION');
    expect(connecteurDuSecret('CONNECTEUR_GESTION')).toBe('gestion');
    expect(connecteurDuSecret('ANTHROPIC_API_KEY')).toBeNull();
  });
  it('chaque modèle, complété, donne une déclaration acceptée ; la clé part selon sa forme', () => {
    for (const m of MODELES_DE_CONNECTEURS) {
      const valeurs = Object.fromEntries(m.champs.map((c) => [c.id, c.id === 'instance' ? 'https://moi.app.n8n.cloud/webhook' : c.id === 'entete' ? 'X-N8N-Token' : 'abc123']));
      const c = completerLeModele(m, valeurs, 'secret');
      expect(c.ok, m.id).toBe(true);
      if (c.ok) expect(lireUnConnecteur({ nom: m.nomDansLApp, libelle: m.nom, ...c.valeur }).ok, m.id).toBe(true);
    }
    const algolia = completerLeModele(MODELES_DE_CONNECTEURS.find((m) => m.id === 'algolia')!, { appId: 'APP1' }, 'k');
    expect(algolia.ok && entetesDeLAcces(algolia.valeur.acces, algolia.valeur.cle)).toEqual({ 'X-Algolia-Application-Id': 'APP1', 'X-Algolia-API-Key': 'k' });
    const cloud = completerLeModele(MODELES_DE_CONNECTEURS.find((m) => m.id === 'cloudinary')!, { cloudName: 'c', apiKey: '123' }, 's');
    expect(cloud.ok && entetesDeLAcces(cloud.valeur.acces, cloud.valeur.cle).authorization).toBe(`Basic ${Buffer.from('123:s').toString('base64')}`);
    expect(completerLeModele(MODELES_DE_CONNECTEURS.find((m) => m.id === 'algolia')!, {}, 'k').ok).toBe(false);
  });
  it('un connecteur ne pose jamais un en-tête de transport ou d’identité', () => {
    expect(lireLAcces({ forme: 'entete', entete: 'Cookie' }).ok).toBe(false);
    expect(lireLAcces({ forme: 'bearer', fixes: { Host: 'ailleurs' } }).ok).toBe(false);
    expect(lireLAcces({ forme: 'bearer', fixes: { 'X-V': 'a\r\nX-Injecte: 1' } }).ok).toBe(false);
  });
});

describe('le chemin', () => {
  it('reste sous la base déclarée, jugé sur l’URL résolue', () => {
    expect(urlDeLAppel(GESTION, '/devis')).toEqual({ ok: true, valeur: 'https://gestion.entreprise.test/api/v2/devis' });
    expect(urlDeLAppel(GESTION, 'clients?page=2')).toEqual({ ok: true, valeur: 'https://gestion.entreprise.test/api/v2/clients?page=2' });
    for (const c of ['https://ailleurs.test/x', '//ailleurs.test/x', '../../admin', '..%2f..%2fadmin', 'javascript:alert(1)']) expect(urlDeLAppel(GESTION, c).ok, c).toBe(false);
  });
});

describe('la porte de sortie', () => {
  it('aucune adresse interne, IPv4 encapsulée comprise', () => {
    for (const a of ['127.0.0.1', '10.1.2.3', '169.254.169.254', '172.20.0.1', '192.168.1.1', '100.64.0.1', '::1', 'fd00::1', '::ffff:169.254.169.254']) expect(adresseInterne(a), a).toBe(true);
    expect(adresseInterne('93.184.216.34')).toBe(false);
  });
  it('https seul, par nom, dans la liste, et un nom qui résout en interne est refusé', async () => {
    expect((await verifierSortie('http://gestion.entreprise.test/', ['gestion.entreprise.test'], PUBLIC)).ok).toBe(false);
    expect((await verifierSortie('https://93.184.216.34/', ['93.184.216.34'], PUBLIC)).ok).toBe(false);
    expect((await verifierSortie('https://gestion.entreprise.test.attaquant.test/', ['gestion.entreprise.test'], PUBLIC)).ok).toBe(false);
    expect(await verifierSortie('https://interne.entreprise.test/', ['interne.entreprise.test'], PUBLIC)).toMatchObject({ ok: false, raison: 'adresse-interne' });
    expect(await verifierSortie('https://gestion.entreprise.test/x', ['gestion.entreprise.test'], PUBLIC)).toEqual({ ok: true, hote: 'gestion.entreprise.test' });
  });
  it('une redirection vers les métadonnées du cloud est refusée, et la clé ne part qu’au premier saut', async () => {
    const vus: { url: string; entetes?: unknown }[] = [];
    const transport = (async (u: string, init: RequestInit) => {
      vus.push({ url: String(u), entetes: init.headers });
      return vus.length === 1 ? new Response(null, { status: 302, headers: { location: 'https://gestion.entreprise.test/suite' } })
        : vus.length === 2 ? new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/latest/meta-data/' } }) : new Response('x');
    }) as unknown as typeof fetch;
    const r = await fetchSortant('https://gestion.entreprise.test/api', { hotesAutorises: ['gestion.entreprise.test'], entetes: { authorization: 'Bearer sk' }, resolveur: PUBLIC, transport });
    expect(r).toMatchObject({ ok: false, raison: 'schema-refuse' });
    expect(vus.map((v) => v.url)).toEqual(['https://gestion.entreprise.test/api', 'https://gestion.entreprise.test/suite']);
    expect(vus[1]!.entetes).toBeUndefined();
  });
  it('le corps s’arrête au plafond', async () => {
    const transport = (async () => new Response('a'.repeat(5000))) as unknown as typeof fetch;
    const r = await fetchSortant('https://gestion.entreprise.test/', { hotesAutorises: ['gestion.entreprise.test'], resolveur: PUBLIC, transport, tailleMaxOctets: 1000 });
    expect('corps' in r && r.corps.length).toBe(1000);
  });
});

describe('l’appel par le nom', () => {
  const sorties: { url: string; o: OptionsSortie }[] = [];
  const d = (branches: Record<string, Connecteur>) => ({
    noms: async () => ({ ok: true as const, valeur: Object.keys(branches) }),
    lire: async (nom: string) => ({ ok: true as const, valeur: branches[nom] ?? null }),
    sortir: (url: string, o: OptionsSortie) => {
      sorties.push({ url, o });
      return fetchSortant(url, { ...o, resolveur: PUBLIC, transport: (async () => new Response(JSON.stringify({ id: 'D-1' }), { status: 201 })) as unknown as typeof fetch });
    },
  });
  it('la clé part vers l’hôte déclaré seul ; la réponse revient lue', async () => {
    const r = await appelerUnConnecteur('gestion', { chemin: '/devis', methode: 'post', requete: { montant: 120 } }, d({ gestion: GESTION }));
    expect(r).toMatchObject({ ok: true, statut: 201, repondu: true, donnees: { id: 'D-1' }, hote: 'gestion.entreprise.test' });
    const s = sorties.at(-1)!;
    expect(s.url).toBe('https://gestion.entreprise.test/api/v2/devis');
    expect(s.o).toMatchObject({ hotesAutorises: ['gestion.entreprise.test'], methode: 'POST', corps: '{"montant":120}' });
    expect(s.o.entetes?.authorization).toBe('Bearer sk_1');
  });
  it('un nom inconnu nomme les branchés ; aucun branché le dit ; un chemin hors base est refusé sans sortir', async () => {
    const avant = sorties.length;
    expect(await appelerUnConnecteur('erp', {}, d({ gestion: GESTION }))).toMatchObject({ ok: false, statut: 400, connus: ['gestion'] });
    expect(await appelerUnConnecteur('erp', {}, d({}))).toMatchObject({ ok: false, detail: expect.stringContaining('console vavi') });
    expect(await appelerUnConnecteur('gestion', { chemin: 'https://attaquant.test/' }, d({ gestion: GESTION }))).toMatchObject({ ok: false, erreur: 'chemin refusé' });
    expect(sorties.length).toBe(avant);
  });
});
