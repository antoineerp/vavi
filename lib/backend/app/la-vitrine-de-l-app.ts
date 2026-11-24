// Repris de constructor-v13@5bb786e : generateur-v2/app/la-vitrine-de-l-app.ts
/**
 * Ce que la vitrine d'une app affirme d'elle, déclaré dans app.json pour être tenu : ses promesses, chacune nommant ce qui
 * la tient, et le résultat que la personne obtient, que la page publique montre par ses lignes d'exemple.
 *
 * Ce qu'il remplace (interdit 9) : les « preuves » libres de `<Ouverture>`, écrites dans la page sans que rien les tienne
 * (05/11 : « relu par un expert » sur une app sans aucun rôle qui relise, où la personne servie validait ses propres
 * lignes) ; et une page publique qui décrivait l'app sans jamais montrer ce qu'elle rend.
 */
import { z } from 'zod';
import { Identifiant } from './identifiant';

export const Promesse = z.object({
  texte: z.string().min(1).max(60).describe('ce que la page publique promet, en quelques mots'),
  tenue: z.object({
    role: Identifiant.optional().describe('le rôle de l’équipe qui la tient'),
    transition: z.string().regex(/^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/).optional().describe('le geste qui la tient : `table.transition`'),
    agent: Identifiant.optional(),
    automatisation: Identifiant.optional(),
    fonction: Identifiant.optional().describe('une fonction de la plateforme déclarée dans `fonctions`'),
  }).describe('ce qui la tient, une seule chose : la plateforme vérifie qu’elle existe et qu’elle est à l’équipe de l’app'),
}).describe('une promesse de la page publique, et ce qui la tient');

export const Vitrine = {
  promesses: z.array(Promesse).max(6).default([])
    .describe('ce que la page publique promet (`<Ouverture>` ou `<BarreDePromesse>` les montre) ; une promesse que rien de déclaré ne tient ne s’écrit pas'),
  resultat: Identifiant.optional()
    .describe('la table dont les lignes sont ce que la personne servie obtient de l’app ; la page publique en montre les exemples'),
};

interface Lu {
  readonly nature: string;
  readonly roles: readonly { readonly nom: string; readonly obtenu: string; readonly client?: boolean }[];
  readonly tables: readonly { readonly nom: string; readonly lecture: readonly string[]; readonly exemples: readonly unknown[];
    readonly cycle?: { readonly transitions: readonly { readonly nom: string; readonly par: readonly string[] }[] } }[];
  readonly agents: readonly { readonly nom: string }[];
  readonly automatisations: readonly { readonly nom: string }[];
  readonly fonctions: Readonly<Record<string, boolean>>;
  readonly promesses: readonly z.infer<typeof Promesse>[];
  readonly resultat?: string;
}

/** Les rôles de ceux que l'app SERT : qui s'inscrit, qui achète son accès, le client invité. PUR. */
export const rolesServis = (m: Pick<Lu, 'roles'>): string[] =>
  m.roles.filter((r) => r.obtenu === 'inscription' || r.obtenu === 'paiement' || r.client).map((r) => r.nom);

/**
 * Chaque promesse nomme une chose qui existe, à l'équipe de l'app : une promesse faite à qui l'app sert n'est pas tenue
 * par lui. Une app qui sert des personnes venues de la vitrine déclare ce qu'elles obtiennent, et elles le lisent.
 */
export function lireLaVitrine(m: Lu, ctx: z.RefinementCtx): void {
  const dire = (message: string): void => { ctx.addIssue({ code: 'custom', message }); };
  const servis = rolesServis(m);
  for (const p of m.promesses) {
    const ici = `la promesse « ${p.texte} »`;
    const tenues = Object.entries(p.tenue).filter(([, v]) => v !== undefined);
    if (tenues.length !== 1) { dire(`${ici} nomme une seule chose qui la tient (\`tenue\`)`); continue; }
    const t = p.tenue;
    if (t.role) {
      if (!m.roles.some((r) => r.nom === t.role)) dire(`${ici} : le rôle ${t.role} n’est pas déclaré`);
      else if (servis.includes(t.role)) dire(`${ici} : ${t.role} est le rôle de qui l’app sert ; une promesse se tient par l’équipe de l’app`);
    }
    if (t.transition) {
      const [table, nom] = t.transition.split('.');
      const geste = m.tables.find((x) => x.nom === table)?.cycle?.transitions.find((x) => x.nom === nom);
      if (!geste) dire(`${ici} : la transition ${t.transition} n’existe pas`);
      else if (geste.par.length === 0 || geste.par.some((r) => servis.includes(r))) {
        dire(`${ici} : ${t.transition} se tient par l’équipe de l’app ; retirez de son \`par\` ${geste.par.filter((r) => servis.includes(r)).join(', ') || 'rien'}, et nommez un rôle de l’équipe`);
      }
    }
    if (t.agent && !m.agents.some((x) => x.nom === t.agent)) dire(`${ici} : l’agent ${t.agent} n’est pas déclaré`);
    if (t.automatisation && !m.automatisations.some((x) => x.nom === t.automatisation)) dire(`${ici} : l’automatisation ${t.automatisation} n’est pas déclarée`);
    if (t.fonction && !m.fonctions[t.fonction]) dire(`${ici} : la fonction ${t.fonction} n’est pas déclarée dans \`fonctions\``);
  }
  const venus = m.roles.some((r) => r.obtenu === 'inscription' || r.obtenu === 'paiement');
  if (m.nature === 'app' && venus && !m.resultat) {
    dire('l’app sert des personnes venues de sa vitrine : `resultat` nomme la table de ce qu’elles en obtiennent, dont la page publique montre les exemples');
  }
  if (m.resultat) {
    const t = m.tables.find((x) => x.nom === m.resultat);
    if (!t) dire(`\`resultat\` : la table ${m.resultat} n’est pas déclarée`);
    else {
      if (t.exemples.length === 0) dire(`\`resultat\` : ${t.nom} n’a pas d’exemple à montrer sur la page publique`);
      if (servis.length > 0 && !t.lecture.some((r) => servis.includes(r))) dire(`\`resultat\` : ${t.nom} n’est lue par aucun des rôles que l’app sert (${servis.join(', ')})`);
    }
  }
}
