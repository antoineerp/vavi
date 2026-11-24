// Repris de constructor-v13@5bb786e : generateur-v2/app/les-agents.ts
/**
 * Les agents d'une app : un modèle qui lit, va chercher et calcule avant de conclure, puis PROPOSE des lignes qu'une
 * personne valide. Ils s'écrivent dans app.json ; la plateforme les fait tourner par son moteur d'agents, avec les seuls
 * outils que la déclaration ouvre : lire les tables nommées pour le compte qui le lance (la sécurité des lignes décide),
 * chercher sur le web et lire une page publique, calculer, et enregistrer une proposition, marquée « ia », avec son
 * explication et sa confiance. Il n'écrit jamais un fait, n'envoie rien, ne supprime rien : une transition du cycle,
 * faite par une personne, fait d'une proposition un fait. Une page le lance (`<Agent nom>`), ou une automatisation
 * (étape `agent`).
 */
import { z } from 'zod';
import { Identifiant } from './identifiant';
import type { Automatisation } from './les-automatisations';

export const Agent = z.object({
  nom: Identifiant,
  libelle: z.string().min(1).describe('son nom à l’écran'),
  mission: z.string().min(20).max(2000)
    .describe('ce qu’il cherche et ce qu’il propose, écrit d’après la demande ; il ne décide rien : l’équipe valide chaque proposition, sauf quand la table la fait avancer seule (`sansRelecture`)'),
  lit: z.array(Identifiant).default([]).describe('les tables qu’il lit, avec les droits du compte qui le lance'),
  web: z.boolean().default(false)
    .describe('il cherche sur le web et lit les pages publiques qu’il trouve ou dont il tient l’adresse ; chaque valeur qu’il en tire cite sa page'),
  propose: Identifiant.describe('la table où il enregistre ses propositions (`propositions` sur la table)'),
  par: z.array(Identifiant).min(1).describe('les rôles de l’équipe qui le lancent à la main ; chacun écrit la table où il propose. Ce qu’il fait pour une personne servie, une automatisation le lance (étape `agent`)'),
}).describe('un agent : il lit, va chercher et calcule, puis propose des lignes qu’une personne valide');
export type Agent = z.infer<typeof Agent>;

interface TableLue {
  readonly nom: string; readonly propositions: boolean; readonly ecriture: readonly string[]; readonly contenu?: boolean;
  readonly champs: ReadonlyArray<{ readonly type: string; readonly table?: string }>;
}

/** Les agents nomment des tables, des rôles et une table à propositions qui existent ; une étape `agent` en nomme un. */
export function lireLesAgents(m: {
  readonly agents: readonly Agent[]; readonly tables: readonly TableLue[]; readonly roles: readonly { readonly nom: string }[];
  readonly automatisations: readonly Automatisation[];
}, ctx: z.RefinementCtx): void {
  const dire = (message: string) => ctx.addIssue({ code: 'custom', message });
  const noms = m.agents.map((a) => a.nom);
  for (const a of m.agents) {
    const ici = `l’agent ${a.nom}`;
    if (noms.indexOf(a.nom) !== noms.lastIndexOf(a.nom)) dire(`${ici} est déclaré deux fois`);
    for (const t of a.lit.filter((x) => !m.tables.some((y) => y.nom === x))) dire(`${ici} : la table ${t} n’est pas déclarée`);
    const cible = m.tables.find((x) => x.nom === a.propose);
    if (!cible) dire(`${ici} : la table ${a.propose} n’est pas déclarée`);
    else if (!cible.propositions) dire(`${ici} propose dans ${a.propose} : déclarez \`propositions: true\` sur cette table`);
    // Ce que l'agent tire d'une liste fixée (des exigences, un barème), il le désigne : la couverture se compte en base,
    // et une ligne de la liste qu'aucune proposition ne désigne se voit. Un texte libre ne désigne rien.
    for (const l of a.lit.map((x) => m.tables.find((y) => y.nom === x)).filter((x) => x?.contenu && x.nom !== a.propose)) {
      if (cible && !cible.champs.some((c) => c.type === 'reference' && c.table === l!.nom)) {
        dire(`${ici} lit ${l!.nom}, une liste fixée : chaque ligne qu’il propose dans ${cible.nom} désigne la sienne par un champ \`reference\` vers ${l!.nom}`);
      }
    }
    for (const r of a.par) {
      if (!m.roles.some((x) => x.nom === r)) dire(`${ici} : le rôle ${r} n’est pas déclaré`);
      else if (cible && !cible.ecriture.includes(r)) dire(`${ici} : le rôle ${r} le lance mais n’écrit pas ${cible.nom}, où il propose ; ajoutez-le à son \`ecriture\``);
    }
  }
  for (const au of m.automatisations) for (const e of au.etapes) {
    if (e.type === 'agent' && !noms.includes(e.agent)) dire(`l’automatisation ${au.nom} : l’agent ${e.agent} n’est pas déclaré dans \`agents\``);
  }
}
