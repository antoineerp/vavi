/**
 * /projets/<id>/connecteurs — les logiciels que l'app appelle, branchés ici par le propriétaire (`lib/connecteurs`) : un
 * modèle complété (n8n, Algolia, Cloudinary, Cal.com, un autre projet Supabase) ou « autre logiciel » à clé. Leur clé est
 * scellée et ne se montre plus ; l'app les appelle par leur nom. Repris de constructor-v13 (`ConnecteursManager.tsx`).
 * Les comptes à relier (Gmail, Google Agenda, Google Sheets, 28/11) : un bouton mène à la page d'accord du fournisseur ;
 * l'accès se renouvelle seul ; un accord retiré se dit « à reconnecter », avec le bouton pour le faire.
 */
import { MODELES_DE_CONNECTEURS, FORMES_D_ACCES } from '@/lib/connecteurs/l-acces';
import { FOURNISSEURS, leClient, MODELES_OAUTH } from '@/lib/connecteurs/l-autorisation';
import { connecteurDuSecret, duSecret, secretDuConnecteur, type Connecteur } from '@/lib/connecteurs/les-connecteurs';
import { lesSecretsDuProjet } from '@/app/_partage/les-capacites-reelles';
import { brancherUnConnecteur, relierUnCompte, retirerUnConnecteur } from '../gestes';
import { leProjet, ERREURS } from '../le-projet';

export const dynamic = 'force-dynamic';

