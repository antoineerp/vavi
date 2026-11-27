/**
 * Les projets d'un compte, leurs fichiers, leurs versions, leur chantier et leurs builds, vus par la plateforme.
 *
 * Chaque geste nomme le compte, et vérifie que le projet est À LUI : la clé de service passe la RLS, ce filtre la redit à
 * chaque appel. Une panne de la base se dit (`lu: false`), jamais une liste vide.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { arbreRejoue } from './les-empreintes';

export type Issue<T> = { readonly lu: true; readonly valeur: T } | { readonly lu: false; readonly pourquoi: string };
const lu = <T>(valeur: T): Issue<T> => ({ lu: true, valeur });
const pasLu = <T = never>(pourquoi: string): Issue<T> => ({ lu: false, pourquoi });

export interface Chantier {
  readonly id: string;
  readonly intention: string;
  readonly versionDeDepart: number;
  readonly ouvertLe: string;
  readonly dernierGesteLe: string;
  readonly gestes: number;
  readonly fait: readonly string[];
  /** Ce qui reste à faire, noté par Claude (`apply_changes`, champ `reste`). */
  readonly reste: string | null;
}

export interface Projet {
  readonly id: string;
  readonly nom: string;
  readonly version: number;
  /** L'empreinte de l'arbre dont le dist est servi à `/p/<id>/` ; `null` : jamais publié. */
  readonly apercuEmpreinte: string | null;
  /** L'empreinte du build que le site public sert, choisi par la personne dans la console ; `null` : pas en ligne. */
  readonly enLigneEmpreinte: string | null;
  readonly enLigneLe: string | null;
  readonly basePoseeLe: string | null;
  readonly modifieLe: string;
  readonly chantier: Chantier | null;
}

export interface Version { readonly numero: number; readonly pourquoi: string; readonly chantier: string | null; readonly ecrits: readonly string[]; readonly supprimes: readonly string[]; readonly creeLe: string }

export type Application =
  | { readonly applique: true; readonly version: number }
  | { readonly applique: false; readonly conflit: readonly string[]; readonly version: number }
  | { readonly applique: false; readonly chantierRequis: true };

export type Ouverture =
  | { readonly ouvert: true; readonly chantier: string; readonly repris: boolean }
  | { readonly ouvert: false; readonly autre: { readonly id: string; readonly intention: string; readonly ouvertLe: string; readonly dernierGesteLe: string } };

export interface Build { readonly empreinte: string; readonly vert: boolean; readonly ecarts: unknown; readonly creeLe: string }

export interface Projets {
  lister(compte: string): Promise<Issue<readonly Projet[]>>;
  creer(compte: string, nom: string, appJson: string): Promise<Issue<Projet>>;
  /** `null` : ce projet n'existe pas, ou n'est pas à ce compte (les deux se disent pareil). */
  lire(compte: string, projet: string): Promise<Issue<Projet | null>>;
  fichiers(compte: string, projet: string): Promise<Issue<ReadonlyMap<string, string>>>;
  /** L'arbre tel qu'il était à cette version, rejoué depuis les versions. */
  arbreA(compte: string, projet: string, version: number): Promise<Issue<ReadonlyMap<string, string>>>;
  versions(compte: string, projet: string, combien: number): Promise<Issue<readonly Version[]>>;
  appliquer(compte: string, projet: string, o: { readonly chantier: string | null; readonly attendus: Readonly<Record<string, string | null>>;
    readonly ecrits: ReadonlyMap<string, string>; readonly supprimes: readonly string[]; readonly pourquoi: string }): Promise<Issue<Application>>;
  ouvrirChantier(compte: string, projet: string, intention: string, reprendre: boolean): Promise<Issue<Ouverture>>;
  fermerChantier(compte: string, projet: string, chantier: string, issue: 'publie' | 'abandonne'): Promise<Issue<true>>;
  noterLeReste(compte: string, projet: string, chantier: string, reste: string): Promise<Issue<true>>;
  enregistrerUnBuild(compte: string, projet: string, b: { readonly empreinte: string; readonly vert: boolean; readonly ecarts: unknown }): Promise<Issue<true>>;
  leBuild(compte: string, projet: string, empreinte: string): Promise<Issue<Build | null>>;
  publierLApercu(compte: string, projet: string, empreinte: string): Promise<Issue<true>>;
  /** Le site public sert ce build : la console seule l'appelle, sur le geste de la personne. */
  mettreEnLigne(compte: string, projet: string, empreinte: string): Promise<Issue<true>>;
  /** Les noms des secrets du projet, jamais leurs valeurs. */
  nomsDesSecrets(compte: string, projet: string): Promise<Issue<readonly string[]>>;
  marquerLaBase(compte: string, projet: string, nom: string): Promise<Issue<true>>;
  poserUnSecret(compte: string, projet: string, nom: string, valeurChiffree: string): Promise<Issue<true>>;
  retirerUnSecret(compte: string, projet: string, nom: string): Promise<Issue<true>>;
  /** Les réglages du projet ; illisibles tant que leur migration (20261125110000) n'est pas posée. */
  reglages(compte: string, projet: string): Promise<Issue<Reglages>>;
  regler(compte: string, projet: string, r: Partial<Reglages>): Promise<Issue<true>>;
  /** Les notes durables du projet ; `null` : aucune. Illisibles tant que leur migration (20261126100000) n'est pas posée. */
  notes(compte: string, projet: string): Promise<Issue<string | null>>;
  /** Écrit les notes si elles sont encore celles lues (`avant`) ; sinon rien d'écrit, les actuelles rendues. */
  ecrireLesNotes(compte: string, projet: string, notes: string | null, avant: string | null): Promise<Issue<{ readonly ecrites: true } | { readonly ecrites: false; readonly actuelles: string | null }>>;
}

