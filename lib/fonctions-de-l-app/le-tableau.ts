/**
 * LE TABLEAU DES FONCTIONS D'UNE APP — ce que l'app fait, lu de son app.json, pour la console. PUR.
 *
 * Remplace dans vavi la liste des fonctions du tableau de bord de constructor-v13 (`app/projects/[projectId]/manage`).
 * Chaque ligne dit son état réel : `actif` (vavi le sert), `a_regler` (déclaré, attend un geste du propriétaire, nommé),
 * `pas_encore` (déclaré dans app.json, mais vavi ne le fait pas encore : les automatisations et les agents, lot 7). Jamais
 * « actif » pour ce que vavi ne fait pas.
 */
import type { Manifeste } from '@/lib/backend/app/manifeste';

export type EtatDUneFonction = 'actif' | 'a_regler' | 'pas_encore';
export interface UneFonction { readonly libelle: string; readonly detail: string; readonly etat: EtatDUneFonction; readonly ou?: 'donnees' | 'messages' | 'encaisser' | 'secrets' | 'registre' }
export interface UneSection { readonly titre: string; readonly fonctions: readonly UneFonction[] }

type Langue = 'fr' | 'en';
const M = {
  fr: { nature: 'Nature', langues: 'Langues', ecrans: 'Écrans', roles: 'Rôles et accès', donnees: 'Données', public: 'Ce que les visiteurs envoient', vente: 'Vente',
    capacites: 'Capacités', auto: 'Automatisations et agents', natures: { site: 'site vitrine', boutique: 'boutique', app: 'app', jeu: 'jeu', document: 'document' } as Record<string, string>, boutique: 'boutique',
    noms: { ia: 'IA', courriel: 'envoi de courriels', pdf: 'documents PDF', lecture: 'lecture de fichiers', lieu: 'adresses et lieux', recherche: 'recherche par le sens', connecteur: 'logiciel branché', sms: 'SMS', telephone: 'téléphone', agenda: 'agenda', ephemeride: 'éphémérides', phototheque: 'photothèque', film: 'films de photos', prospects: 'registre des entreprises', coffre: 'coffre de documents' } as Record<string, string>,
    pour: 'pour', visiteur: 'visiteurs', obtenu: { proprietaire: 'le vôtre', inscription: 'par inscription', invitation: 'sur invitation', habilitation: 'donné par un membre', paiement: 'acheté' } as Record<string, string>,
    lignes: (n: number) => `${n} table${n > 1 ? 's' : ''}`, cycle: (etats: string) => `suit un cycle : ${etats}`, sansCycle: 'sans cycle',
    envoi: 'une personne sans compte y envoie une ligne, gardée et transmise par courriel', panier: 'un panier, payé par Stripe sur votre compte relié',
    prix: (p: number | null, d: string) => (p === null ? 'prix à fixer : rien ne s’encaisse avant' : `${p} ${d}`), aucune: 'aucune',
    pasEncore: 'déclarée dans l’app, pas encore active dans vavi', secret: 'demande la clé de votre fournisseur (Secrets)', declare: 'déclarée' },
  en: { nature: 'Kind', langues: 'Languages', ecrans: 'Screens', roles: 'Roles and access', donnees: 'Data', public: 'What visitors send', vente: 'Sales',
    capacites: 'Capabilities', auto: 'Automations and agents', natures: { site: 'showcase site', boutique: 'shop', app: 'app', jeu: 'game', document: 'document' } as Record<string, string>, boutique: 'shop',
    noms: { ia: 'AI', courriel: 'sending e-mails', pdf: 'PDF documents', lecture: 'reading files', lieu: 'addresses and places', recherche: 'search by meaning', connecteur: 'connected software', sms: 'SMS', telephone: 'phone', agenda: 'calendar', ephemeride: 'ephemerides', phototheque: 'photo library', film: 'photo films', prospects: 'company register', coffre: 'document vault' } as Record<string, string>,
    pour: 'for', visiteur: 'visitors', obtenu: { proprietaire: 'yours', inscription: 'by sign-up', invitation: 'by invitation', habilitation: 'given by a member', paiement: 'bought' } as Record<string, string>,
    lignes: (n: number) => `${n} table${n > 1 ? 's' : ''}`, cycle: (etats: string) => `follows a cycle: ${etats}`, sansCycle: 'no cycle',
    envoi: 'a person without an account sends a row here, kept and forwarded by e-mail', panier: 'a cart, paid through Stripe on your linked account',
    prix: (p: number | null, d: string) => (p === null ? 'price to set: nothing is charged before' : `${p} ${d}`), aucune: 'none',
    pasEncore: 'declared in the app, not active in vavi yet', secret: 'needs your provider’s key (Secrets)', declare: 'declared' },
} as const;

