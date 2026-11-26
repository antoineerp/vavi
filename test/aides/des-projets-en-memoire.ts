/**
 * Les projets en mémoire, pour jouer les outils MCP sans base : la même règle que `vavi_appliquer` et
 * `vavi_ouvrir_chantier` (test/projets/ les prouve sur un PostgreSQL réel) — on n'écrit que sur l'empreinte lue, une
 * version par geste, un seul chantier ouvert, un geste exige le chantier ouvert.
 */
import { randomUUID } from 'node:crypto';
import type { Build, Chantier, Projet, Projets, Reglages, Version } from '@/lib/projets/les-projets';
import { arbreRejoue, empreinteDuFichier } from '@/lib/projets/les-empreintes';

interface Etat { proprietaire: string; nom: string; fichiers: Map<string, string>; versions: (Version & { ecritsTextes: Record<string, string> })[];
  chantier: { -readonly [K in keyof Chantier]: Chantier[K] } | null; builds: Map<string, Build>; apercu: string | null; enLigne: string | null; secrets: Map<string, string>; base: string | null; reglages?: Reglages }

export function desProjetsEnMemoire(): Projets & { readonly etats: Map<string, Etat> } {
  const etats = new Map<string, Etat>();
  const lu = <T>(valeur: T) => ({ lu: true as const, valeur });
  const pasLu = (pourquoi: string) => ({ lu: false as const, pourquoi });
  const sien = (compte: string, id: string) => { const e = etats.get(id); return e && e.proprietaire === compte ? e : null; };
  const vue = (id: string, e: Etat): Projet => ({ id, nom: e.nom, version: e.versions.length, apercuEmpreinte: e.apercu, enLigneEmpreinte: e.enLigne, enLigneLe: null, basePoseeLe: e.base,
    modifieLe: new Date().toISOString(), chantier: e.chantier ? { ...e.chantier } : null });
  const appliquer: Projets['appliquer'] = async (compte, id, o) => {
    const e = sien(compte, id);
    if (!e) return pasLu('projet inconnu');
    if (o.chantier !== null && e.chantier?.id !== o.chantier) return lu({ applique: false as const, chantierRequis: true as const });
    const conflit = Object.entries(o.attendus).filter(([c, attendu]) => (e.fichiers.has(c) ? empreinteDuFichier(e.fichiers.get(c)!) : null) !== attendu).map(([c]) => c);
    if (conflit.length) return lu({ applique: false as const, conflit, version: e.versions.length });
    for (const c of o.supprimes) e.fichiers.delete(c);
    for (const [c, t] of o.ecrits) e.fichiers.set(c, t);
    e.versions.push({ numero: e.versions.length + 1, pourquoi: o.pourquoi, chantier: o.chantier, ecrits: [...o.ecrits.keys()], supprimes: [...o.supprimes],
      creeLe: new Date().toISOString(), ecritsTextes: Object.fromEntries(o.ecrits) });
    if (e.chantier && o.chantier) { e.chantier.gestes += 1; e.chantier.fait = [...e.chantier.fait, o.pourquoi]; }
    return lu({ applique: true as const, version: e.versions.length });
  };
  return {
    etats,
    async lister(compte) { return lu([...etats].filter(([, e]) => e.proprietaire === compte).map(([id, e]) => vue(id, e))); },
    async creer(compte, nom, appJson) {
      const id = randomUUID();
      etats.set(id, { proprietaire: compte, nom, fichiers: new Map(), versions: [], chantier: null, builds: new Map(), apercu: null, enLigne: null, secrets: new Map(), base: null });
      await appliquer(compte, id, { chantier: null, attendus: { 'app.json': null }, ecrits: new Map([['app.json', appJson]]), supprimes: [], pourquoi: 'création du projet' });
      return lu(vue(id, etats.get(id)!));
    },
    async lire(compte, id) { const e = sien(compte, id); return lu(e ? vue(id, e) : null); },
    async fichiers(compte, id) { const e = sien(compte, id); return e ? lu(new Map(e.fichiers)) : pasLu('projet inconnu'); },
    async arbreA(compte, id, version) {
      const e = sien(compte, id);
      if (!e) return pasLu('projet inconnu');
      if (version > e.versions.length) return pasLu(`la version ${version} n’existe pas`);
      return lu(arbreRejoue(e.versions.slice(0, version).map((v) => ({ ecrits: v.ecritsTextes, supprimes: v.supprimes }))));
    },
    async versions(compte, id, combien) { const e = sien(compte, id); return e ? lu([...e.versions].reverse().slice(0, combien)) : pasLu('projet inconnu'); },
    appliquer,
    async ouvrirChantier(compte, id, intention, reprendre) {
      const e = sien(compte, id);
      if (!e) return pasLu('projet inconnu');
      if (e.chantier && !reprendre) return lu({ ouvert: false as const, autre: { id: e.chantier.id, intention: e.chantier.intention, ouvertLe: e.chantier.ouvertLe, dernierGesteLe: e.chantier.dernierGesteLe } });
      if (e.chantier) return lu({ ouvert: true as const, chantier: e.chantier.id, repris: true });
      const maintenant = new Date().toISOString();
      e.chantier = { id: randomUUID(), intention, versionDeDepart: e.versions.length, ouvertLe: maintenant, dernierGesteLe: maintenant, gestes: 0, fait: [], reste: null };
      return lu({ ouvert: true as const, chantier: e.chantier.id, repris: false });
    },
    async fermerChantier(compte, id, chantier) { const e = sien(compte, id); if (e?.chantier?.id === chantier) e.chantier = null; return lu(true as const); },
    async noterLeReste(compte, id, chantier, reste) { const e = sien(compte, id); if (e?.chantier?.id === chantier) e.chantier.reste = reste; return lu(true as const); },
    async enregistrerUnBuild(compte, id, b) { sien(compte, id)?.builds.set(b.empreinte, { ...b, creeLe: new Date().toISOString() }); return lu(true as const); },
    async leBuild(compte, id, empreinte) { const e = sien(compte, id); return e ? lu(e.builds.get(empreinte) ?? null) : pasLu('projet inconnu'); },
    async publierLApercu(compte, id, empreinte) { const e = sien(compte, id); if (e) e.apercu = empreinte; return lu(true as const); },
    async mettreEnLigne(compte, id, empreinte) { const e = sien(compte, id); if (e) e.enLigne = empreinte; return lu(true as const); },
    async nomsDesSecrets(compte, id) { const e = sien(compte, id); return e ? lu([...e.secrets.keys()].sort()) : pasLu('projet inconnu'); },
    async marquerLaBase(compte, id, nom) { const e = sien(compte, id); if (e) { e.base = new Date().toISOString(); e.nom = nom; } return lu(true as const); },
    async poserUnSecret(compte, id, nom, valeur) { sien(compte, id)?.secrets.set(nom, valeur); return lu(true as const); },
    async retirerUnSecret(compte, id, nom) { sien(compte, id)?.secrets.delete(nom); return lu(true as const); },
    async reglages(compte, id) { const e = sien(compte, id); return e ? lu(e.reglages ?? { courrielDesMessages: null, verificationGoogle: null, inscriptionSansValidation: false }) : pasLu('projet inconnu'); },
    async notes(compte, id) { const e = sien(compte, id) as { notes?: string | null } | undefined; return e ? lu(e.notes ?? null) : pasLu('projet inconnu'); },
    async ecrireLesNotes(compte, id, notes, avant) {
      const e = sien(compte, id) as { notes?: string | null } | undefined;
      if (!e) return pasLu('projet inconnu');
      if ((e.notes ?? null) !== avant) return lu({ ecrites: false as const, actuelles: e.notes ?? null });
      e.notes = notes; return lu({ ecrites: true as const });
    },
    async regler(compte, id, r) { const e = sien(compte, id); if (!e) return pasLu('projet inconnu'); e.reglages = { courrielDesMessages: null, verificationGoogle: null, inscriptionSansValidation: false, ...e.reglages, ...r }; return lu(true as const); },
  };
}
