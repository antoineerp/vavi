/**
 * Le domaine à soi d'un site : le domaine saisi relu (jamais celui de vavi ni de Fly), la racine basculée vers www avec
 * sa redirection dite ; l'état du certificat lu chez Fly ; l'aiguillage (le domaine sert le site en ligne, le sous-domaine
 * y renvoie, l'aperçu jamais) ; la carte des domaines gardée quand la base tombe.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { laMigrationDesProjets } from '@/lib/projets/le-sql-des-projets';
import { demarrer, POSTGRES_PRESENT, type UnPostgres } from './aides/un-postgres';
import { laCibleDns, lEtatDuCertificat, lePlanDns } from '@/lib/domaines/le-domaine';
import { ajouterLeCertificat, flyDeLEnvironnement, lEtatChezFly } from '@/lib/domaines/les-certificats';
import { laCarte, laCarteDesDomaines } from '@/lib/domaines/les-domaines';
import { laDecision } from '@/lib/publication/les-adresses-des-apps';
import { laMigrationDesDomaines, SQL_DES_DOMAINES } from '@/lib/domaines/le-sql-des-domaines';

const P = '0f1e2d3c-4b5a-4968-8776-655443322110';
const O = { cible: 'vavi.fly.dev', interdits: ['vavi.dev', 'vavi.app'] };

describe('le domaine saisi', () => {
  it('nettoie la saisie et donne l’unique CNAME à créer', () => {
    expect(lePlanDns(' HTTPS://Boutique.Le-The.fr/accueil?x=1 ', O)).toEqual({ ok: true, hote: 'boutique.le-the.fr', racine: null, enregistrement: { type: 'CNAME', nom: 'boutique', valeur: 'vavi.fly.dev' } });
    expect(lePlanDns('www.le-the.fr.', O)).toMatchObject({ ok: true, hote: 'www.le-the.fr', enregistrement: { nom: 'www' } });
  });
  it('bascule un domaine racine vers www et le dit', () => {
    expect(lePlanDns('le-the.fr', O)).toMatchObject({ ok: true, hote: 'www.le-the.fr', racine: 'le-the.fr' });
  });
  it('refuse ce qui n’est pas un domaine, et les domaines de vavi, de Fly ou d’exemple', () => {
    for (const x of ['', 'pas un domaine', 'localhost', 'x.fly.dev', 'apercu-x.vavi.app', 'www.vavi.dev', 'example.com', `${'a'.repeat(64)}.fr`]) expect(lePlanDns(x, O).ok, x).toBe(false);
  });
  it('lit l’état du certificat chez Fly', () => {
    expect(lEtatDuCertificat({ clientStatus: 'Ready' })).toBe('actif');
    expect(lEtatDuCertificat({ clientStatus: 'Awaiting certificates', configured: false, emis: 1 })).toBe('actif');
    expect(lEtatDuCertificat({ clientStatus: 'Awaiting cert', configured: true })).toBe('dns_vu');
    expect(lEtatDuCertificat({ clientStatus: 'Awaiting configuration', configured: false })).toBe('en_attente');
    expect(lEtatDuCertificat(null)).toBe('inconnu');
    expect(laCibleDns({ FLY_APP_NAME: 'vavi-prod' })).toBe('vavi-prod.fly.dev');
  });
});

describe('les certificats chez Fly', () => {
  const fly = (reponse: unknown, vus: unknown[] = []) => ({ jeton: 't', app: 'vavi', appeler: (async (_u: unknown, i: { body: string }) => { vus.push(JSON.parse(i.body)); return new Response(JSON.stringify(reponse)); }) as unknown as typeof fetch });
  it('demande le certificat de l’hôte à l’app de vavi ; déjà demandé, c’est le même', async () => {
    const vus: unknown[] = [];
    expect(await ajouterLeCertificat(fly({ data: {} }, vus), 'www.le-the.fr')).toEqual({ lu: true, valeur: true });
    expect(vus[0]).toMatchObject({ variables: { appId: 'vavi', hostname: 'www.le-the.fr' } });
    expect((await ajouterLeCertificat(fly({ errors: [{ message: 'Hostname has already been taken' }] }), 'www.le-the.fr')).lu).toBe(true);
    expect((await ajouterLeCertificat(fly({ errors: [{ message: 'Unauthorized' }] }), 'www.le-the.fr')).lu).toBe(false);
  });
  it('lit l’état émis, et « inconnu » quand Fly ne le connaît pas', async () => {
    expect(await lEtatChezFly(fly({ data: { app: { certificate: { clientStatus: 'Ready', configured: true, issued: { nodes: [{ type: 'rsa' }] } } } } }), 'h.fr')).toEqual({ lu: true, valeur: 'actif' });
    expect(await lEtatChezFly(fly({ data: { app: { certificate: null } } }), 'h.fr')).toEqual({ lu: true, valeur: 'inconnu' });
    expect(flyDeLEnvironnement({})).toBeNull();
  });
});

describe('l’aiguillage par le domaine', () => {
  const o = { console: 'https://www.vavi.dev', domaine: 'vavi.app', domaines: laCarte([{ hote: 'www.le-the.fr', projet: P }]) };
  it('le domaine branché sert le site en ligne, ses routes d’app passent', () => {
    expect(laDecision('www.le-the.fr', '/contact', '', o)).toEqual({ faire: 'reecrire', chemin: `/s/${P}/contact` });
    expect(laDecision('WWW.LE-THE.FR:443', '/', '', o)).toEqual({ faire: 'reecrire', chemin: `/s/${P}/` });
    expect(laDecision('www.le-the.fr', `/api/forms/${P}`, '', o)).toEqual({ faire: 'passer' });
    // Jamais la console sur un domaine de site.
    expect(laDecision('www.le-the.fr', '/projets', '', o)).toEqual({ faire: 'reecrire', chemin: `/s/${P}/projets` });
  });
  it('le sous-domaine du site renvoie au domaine branché ; l’aperçu reste au sien', () => {
    expect(laDecision(`${P}.vavi.app`, '/a', '?b=1', o)).toEqual({ faire: 'rediriger', adresse: 'https://www.le-the.fr/a?b=1' });
    expect(laDecision(`apercu-${P}.vavi.app`, '/a', '', o)).toEqual({ faire: 'reecrire', chemin: `/p/${P}/a` });
    expect(laDecision(`${P}.vavi.app`, `/api/pay/${P}/x`, '', o)).toEqual({ faire: 'passer' });
  });
  it('sans domaine branché, rien ne change', () => {
    expect(laDecision(`${P}.vavi.app`, '/a', '', { ...o, domaines: laCarte([]) })).toEqual({ faire: 'reecrire', chemin: `/s/${P}/a` });
    expect(laDecision('www.vavi.dev', '/projets', '', o)).toEqual({ faire: 'passer' });
  });
  it('la carte est relue au plus toutes les 60 s, et gardée quand la base tombe', async () => {
    let n = 0;
    const lire = async () => { n += 1; return n === 1 ? { lu: true as const, valeur: [{ hote: 'a.fr', projet: P }] } : { lu: false as const, pourquoi: 'panne' }; };
    expect((await laCarteDesDomaines(lire, 1_000_000)).parHote.get('a.fr')).toBe(P);
    expect((await laCarteDesDomaines(lire, 1_030_000)).parHote.get('a.fr')).toBe(P);
    expect(n).toBe(1);
    expect((await laCarteDesDomaines(lire, 1_100_000)).parHote.get('a.fr')).toBe(P);
    expect(n).toBe(2);
  });
  it('la table des domaines : un hôte à un projet, réservée à la plateforme', () => {
    expect(SQL_DES_DOMAINES).toContain('hote TEXT PRIMARY KEY');
    expect(SQL_DES_DOMAINES).toContain('projet UUID NOT NULL UNIQUE');
    expect(SQL_DES_DOMAINES).toContain('REVOKE ALL ON public.vavi_domaines FROM PUBLIC, anon, authenticated');
    expect(laMigrationDesDomaines()).toContain('vavi_domaines');
  });
});

describe.runIf(POSTGRES_PRESENT)('la table des domaines, sur un PostgreSQL réel', () => {
  const MOI = '11111111-1111-1111-1111-111111111111';
  const Q = '0f1e2d3c-4b5a-4968-8776-655443322111';
  let pg: UnPostgres;
  beforeAll(() => {
    pg = demarrer('vavi-les-domaines', 55811);
    pg.admin(`insert into auth.users (id, email, email_confirmed_at) values ('${MOI}', 'moi@a.fr', now());`);
    pg.admin(laMigrationDesProjets());
    pg.admin(laMigrationDesDomaines());
    pg.admin(laMigrationDesDomaines()); // rejouée sans dommage
    pg.service(`insert into public.vavi_projets (id, proprietaire, nom) values ('${P}', '${MOI}', 'Un'), ('${Q}', '${MOI}', 'Deux');`);
  }, 60_000);
  afterAll(() => pg?.arreter());

  it('un hôte n’est qu’à un projet, un projet n’a qu’un domaine, un hôte mal formé est refusé', () => {
    expect(pg.service(`insert into public.vavi_domaines (hote, projet) values ('www.le-the.fr', '${P}');`).ok).toBe(true);
    expect(pg.service(`insert into public.vavi_domaines (hote, projet) values ('www.le-the.fr', '${Q}');`).ok).toBe(false);
    expect(pg.service(`insert into public.vavi_domaines (hote, projet) values ('www.autre.fr', '${P}');`).ok).toBe(false);
    expect(pg.service(`insert into public.vavi_domaines (hote, projet) values ('WWW.MAJ.FR', '${Q}');`).ok).toBe(false);
    expect(pg.service(`insert into public.vavi_domaines (hote, projet) values ('a b.fr', '${Q}');`).ok).toBe(false);
  });
  it('ni un compte ni le navigateur ne lisent la table', () => {
    for (const qui of [MOI, null]) expect(pg.comme(qui, 'select * from public.vavi_domaines;').ok).toBe(false);
  });
  it('un projet effacé emporte son domaine', () => {
    pg.service(`delete from public.vavi_projets where id = '${P}';`);
    expect(pg.service('select count(*) from public.vavi_domaines;').sortie.trim()).toBe('0');
  });
});