/** Les réglages d'un projet que la personne pose dans la console. `null` : rien de posé (le courriel du compte sert). */
export interface Reglages { readonly courrielDesMessages: string | null; readonly verificationGoogle: string | null; readonly inscriptionSansValidation: boolean }

interface LigneDeProjet { id: string; nom: string; version: number; apercu_empreinte: string | null; en_ligne_empreinte: string | null; en_ligne_le: string | null; base_posee_le: string | null; modifie_le: string }
interface LigneDeChantier { id: string; projet: string; intention: string; version_de_depart: number; ouvert_le: string; dernier_geste_le: string; gestes: number; fait: string[]; reste: string | null }
/** La corbeille (`la-corbeille.ts`) pas encore posée en base : la colonne manque, tout se lit comme avant. */
const SANS_CORBEILLE = /supprime_le/;
const COLONNES = 'id, nom, version, apercu_empreinte, en_ligne_empreinte, en_ligne_le, base_posee_le, modifie_le';
const versChantier = (c: LigneDeChantier): Chantier => ({ id: c.id, intention: c.intention, versionDeDepart: c.version_de_depart,
  ouvertLe: c.ouvert_le, dernierGesteLe: c.dernier_geste_le, gestes: c.gestes, fait: c.fait, reste: c.reste });
const versProjet = (l: LigneDeProjet, c: LigneDeChantier | undefined): Projet => ({ id: l.id, nom: l.nom, version: l.version,
  apercuEmpreinte: l.apercu_empreinte, enLigneEmpreinte: l.en_ligne_empreinte, enLigneLe: l.en_ligne_le, basePoseeLe: l.base_posee_le, modifieLe: l.modifie_le, chantier: c ? versChantier(c) : null });