/** Les capacités qui demandent une clé du propriétaire avant de servir. */
const AVEC_UNE_CLE = new Set(['sms', 'telephone', 'connecteur', 'agenda', 'ia']);

/** PURE — le tableau, section par section ; une section sans rien à dire n'apparaît pas. */
export function leTableauDesFonctions(m: Manifeste, langue: Langue, secrets: ReadonlySet<string> = new Set()): readonly UneSection[] {
  const t = M[langue];
  const libelleDuRole = (nom: string): string => (nom === 'visiteur' ? t.visiteur : m.roles.find((r) => r.nom === nom)?.libelle ?? nom);
  const sections: UneSection[] = [
    { titre: t.nature, fonctions: [{ libelle: t.natures[m.nature] ?? m.nature, detail: `${t.langues} : ${[m.langues.principale, ...m.langues.autres].join(', ')}`, etat: 'actif' }] },
    { titre: t.ecrans, fonctions: m.ecrans.map((e) => ({ libelle: e.titre, detail: `${t.pour} ${e.pour.map(libelleDuRole).join(', ')}`, etat: 'actif' as const })) },
    { titre: t.roles, fonctions: m.roles.map((r) => ({ libelle: r.libelle, etat: 'actif' as const,
      detail: r.obtenu === 'paiement' && r.offre ? `${t.obtenu.paiement} · ${t.prix(r.offre.prix, r.offre.devise ?? m.vente?.devise ?? 'EUR')}` : t.obtenu[r.obtenu] ?? r.obtenu })) },
    { titre: t.donnees, fonctions: m.tables.map((x) => ({ libelle: x.libelle, ou: 'donnees' as const, etat: 'actif' as const,
      detail: x.cycle ? t.cycle(x.cycle.etats.map((e) => x.cycle!.libelles[e] ?? e).join(' → ')) : t.sansCycle })) },
    { titre: t.public, fonctions: m.tables.filter((x) => x.ecriture.includes('visiteur')).map((x) => ({ libelle: x.libelle, detail: t.envoi, etat: 'actif' as const, ou: 'messages' as const })) },
    { titre: t.vente, fonctions: [
      ...(m.fonctions.panier || m.tables.some((x) => x.vente) ? [{ libelle: m.tables.find((x) => x.vente)?.libelle ?? t.boutique, detail: t.panier, etat: 'actif' as const, ou: 'encaisser' as const }] : []),
      ...m.roles.filter((r) => r.obtenu === 'paiement').map((r) => ({ libelle: r.libelle, detail: t.prix(r.offre?.prix ?? null, r.offre?.devise ?? m.vente?.devise ?? 'EUR'),
        etat: (r.offre?.prix ?? null) === null ? 'a_regler' as const : 'actif' as const, ou: 'encaisser' as const })),
    ] },
    { titre: t.capacites, fonctions: Object.entries(m.fonctions).filter(([k, v]) => v === true && k !== 'panier').map(([k]) => ({
      libelle: t.noms[k] ?? k, ...(AVEC_UNE_CLE.has(k) && secrets.size === 0 ? { detail: t.secret, etat: 'a_regler' as const, ou: 'secrets' as const } : { detail: t.declare, etat: 'actif' as const }) })) },
    { titre: t.auto, fonctions: [
      ...m.automatisations.map((a) => ({ libelle: a.dit, detail: t.pasEncore, etat: 'pas_encore' as const })),
      ...m.agents.map((a) => ({ libelle: a.libelle, detail: t.pasEncore, etat: 'pas_encore' as const })),
    ] },
  ];
  return sections.filter((s) => s.fonctions.length > 0);
}
