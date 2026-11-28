'use server';
/**
 * Les gestes de la console sur un projet : publier, revenir à un état, poser un secret, réécrire un texte de l'aperçu. Chacun vérifie le compte
 * connecté (Supabase), puis passe par les fonctions de la plateforme, qui vérifient que le projet est à lui. Le résultat
 * revient à la page par son adresse (`?fait=`), jamais une valeur secrète.
 */
import { leJetonGoogle } from '@/lib/seo/la-note';
import { classerUnMessage, effacerUnMessage } from '@/lib/formulaires/sur-supabase';
import { completerLeModele, MODELES_DE_CONNECTEURS } from '@/lib/connecteurs/l-acces';
import { enSecret, FORME_DU_NOM, lireUnConnecteur, PREFIXE_DU_SECRET, secretDuConnecteur } from '@/lib/connecteurs/les-connecteurs';
import { redirect } from 'next/navigation';
import { LONGUEUR_DES_NOTES } from '@/lib/projets/le-sql-des-projets';
import { laConsole } from '@/app/_partage/la-console';
import { mettreLApercuEnLigne, uneAUneParCompte } from '@/lib/projets/la-mise-en-ligne';
import { magasinS3 } from '@/lib/publication/le-magasin';
import { revenirDepuisLaConsole } from '@/lib/versions/revenir';
import { ecrireUneLiaison, scellerUnSecret } from '@/lib/mcp/les-jetons';
import { adresseDAccord, enTexteDuClient, FOURNISSEURS_CONNUS, lireLeClient, MODELES_OAUTH, PREFIXE_DU_CLIENT, RETOUR_DE_LA_LIAISON, secretDuClient, unVerificateur, type NomDeFournisseur } from '@/lib/connecteurs/l-autorisation';
import { leClientDuProjet } from '@/lib/connecteurs/les-connecteurs-du-projet';
import { ouvrirUnSecret } from '@/lib/mcp/les-jetons';
import { adresseDeLaPlateforme } from '@/lib/mcp/l-adresse';
import { construireLApercu as batir, estUnRefus } from '@/lib/mcp/les-gestes';
import { leContexteReel } from '@/lib/mcp/le-contexte-reel';
import { lesTextesDUnElement, reecrireUnTexte, type Reecriture } from '@/lib/contenus/reecrire';
import { leDroitDePublier } from '@/lib/abonnements/l-abonnement';
import { leManifesteStocke } from '@/lib/projets/l-arbre-d-un-projet';
import { lesAbonnementsReels } from '@/app/_partage/les-abonnements-reels';
import { deplacer } from '@/lib/projets/la-corbeille';

const ID = /^[0-9a-f-]{36}$/;
const retour = (id: string, q: Record<string, string>, ecran = ''): never => redirect(`/projets/${id}${ecran ? `/${ecran}` : ''}?${new URLSearchParams(q)}`);

export async function publier(id: string) {
  if (!ID.test(id)) redirect('/projets');
  const c = await laConsole(`/projets/${id}`);
  // L'OFFRE, VÉRIFIÉE PAR LE SERVEUR : l'essai n'a que l'aperçu ; une offre payante publie ses natures, dans sa place.
  // Le quota de l'offre et la mise en ligne, l'un après l'autre pour un même compte : deux « Publier » au même instant
  // ne dépassent pas l'offre (audit du 25/11).
  const issue = await uneAUneParCompte(c.compte, async (): Promise<Record<string, string>> => {
    const f = await c.projets.fichiers(c.compte, id);
    const m = f.lu ? leManifesteStocke(f.valeur.get('app.json')) : null;
    const droit = await leDroitDePublier(lesAbonnementsReels(), c.compte, id, m?.lu ? m.manifeste : null);
    if (!droit.lu) return { erreur: 'panne' };
    if (!droit.valeur.permis) return { erreur: droit.valeur.pourquoi };
    const r = await mettreLApercuEnLigne(c.projets, c.compte, id);
    if (r.publie) console.log(`[console] ${id.slice(0, 8)} mis en ligne (${r.empreinte.slice(0, 12)})`);
    return r.publie ? { fait: 'publie' } : { erreur: r.pourquoi };
  });
  retour(id, issue);
}

/**
 * « Claude a fini » : la personne ferme le travail en cours de Claude, qui la bloquait (Antoine, 25/11). Les fichiers sont
 * déjà écrits, version par version : fermer garde tout, comme `publish` côté Claude. Si Claude n'avait pas fini, son
 * geste suivant est refusé (`chantier_requis`) et il en rouvre un.
 */