const MOTS = {
  fr: {
    titre: 'Connecteurs', explication: 'Branchez ici un logiciel que votre app doit appeler. Sa clé est chiffrée et ne se montre plus ; l’app l’appelle par son nom, jamais par une adresse qu’elle choisirait.',
    branches: 'Branchés', aucun: 'Aucun logiciel branché pour l’instant.', cle: 'clé posée', sansCle: 'sans clé', retirer: 'Retirer',
    ajouter: 'Brancher un logiciel', laCle: 'Clé (secrète)', ouTrouver: 'Où la trouver :', brancher: 'Brancher', remplacer: 'Remplacer',
    autre: 'Autre logiciel (API à clé)', autreAide: 'Un service qui donne une clé d’API : son adresse de base en https://, et la façon dont il attend la clé.',
    nom: 'Nom dans l’app (minuscules, ex. gestion)', libelle: 'Nom affiché', baseUrl: 'Adresse de base de l’API', forme: 'Façon d’envoyer la clé', entete: 'Nom de l’en-tête (si « en-tête »)',
    formes: { bearer: 'Authorization: Bearer', entete: 'En-tête nommé', basique: 'Authorization: Basic (identifiant:secret)', 'entete-et-bearer': 'En-tête nommé + Bearer' } as Record<string, string>,
    demander: (nom: string) => `Ensuite, demandez à Claude, par exemple : « Envoie chaque demande de devis à ${nom} ». Il appellera le connecteur « ${nom} ».`,
    fait: (nom: string) => `« ${nom} » est branché.`, retire: (nom: string) => `« ${nom} » est retiré.`, illisible: 'déclaration illisible : rebranchez-le',
    comptes: 'Relier un compte', comptesAide: 'Ces logiciels ne donnent pas de clé : vous reliez votre compte sur leur page, une fois. L’accès se renouvelle tout seul ; vous pouvez le retirer ici ou dans votre compte chez eux.',
    relier: (nom: string) => `Relier ${nom}`, reconnecter: 'Reconnecter', relie: (compte: string | null) => (compte ? `relié à ${compte}` : 'compte relié'),
    aReconnecter: 'à reconnecter : l’accès a été retiré ou a expiré', bientot: (f: string) => `La liaison avec ${f} s’ouvre bientôt.`,
    faitRelie: (nom: string) => `Le compte est relié : l’app et ses agents appellent « ${nom} ».`,
  },
  en: {
    titre: 'Connectors', explication: 'Plug in here a software your app must call. Its key is encrypted and never shown again; the app calls it by its name, never by an address it would choose.',
    branches: 'Plugged in', aucun: 'No software plugged in yet.', cle: 'key set', sansCle: 'no key', retirer: 'Remove',
    ajouter: 'Plug in a software', laCle: 'Key (secret)', ouTrouver: 'Where to find it:', brancher: 'Plug in', remplacer: 'Replace',
    autre: 'Other software (API with a key)', autreAide: 'A service that gives an API key: its base address in https://, and how it expects the key.',
    nom: 'Name in the app (lowercase, e.g. crm)', libelle: 'Display name', baseUrl: 'API base address', forme: 'How the key is sent', entete: 'Header name (for “header”)',
    formes: { bearer: 'Authorization: Bearer', entete: 'Named header', basique: 'Authorization: Basic (id:secret)', 'entete-et-bearer': 'Named header + Bearer' } as Record<string, string>,
    demander: (nom: string) => `Then ask Claude, for instance: “Send every quote request to ${nom}”. It will call the “${nom}” connector.`,
    fait: (nom: string) => `“${nom}” is plugged in.`, retire: (nom: string) => `“${nom}” is removed.`, illisible: 'unreadable declaration: plug it in again',
    comptes: 'Connect an account', comptesAide: 'These services give no key: you connect your account on their page, once. Access renews by itself; you can remove it here or in your account with them.',
    relier: (nom: string) => `Connect ${nom}`, reconnecter: 'Reconnect', relie: (compte: string | null) => (compte ? `connected to ${compte}` : 'account connected'),
    aReconnecter: 'to reconnect: access was removed or expired', bientot: (f: string) => `Connecting ${f} opens soon.`,
    faitRelie: (nom: string) => `The account is connected: the app and its agents call “${nom}”.`,
  },
} as const;

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params;
  const q = await searchParams;
  const { c, t } = await leProjet(id, 'connecteurs');
  const m = MOTS[c.langue];
  const noms = await c.projets.nomsDesSecrets(c.compte, id);
  const ouvrir = lesSecretsDuProjet(id);
  const branches = noms.lu ? await Promise.all(noms.valeur.map(connecteurDuSecret).filter((n): n is string => n !== null).map(async (nom) => {
    const s = await ouvrir(secretDuConnecteur(nom));
    const lu = s.lu && s.valeur ? duSecret(s.valeur) : null;
    const connecteur = lu?.ok ? lu.valeur : null as Connecteur | null;
    // Un compte relié (ou une déclaration illisible d'un nom de modèle) se reconnecte par le même bouton.
    const modeleOAuth = MODELES_OAUTH.find((x) => x.nomDansLApp === nom && (!connecteur || connecteur.oauth))?.id ?? null;
    return { nom, connecteur, modeleOAuth };
  })) : [];
  const message = q.fait === 'relie' && q.nom ? `${m.faitRelie(q.nom)} ${m.demander(q.nom)}` : q.fait === 'connecteur' && q.nom ? `${m.fait(q.nom)} ${m.demander(q.nom)}` : q.fait === 'retire' && q.nom ? m.retire(q.nom)
    : q.erreur ? `${t.erreur} ${ERREURS[q.erreur]?.[c.langue] ?? q.erreur}${q.detail ? ` ${q.detail}` : ''}` : null;
  const dejaBranche = new Set(branches.map((b) => b.nom));
  return (
    <main className="console">
      <h1>{m.titre}</h1>
      <p className="attenue">{m.explication}</p>
      {message && <div className="carte" role={q.erreur ? 'alert' : 'status'}>{message}</div>}

      <section className="carte">
        <h2>{m.branches}</h2>
        {!noms.lu ? <p role="alert">{t.erreur} {noms.pourquoi}</p> : branches.length === 0 ? <p className="attenue">{m.aucun}</p> : (
          <ul className="liste">
            {branches.map((b) => (
              <li key={b.nom}>
                <span><strong>{b.connecteur?.libelle ?? b.nom}</strong> <code>{b.nom}</code>{' '}
                  <span className="attenue">{!b.connecteur ? m.illisible : b.connecteur.oauth
                    ? `${new URL(b.connecteur.baseUrl).hostname} · ${b.connecteur.oauth.perdue ? m.aReconnecter : m.relie(b.connecteur.oauth.compte)}`
                    : `${new URL(b.connecteur.baseUrl).hostname} · ${b.connecteur.cle ? m.cle : m.sansCle}`}</span></span>
                <span style={{ display: 'flex', gap: '0.5rem' }}>
                  {b.modeleOAuth && <form action={relierUnCompte.bind(null, id, b.modeleOAuth)}><button type="submit">{m.reconnecter}</button></form>}
                  <form action={retirerUnConnecteur.bind(null, id, b.nom)}><button type="submit">{m.retirer}</button></form>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="carte">
        <h2>{m.comptes}</h2>
        <p className="attenue">{m.comptesAide}</p>
        <ul className="liste">
          {MODELES_OAUTH.map((x) => {
            const ouvert = leClient(FOURNISSEURS[x.fournisseur]) !== null;
            return (
              <li key={x.id}>
                <span><strong>{x.nom}</strong> <span className="attenue">— {x.aide[c.langue]}</span></span>
                {ouvert ? <form action={relierUnCompte.bind(null, id, x.id)}><button type="submit">{dejaBranche.has(x.nomDansLApp) ? m.reconnecter : m.relier(x.nom)}</button></form>
                  : <span className="attenue">{m.bientot(FOURNISSEURS[x.fournisseur].libelle)}</span>}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="carte">
        <h2>{m.ajouter}</h2>
        {MODELES_DE_CONNECTEURS.map((x) => (
          <details key={x.id} style={{ borderTop: '1px solid var(--bord)', padding: '0.6rem 0' }}>
            <summary style={{ cursor: 'pointer' }}><strong>{x.nom}</strong>{dejaBranche.has(x.nomDansLApp) && <span className="attenue"> · {m.cle}</span>} <span className="attenue">— {x.aide}</span></summary>
            <form action={brancherUnConnecteur.bind(null, id, x.id)} autoComplete="off" style={{ marginTop: '0.5rem' }}>
              <p className="attenue" style={{ marginTop: 0 }}>{m.ouTrouver} {x.ouTrouverLaCle}</p>
              {x.champs.map((ch) => (
                <label key={ch.id} style={{ display: 'block', marginBottom: '0.5rem' }}>{ch.libelle}<input name={ch.id} required placeholder={ch.exemple} style={{ width: '100%' }} /></label>
              ))}
              <label style={{ display: 'block', marginBottom: '0.5rem' }}>{m.laCle}<input name="cle" type="password" required style={{ width: '100%' }} /></label>
              <button type="submit">{dejaBranche.has(x.nomDansLApp) ? m.remplacer : m.brancher}</button>
            </form>
          </details>
        ))}
        <details style={{ borderTop: '1px solid var(--bord)', padding: '0.6rem 0' }}>
          <summary style={{ cursor: 'pointer' }}><strong>{m.autre}</strong> <span className="attenue">— {m.autreAide}</span></summary>
          <form action={brancherUnConnecteur.bind(null, id, 'autre')} autoComplete="off" style={{ marginTop: '0.5rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem' }}>{m.nom}<input name="nom" required pattern="[a-z][a-z0-9_]{1,40}" style={{ width: '100%' }} /></label>
            <label style={{ display: 'block', marginBottom: '0.5rem' }}>{m.libelle}<input name="libelle" maxLength={120} style={{ width: '100%' }} /></label>
            <label style={{ display: 'block', marginBottom: '0.5rem' }}>{m.baseUrl}<input name="baseUrl" type="url" required placeholder="https://api.exemple.fr/v1" style={{ width: '100%' }} /></label>
            <label style={{ display: 'block', marginBottom: '0.5rem' }}>{m.forme}
              <select name="forme" defaultValue="bearer" style={{ width: '100%' }}>{FORMES_D_ACCES.map((f) => <option key={f} value={f}>{m.formes[f]}</option>)}</select>
            </label>
            <label style={{ display: 'block', marginBottom: '0.5rem' }}>{m.entete}<input name="entete" placeholder="X-Api-Key" style={{ width: '100%' }} /></label>
            <label style={{ display: 'block', marginBottom: '0.5rem' }}>{m.laCle}<input name="cle" type="password" style={{ width: '100%' }} /></label>
            <button type="submit">{m.brancher}</button>
          </form>
        </details>
      </section>
    </main>
  );
}