export function projetsSurSupabase(base: SupabaseClient): Projets {
  const chantiersOuverts = async (ids: readonly string[]): Promise<Issue<Map<string, LigneDeChantier>>> => {
    if (ids.length === 0) return lu(new Map());
    const r = await base.from('vavi_chantiers').select('id, projet, intention, version_de_depart, ouvert_le, dernier_geste_le, gestes, fait, reste')
      .in('projet', ids).is('ferme_le', null).returns<LigneDeChantier[]>();
    return r.error ? pasLu(r.error.message) : lu(new Map(r.data.map((c) => [c.projet, c])));
  };
  const leSien = async (compte: string, id: string): Promise<Issue<Projet | null>> => {
    const q = () => base.from('vavi_projets').select(COLONNES).eq('id', id).eq('proprietaire', compte);
    let r = await q().is('supprime_le', null).maybeSingle<LigneDeProjet>();
    if (r.error && SANS_CORBEILLE.test(r.error.message)) r = await q().maybeSingle<LigneDeProjet>();
    if (r.error) return pasLu(r.error.message);
    if (!r.data) return lu(null);
    const c = await chantiersOuverts([id]);
    return c.lu ? lu(versProjet(r.data, c.valeur.get(id))) : c;
  };
  /** Le projet est-il à ce compte ? Rend la raison du refus, ou `null`. */
  const aLui = async (compte: string, id: string): Promise<string | null> => {
    const p = await leSien(compte, id);
    return !p.lu ? p.pourquoi : p.valeur ? null : 'projet inconnu';
  };
  const ok = (r: { error: { message: string } | null }): Issue<true> => (r.error ? pasLu(r.error.message) : lu(true));
  const appliquer: Projets['appliquer'] = async (compte, id, o) => {
    const refus = await aLui(compte, id);
    if (refus) return pasLu(refus);
    const r = await base.rpc('vavi_appliquer', { p_projet: id, p_chantier: o.chantier, p_attendus: o.attendus,
      p_ecrits: Object.fromEntries(o.ecrits), p_supprimes: [...o.supprimes], p_pourquoi: o.pourquoi });
    if (r.error) return pasLu(r.error.message);
    const d = r.data as { version?: number; conflit?: string[]; chantier_requis?: boolean };
    if (d.chantier_requis) return lu({ applique: false, chantierRequis: true });
    if (d.conflit) return lu({ applique: false, conflit: d.conflit, version: Number(d.version) });
    return lu({ applique: true, version: Number(d.version) });
  };

  return {
    async lister(compte) {
      const q = () => base.from('vavi_projets').select(COLONNES).eq('proprietaire', compte);
      const tri = <T extends { order: (c: string, o: { ascending: boolean }) => T }>(x: T) => x.order('modifie_le', { ascending: false });
      let r = await tri(q().is('supprime_le', null)).limit(200).returns<LigneDeProjet[]>();
      if (r.error && SANS_CORBEILLE.test(r.error.message)) r = await tri(q()).limit(200).returns<LigneDeProjet[]>();
      if (r.error) return pasLu(r.error.message);
      const c = await chantiersOuverts(r.data.map((p) => p.id));
      return c.lu ? lu(r.data.map((p) => versProjet(p, c.valeur.get(p.id)))) : c;
    },
    async creer(compte, nom, appJson) {
      const r = await base.from('vavi_projets').insert({ proprietaire: compte, nom }).select(COLONNES).single<LigneDeProjet>();
      if (r.error) return pasLu(r.error.message);
      const a = await appliquer(compte, r.data.id, { chantier: null, attendus: { 'app.json': null }, ecrits: new Map([['app.json', appJson]]), supprimes: [], pourquoi: 'création du projet' });
      if (!a.lu) return pasLu(`le projet est créé, son app.json non : ${a.pourquoi}`);
      return lu(versProjet({ ...r.data, version: 1 }, undefined));
    },
    lire: leSien,
    async fichiers(compte, id) {
      const refus = await aLui(compte, id);
      if (refus) return pasLu(refus);
      const r = await base.from('vavi_fichiers').select('chemin, contenu').eq('projet', id).limit(5000).returns<{ chemin: string; contenu: string }[]>();
      return r.error ? pasLu(r.error.message) : lu(new Map(r.data.map((f) => [f.chemin, f.contenu])));
    },
    async arbreA(compte, id, version) {
      const refus = await aLui(compte, id);
      if (refus) return pasLu(refus);
      const r = await base.from('vavi_versions').select('numero, ecrits, supprimes').eq('projet', id).lte('numero', version).order('numero').limit(10_000)
        .returns<{ numero: number; ecrits: Record<string, string>; supprimes: string[] }[]>();
      if (r.error) return pasLu(r.error.message);
      if (version > 0 && r.data.at(-1)?.numero !== version) return pasLu(`la version ${version} n’existe pas`);
      return lu(arbreRejoue(r.data));
    },
    async versions(compte, id, combien) {
      const refus = await aLui(compte, id);
      if (refus) return pasLu(refus);
      const r = await base.from('vavi_versions').select('numero, pourquoi, chantier, ecrits, supprimes, cree_le').eq('projet', id)
        .order('numero', { ascending: false }).limit(combien)
        .returns<{ numero: number; pourquoi: string; chantier: string | null; ecrits: Record<string, string>; supprimes: string[]; cree_le: string }[]>();
      return r.error ? pasLu(r.error.message) : lu(r.data.map((v) => ({ numero: v.numero, pourquoi: v.pourquoi, chantier: v.chantier,
        ecrits: Object.keys(v.ecrits), supprimes: v.supprimes, creeLe: v.cree_le })));
    },
    appliquer,
    async ouvrirChantier(compte, id, intention, reprendre) {
      const refus = await aLui(compte, id);
      if (refus) return pasLu(refus);
      const r = await base.rpc('vavi_ouvrir_chantier', { p_projet: id, p_intention: intention, p_reprendre: reprendre });
      if (r.error) return pasLu(r.error.message);
      const d = r.data as { chantier?: string; repris?: boolean; chantier_ouvert?: { id: string; intention: string; ouvert_le: string; dernier_geste_le: string } };
      return d.chantier_ouvert
        ? lu({ ouvert: false, autre: { id: d.chantier_ouvert.id, intention: d.chantier_ouvert.intention, ouvertLe: d.chantier_ouvert.ouvert_le, dernierGesteLe: d.chantier_ouvert.dernier_geste_le } })
        : lu({ ouvert: true, chantier: String(d.chantier), repris: Boolean(d.repris) });
    },
    async reglages(compte, id) {
      const refus = await aLui(compte, id);
      if (refus) return pasLu(refus);
      // `*` : un réglage dont la colonne n'est pas encore posée (migration à coller) se lit à sa valeur par défaut.
      const r = await base.from('vavi_projets').select('*').eq('id', id)
        .maybeSingle<{ courriel_des_messages?: string | null; verification_google?: string | null; inscription_sans_validation?: boolean }>();
      return r.error ? pasLu(r.error.message) : lu({ courrielDesMessages: r.data?.courriel_des_messages ?? null, verificationGoogle: r.data?.verification_google ?? null,
        inscriptionSansValidation: r.data?.inscription_sans_validation === true });
    },
    async regler(compte, id, x) {
      const refus = await aLui(compte, id);
      if (refus) return pasLu(refus);
      const maj = { ...('courrielDesMessages' in x ? { courriel_des_messages: x.courrielDesMessages } : {}), ...('verificationGoogle' in x ? { verification_google: x.verificationGoogle } : {}),
        ...('inscriptionSansValidation' in x ? { inscription_sans_validation: x.inscriptionSansValidation } : {}) };
      return ok(await base.from('vavi_projets').update(maj).eq('id', id));
    },
    async notes(compte, id) {
      const refus = await aLui(compte, id);
      if (refus) return pasLu(refus);
      const r = await base.from('vavi_projets').select('*').eq('id', id).maybeSingle<{ notes?: string | null }>();
      if (r.error) return pasLu(r.error.message);
      if (r.data && !('notes' in r.data)) return pasLu('the project notes are not set up on this vavi server yet (migration 20261126100000)');
      return lu(r.data?.notes ?? null);
    },
    async ecrireLesNotes(compte, id, notes, avant) {
      const refus = await aLui(compte, id);
      if (refus) return pasLu(refus);
      const r = await base.rpc('vavi_ecrire_les_notes', { p_projet: id, p_notes: notes, p_avant: avant });
      if (r.error) return pasLu(/vavi_ecrire_les_notes|notes/.test(r.error.message) ? 'the project notes are not set up on this vavi server yet (migration 20261126100000)' : r.error.message);
      if (r.data === true) return lu({ ecrites: true as const });
      const x = await base.from('vavi_projets').select('notes').eq('id', id).maybeSingle<{ notes: string | null }>();
      return x.error ? pasLu(x.error.message) : lu({ ecrites: false as const, actuelles: x.data?.notes ?? null });
    },
    async fermerChantier(compte, id, chantier, issue) {
      const refus = await aLui(compte, id);
      if (refus) return pasLu(refus);
      return ok(await base.from('vavi_chantiers').update({ ferme_le: new Date().toISOString(), issue }).eq('id', chantier).eq('projet', id).is('ferme_le', null));
    },
    async noterLeReste(compte, id, chantier, reste) {
      const refus = await aLui(compte, id);
      if (refus) return pasLu(refus);
      return ok(await base.from('vavi_chantiers').update({ reste }).eq('id', chantier).eq('projet', id));
    },
    async enregistrerUnBuild(compte, id, b) {
      const refus = await aLui(compte, id);
      if (refus) return pasLu(refus);
      return ok(await base.from('vavi_builds').upsert({ projet: id, empreinte: b.empreinte, vert: b.vert, ecarts: b.ecarts, cree_le: new Date().toISOString() }));
    },
    async leBuild(compte, id, empreinte) {
      const refus = await aLui(compte, id);
      if (refus) return pasLu(refus);
      const r = await base.from('vavi_builds').select('empreinte, vert, ecarts, cree_le').eq('projet', id).eq('empreinte', empreinte)
        .maybeSingle<{ empreinte: string; vert: boolean; ecarts: unknown; cree_le: string }>();
      return r.error ? pasLu(r.error.message) : lu(r.data ? { empreinte: r.data.empreinte, vert: r.data.vert, ecarts: r.data.ecarts, creeLe: r.data.cree_le } : null);
    },
    async publierLApercu(compte, id, empreinte) {
      return ok(await base.from('vavi_projets').update({ apercu_empreinte: empreinte, apercu_le: new Date().toISOString() }).eq('id', id).eq('proprietaire', compte));
    },
    async mettreEnLigne(compte, id, empreinte) {
      return ok(await base.from('vavi_projets').update({ en_ligne_empreinte: empreinte, en_ligne_le: new Date().toISOString() }).eq('id', id).eq('proprietaire', compte));
    },
    async nomsDesSecrets(compte, id) {
      const refus = await aLui(compte, id);
      if (refus) return pasLu(refus);
      const r = await base.from('vavi_secrets').select('nom').eq('projet', id).order('nom').returns<{ nom: string }[]>();
      return r.error ? pasLu(r.error.message) : lu(r.data.map((x) => x.nom));
    },
    async marquerLaBase(compte, id, nom) {
      return ok(await base.from('vavi_projets').update({ base_posee_le: new Date().toISOString(), nom }).eq('id', id).eq('proprietaire', compte));
    },
    async poserUnSecret(compte, id, nom, valeur) {
      const refus = await aLui(compte, id);
      if (refus) return pasLu(refus);
      return ok(await base.from('vavi_secrets').upsert({ projet: id, nom, valeur, modifie_le: new Date().toISOString() }));
    },
    async retirerUnSecret(compte, id, nom) {
      const refus = await aLui(compte, id);
      if (refus) return pasLu(refus);
      return ok(await base.from('vavi_secrets').delete().eq('projet', id).eq('nom', nom));
    },
  };
}