export async function claudeAFini(id: string, ecran = '') {
  if (!ID.test(id) || !['', 'gerer'].includes(ecran)) redirect('/projets');
  const c = await laConsole(`/projets/${id}`);
  const p = await c.projets.lire(c.compte, id);
  if (!p.lu) retour(id, { erreur: 'panne' }, ecran);
  const ch = p.lu ? p.valeur?.chantier : null;
  if (!ch) retour(id, { fait: 'claude_a_fini' }, ecran);
  const r = await c.projets.fermerChantier(c.compte, id, ch!.id, 'publie');
  if (r.lu) console.log(`[console] ${id.slice(0, 8)} travail de Claude fermé par la personne`);
  retour(id, r.lu ? { fait: 'claude_a_fini' } : { erreur: 'panne' }, ecran);
}

/**
 * Les notes durables, corrigées par la personne (Antoine, 26/11) : le texte entier, écrit s'il est encore celui que la
 * page montrait (`avant`) ; Claude a pu les changer entre-temps, alors rien d'écrit et la page le dit.
 */
export async function ecrireLesNotes(id: string, formulaire: FormData) {
  if (!ID.test(id)) redirect('/projets');
  const c = await laConsole(`/projets/${id}`);
  const texte = String(formulaire.get('notes') ?? '').replace(/\r\n/g, '\n').trim().slice(0, LONGUEUR_DES_NOTES) || null;
  const avant = String(formulaire.get('avant') ?? '');
  const r = await c.projets.ecrireLesNotes(c.compte, id, texte, avant === '' ? null : avant);
  retour(id, !r.lu ? { erreur: 'panne' } : r.valeur.ecrites ? { fait: 'notes' } : { erreur: 'notes_changees' });
}

/** L'adresse qui reçoit les messages des formulaires ; vide : celle du compte. */
export async function reglerLeCourriel(id: string, formulaire: FormData) {
  if (!ID.test(id)) redirect('/projets');
  const brut = String(formulaire.get('courriel') ?? '').trim();
  if (brut && (brut.length > 254 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(brut))) retour(id, { erreur: 'courriel_mal_forme' }, 'messages');
  const c = await laConsole(`/projets/${id}/messages`);
  const r = await c.projets.regler(c.compte, id, { courrielDesMessages: brut || null });
  retour(id, r.lu ? { fait: 'courriel' } : { erreur: 'panne' }, 'messages');
}

/** Un message reclassé (« ce n'est pas du spam », « c'est du spam ») ou effacé, dans un projet de la personne. */
export async function rangerUnMessage(id: string, message: string, geste: 'recu' | 'spam' | 'effacer', vue: string) {
  if (!ID.test(id) || !ID.test(message) || !['recu', 'spam', 'effacer'].includes(geste)) redirect('/projets');
  const c = await laConsole(`/projets/${id}/messages`);
  const p = await c.projets.lire(c.compte, id);
  if (!p.lu || !p.valeur) retour(id, { erreur: 'panne' }, 'messages');
  const r = geste === 'effacer' ? await effacerUnMessage(c.base, id, message) : await classerUnMessage(c.base, id, message, geste);
  retour(id, r.lu ? { fait: geste, vue: ['spam', 'tous'].includes(vue) ? vue : 'recus' } : { erreur: 'panne' }, 'messages');
}

/** La balise Google Search Console : collée entière ou son seul contenu ; vide, elle est retirée. */
export async function reglerGoogle(id: string, formulaire: FormData) {
  if (!ID.test(id)) redirect('/projets');
  const jeton = leJetonGoogle(String(formulaire.get('google') ?? '').slice(0, 1000));
  if (jeton === false) retour(id, { erreur: 'google_mal_forme' }, 'referencement');
  const c = await laConsole(`/projets/${id}/referencement`);
  const r = await c.projets.regler(c.compte, id, { verificationGoogle: jeton || null });
  retour(id, r.lu ? { fait: 'google' } : { erreur: 'panne' }, 'referencement');
}

export async function revenir(id: string, version: number) {
  if (!ID.test(id) || !Number.isInteger(version) || version < 1) redirect('/projets');
  const c = await laConsole(`/projets/${id}`);
  const r = await revenirDepuisLaConsole({ compte: c.compte, projets: c.projets, base: c.base, magasin: (() => { const m = magasinS3(); return m.lu ? m.magasin : null; })() }, id, version);
  if (!r.revenu) retour(id, { erreur: r.pourquoi }, 'versions');
  retour(id, r.revenu && r.apercu === 'a_construire' ? { fait: 'revenu', version: String(r.version), construire: 'oui' } : { fait: 'revenu', version: String(r.revenu ? r.version : 0) }, 'versions');
}

