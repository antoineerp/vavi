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
  marquerLaBase(compte: string, projet: string, nom: string): Promise<Issue<true>>;
  poserUnSecret(compte: string, projet: string, nom: string, valeurChiffree: string): Promise<Issue<true>>;
}

interface LigneDeProjet { id: string; nom: string; version: number; apercu_empreinte: string | null; base_posee_le: string | null; modifie_le: string }
interface LigneDeChantier { id: string; projet: string; intention: string; version_de_depart: number; ouvert_le: string; dernier_geste_le: string; gestes: number; fait: string[]; reste: string | null }
const COLONNES = 'id, nom, version, apercu_empreinte, base_posee_le, modifie_le';
const versChantier = (c: LigneDeChantier): Chantier => ({ id: c.id, intention: c.intention, versionDeDepart: c.version_de_depart,
  ouvertLe: c.ouvert_le, dernierGesteLe: c.dernier_geste_le, gestes: c.gestes, fait: c.fait, reste: c.reste });
const versProjet = (l: LigneDeProjet, c: LigneDeChantier | undefined): Projet => ({ id: l.id, nom: l.nom, version: l.version,
  apercuEmpreinte: l.apercu_empreinte, basePoseeLe: l.base_posee_le, modifieLe: l.modifie_le, chantier: c ? versChantier(c) : null });

export function projetsSurSupabase(base: SupabaseClient): Projets {
  const chantiersOuverts = async (ids: readonly string[]): Promise<Issue<Map<string, LigneDeChantier>>> => {
    if (ids.length === 0) return lu(new Map());
    const r = await base.from('vavi_chantiers').select('id, projet, intention, version_de_depart, ouvert_le, dernier_geste_le, gestes, fait, reste')
      .in('projet', ids).is('ferme_le', null).returns<LigneDeChantier[]>();
    return r.error ? pasLu(r.error.message) : lu(new Map(r.data.map((c) => [c.projet, c])));
  };
  const leSien = async (compte: string, id: string): Promise<Issue<Projet | null>> => {
    const r = await base.from('vavi_projets').select(COLONNES).eq('id', id).eq('proprietaire', compte).maybeSingle<LigneDeProjet>();
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
      const r = await base.from('vavi_projets').select(COLONNES).eq('proprietaire', compte).order('modifie_le', { ascending: false }).limit(200).returns<LigneDeProjet[]>();
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
    async marquerLaBase(compte, id, nom) {
      return ok(await base.from('vavi_projets').update({ base_posee_le: new Date().toISOString(), nom }).eq('id', id).eq('proprietaire', compte));
    },
    async poserUnSecret(compte, id, nom, valeur) {
      const refus = await aLui(compte, id);
      if (refus) return pasLu(refus);
      return ok(await base.from('vavi_secrets').upsert({ projet: id, nom, valeur, modifie_le: new Date().toISOString() }));
    },
  };
}

/**
 * L'empreinte du build que l'aperçu d'un projet DÉSIGNE, pour le servir à quiconque a son adresse (`/p/<id>/`) : la seule
 * lecture d'un projet sans compte. `inconnu` : ce projet n'existe pas.
 */
export async function lApercuDesigne(base: SupabaseClient, id: string): Promise<Issue<string | null | 'inconnu'>> {
  const r = await base.from('vavi_projets').select('apercu_empreinte').eq('id', id).maybeSingle<{ apercu_empreinte: string | null }>();
  if (r.error) return pasLu(r.error.message);
  return lu(r.data ? r.data.apercu_empreinte : 'inconnu');
}