/**
 * L'empreinte du build qu'un projet DÉSIGNE, pour le servir à quiconque a son adresse : l'aperçu (`/p/<id>/`, désigné
 * par `publish`) ou le site public (`/s/<id>/`, désigné par le bouton « Publier » de la console). La seule lecture d'un
 * projet sans compte. `inconnu` : ce projet n'existe pas.
 */
export async function leBuildDesigne(base: SupabaseClient, id: string, lequel: 'apercu' | 'en_ligne'): Promise<Issue<string | null | 'inconnu'>> {
  const colonne = lequel === 'apercu' ? 'apercu_empreinte' : 'en_ligne_empreinte';
  const r = await base.from('vavi_projets').select(colonne).eq('id', id).maybeSingle<Record<string, string | null>>();
  if (r.error) return pasLu(r.error.message);
  return lu(r.data ? r.data[colonne] ?? null : 'inconnu');
}

/**
 * Ce que la vente d'une app lit de son projet, sans compte (le panier d'un visiteur, le webhook de Stripe) : son
 * propriétaire et son app.json. `null` : ce projet n'existe pas.
 */
export async function leProjetServi(base: SupabaseClient, id: string): Promise<Issue<{ readonly proprietaire: string; readonly appJson: string | undefined } | null>> {
  const p = await base.from('vavi_projets').select('proprietaire').eq('id', id).maybeSingle<{ proprietaire: string }>();
  if (p.error) return pasLu(p.error.message);
  if (!p.data) return lu(null);
  const f = await base.from('vavi_fichiers').select('contenu').eq('projet', id).eq('chemin', 'app.json').maybeSingle<{ contenu: string }>();
  return f.error ? pasLu(f.error.message) : lu({ proprietaire: p.data.proprietaire, appJson: f.data?.contenu });
}

/** La valeur SCELLÉE d'un secret du projet, que seul `ouvrirUnSecret` ouvre ; `null` : il n'est pas posé. */
export async function leSecretScelle(base: SupabaseClient, id: string, nom: string): Promise<Issue<string | null>> {
  const r = await base.from('vavi_secrets').select('valeur').eq('projet', id).eq('nom', nom).maybeSingle<{ valeur: string }>();
  return r.error ? pasLu(r.error.message) : lu(r.data?.valeur ?? null);
}