export async function poserUnSecret(id: string, formulaire: FormData) {
  if (!ID.test(id)) redirect('/projets');
  const nom = String(formulaire.get('nom') ?? '').trim();
  const valeur = String(formulaire.get('valeur') ?? '');
  if (!/^[A-Z][A-Z0-9_]{1,63}$/.test(nom) || valeur.length === 0 || valeur.length > 8000) retour(id, { erreur: 'secret_mal_forme' }, 'secrets');
  if (nom.startsWith(PREFIXE_DU_SECRET) || nom.startsWith(PREFIXE_DU_CLIENT)) retour(id, { erreur: 'secret_d_un_connecteur' }, 'secrets');
  const c = await laConsole(`/projets/${id}`);
  const r = await c.projets.poserUnSecret(c.compte, id, nom, scellerUnSecret(id, nom, valeur));
  retour(id, r.lu ? { fait: 'secret', nom } : { erreur: 'panne' }, 'secrets');
}

/** Branche un connecteur : un modèle complété (`modele`), ou « autre logiciel ». Gardé comme un secret scellé. */
export async function brancherUnConnecteur(id: string, modele: string, formulaire: FormData) {
  if (!ID.test(id)) redirect('/projets');
  const champ = (n: string): string => String(formulaire.get(n) ?? '').slice(0, 4000).trim();
  let brut: Record<string, unknown>;
  if (modele === 'autre') {
    brut = { nom: champ('nom'), libelle: champ('libelle'), baseUrl: champ('baseUrl'), cle: champ('cle'), acces: { forme: champ('forme') || 'bearer', ...(champ('entete') ? { entete: champ('entete') } : {}) } };
  } else {
    const m = MODELES_DE_CONNECTEURS.find((x) => x.id === modele);
    if (!m) redirect(`/projets/${id}/connecteurs`);
    const complet = completerLeModele(m, Object.fromEntries(m.champs.map((x) => [x.id, champ(x.id)])), champ('cle'));
    if (!complet.ok) return retour(id, { erreur: 'connecteur_mal_forme', detail: complet.raison }, 'connecteurs');
    brut = { nom: m.nomDansLApp, libelle: m.nom, ...complet.valeur };
  }
  const lu = lireUnConnecteur(brut);
  if (!lu.ok) return retour(id, { erreur: 'connecteur_mal_forme', detail: lu.raison }, 'connecteurs');
  const c = await laConsole(`/projets/${id}/connecteurs`);
  const nom = secretDuConnecteur(lu.valeur.nom);
  const r = await c.projets.poserUnSecret(c.compte, id, nom, scellerUnSecret(id, nom, enSecret(lu.valeur)));
  retour(id, r.lu ? { fait: 'connecteur', nom: lu.valeur.nom } : { erreur: 'panne' }, 'connecteurs');
}

/** Le client OAuth du propriétaire chez un fournisseur (décision d'Antoine du 28/11 : son client, pas celui de vavi), scellé. */
export async function poserLeClient(id: string, fournisseur: string, formulaire: FormData) {
  if (!ID.test(id) || !FOURNISSEURS_CONNUS.includes(fournisseur as NomDeFournisseur)) redirect('/projets');
  const lu = lireLeClient({ id: String(formulaire.get('id') ?? '').slice(0, 400), secret: String(formulaire.get('secret') ?? '').slice(0, 400) });
  if (!lu.ok) return retour(id, { erreur: 'client_mal_forme', detail: lu.raison }, 'connecteurs');
  const c = await laConsole(`/projets/${id}/connecteurs`);
  const nom = secretDuClient(fournisseur as NomDeFournisseur);
  const r = await c.projets.poserUnSecret(c.compte, id, nom, scellerUnSecret(id, nom, enTexteDuClient(lu.valeur)));
  retour(id, r.lu ? { fait: 'client' } : { erreur: 'panne' }, 'connecteurs');
}

export async function retirerLeClient(id: string, fournisseur: string) {
  if (!ID.test(id) || !FOURNISSEURS_CONNUS.includes(fournisseur as NomDeFournisseur)) redirect('/projets');
  const c = await laConsole(`/projets/${id}/connecteurs`);
  const r = await c.projets.retirerUnSecret(c.compte, id, secretDuClient(fournisseur as NomDeFournisseur));
  retour(id, r.lu ? { fait: 'client_retire' } : { erreur: 'panne' }, 'connecteurs');
}

/** Relie un compte (Gmail…) : la page d'accord du fournisseur, par le client du propriétaire, l'état scellé au compte et au projet (PKCE). */
export async function relierUnCompte(id: string, modele: string) {
  if (!ID.test(id)) redirect('/projets');
  const m = MODELES_OAUTH.find((x) => x.id === modele);
  if (!m) redirect(`/projets/${id}/connecteurs`);
  const c = await laConsole(`/projets/${id}/connecteurs`);
  const p = await c.projets.lire(c.compte, id);
  if (!p.lu || !p.valeur) redirect('/projets');
  const client = await leClientDuProjet(c.base, id, m.fournisseur, { ouvrir: ouvrirUnSecret, sceller: scellerUnSecret });
  if (!client) return retour(id, { erreur: 'liaison_indisponible' }, 'connecteurs');
  const verificateur = unVerificateur();
  redirect(adresseDAccord(m, client, `${adresseDeLaPlateforme()}${RETOUR_DE_LA_LIAISON}`, ecrireUneLiaison({ projet: id, modele: m.id, compte: c.compte, verificateur }), verificateur));
}

export async function retirerUnConnecteur(id: string, nom: string) {
  if (!ID.test(id) || !FORME_DU_NOM.test(nom)) redirect('/projets');
  const c = await laConsole(`/projets/${id}/connecteurs`);
  const r = await c.projets.retirerUnSecret(c.compte, id, secretDuConnecteur(nom));
  retour(id, r.lu ? { fait: 'retire', nom } : { erreur: 'panne' }, 'connecteurs');
}

/** Les passages d'un élément cliqué dans l'aperçu (`data-texte`), lus dans le fichier d'aujourd'hui. */
export async function lesTextes(id: string, situation: string): Promise<{ lu: true; passages: string[] } | { lu: false; pourquoi: string }> {
  if (!ID.test(id) || situation.length > 2000) return { lu: false, pourquoi: 'designation_illisible' };
  const c = await laConsole(`/projets/${id}`);
  const r = await lesTextesDUnElement(c, id, situation);
  return r.lu ? { lu: true, passages: r.passages.map((p) => p.texte) } : r;
}

/** Réécrit les passages, puis rebâtit l'aperçu sans modèle et le désigne s'il est vert. */
export async function reecrire(id: string, situation: string, apres: string[]): Promise<Reecriture> {
  if (!ID.test(id) || situation.length > 2000 || !Array.isArray(apres) || apres.length > 50 || apres.some((x) => typeof x !== 'string')) return { reecrit: false, pourquoi: 'designation_illisible' };
  const c = await laConsole(`/projets/${id}`);
  const r = await reecrireUnTexte({ compte: c.compte, projets: c.projets, construire: async (projet) => {
    const ctx = await leContexteReel(c.compte);
    const b = await batir(ctx.outils, { project: projet });
    if (estUnRefus(b)) return { vert: false, detail: b.code };
    const designe = await c.projets.publierLApercu(c.compte, projet, String(b.fingerprint));
    return designe.lu ? { vert: true } : { vert: false, detail: designe.pourquoi };
  } }, id, situation, apres);
  if (r.reecrit) console.log(`[console] ${id.slice(0, 8)} texte réécrit (version ${r.version}, aperçu ${r.apercu})`);
  return r;
}

/** L'inscription à l'app : avec la validation de l'adresse par un lien, ou sans (décision d'Antoine du 25/11). */
export async function reglerLInscription(id: string, formulaire: FormData) {
  if (!ID.test(id)) redirect('/projets');
  const c = await laConsole(`/projets/${id}/fonctions`);
  const r = await c.projets.regler(c.compte, id, { inscriptionSansValidation: formulaire.get('validation') === 'sans' });
  retour(id, r.lu ? { fait: 'inscription' } : { erreur: 'panne' }, 'fonctions');
}

/**
 * Mettre le projet à la corbeille, ou l'en sortir (Antoine, 27/11, « Corbeille de 30 jours », `lib/projets/la-corbeille.ts`) :
 * rien n'est effacé avant 30 jours ; le site en ligne s'arrête tout de suite et se republie après une restauration.
 */
export async function deplacerLeProjet(id: string, geste: 'corbeille' | 'restaurer') {
  if (!ID.test(id) || !['corbeille', 'restaurer'].includes(geste)) redirect('/projets');
  const c = await laConsole('/projets');
  const r = await deplacer(c.base, c.compte, id, geste);
  if (r.lu && r.valeur) console.log(`[console] ${id.slice(0, 8)} ${geste === 'corbeille' ? 'mis à la corbeille' : 'restauré'}`);
  if (geste === 'restaurer' && r.lu && r.valeur) redirect(`/projets/${id}?fait=restaure`);
  redirect(`/projets?${new URLSearchParams(r.lu && r.valeur ? { fait: geste } : { erreur: r.lu ? 'introuvable' : 'panne' })}`);
}
