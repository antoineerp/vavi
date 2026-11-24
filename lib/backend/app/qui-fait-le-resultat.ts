// Repris de constructor-v13@5bb786e : generateur-v2/app/qui-fait-le-resultat.ts
/**
 * Qui fait ce que la personne servie obtient de l'IA. Le cadrage décide, d'après la demande, qui valide ce que l'IA
 * propose (`par` des transitions) : l'équipe, la personne elle-même quand l'IA l'aide sur ce qui est à elle, ou la base
 * seule quand la demande veut le résultat sans relecture (`sansRelecture`, marqué produit par l'IA). Ce qui se tient
 * sans deviner : quand l'équipe valide, la personne servie ne lance pas l'IA à la main, une automatisation la lance sur
 * ce qu'elle dépose ; et ce que l'IA propose comme son `resultat`, elle ne le valide jamais elle-même.
 *
 * Ce qu'il remplace (interdit 9) : rien ne disait qui fait le travail ; le client lançait l'analyse, écrivait et retenait
 * ses propres constats, et créait son rapport par un bouton.
 */
import type { z } from 'zod';

interface Lu {
  readonly roles: readonly { readonly nom: string; readonly obtenu: string; readonly client?: boolean }[];
  readonly tables: readonly {
    readonly nom: string; readonly ecriture: readonly string[]; readonly propositions: boolean; readonly sansRelecture?: string; readonly parent?: string;
    readonly cycle?: { readonly initial: string; readonly transitions: readonly { readonly nom: string; readonly de: readonly string[]; readonly par: readonly string[] }[] };
  }[];
  readonly agents: readonly { readonly nom: string; readonly lit: readonly string[]; readonly par: readonly string[]; readonly propose: string }[];
  readonly automatisations: readonly { readonly etapes: readonly { readonly type: string; readonly agent?: string; readonly etapes?: readonly { readonly type: string; readonly agent?: string }[] }[] }[];
  readonly resultat?: string;
}

/** Un rôle de quelqu'un que l'app sert, et non de l'équipe qui la tient. */
export const estServi = (r: { readonly obtenu: string; readonly client?: boolean }): boolean =>
  r.obtenu === 'inscription' || r.obtenu === 'paiement' || r.client === true;

export function lireQuiFaitLeResultat(m: Lu, ctx: z.RefinementCtx): void {
  const dire = (message: string): void => { ctx.addIssue({ code: 'custom', message }); };
  const servis = new Set(m.roles.filter(estServi).map((r) => r.nom));
  const lances = new Set(m.automatisations.flatMap((a) => a.etapes.flatMap((e) => [e, ...(e.etapes ?? [])]))
    .filter((e) => e.type === 'agent' && e.agent).map((e) => e.agent!));
  // Ce que l'équipe valide : aucune personne servie ne fait avancer une proposition qui vient de naître.
  const valideeParLEquipe = (nom: string): boolean => {
    const t = m.tables.find((x) => x.nom === nom);
    return Boolean(t?.propositions && t.cycle && !t.cycle.transitions.some((tr) => tr.de.includes(t.cycle!.initial) && tr.par.some((r) => servis.has(r))));
  };
  for (const a of m.agents.filter((x) => valideeParLEquipe(x.propose))) {
    for (const r of a.par.filter((x) => servis.has(x))) {
      dire(`l’agent ${a.nom} : l’équipe valide ce qu’il propose, donc ${r}, servi par l’app, ne le lance pas à la main ; une automatisation le lance quand sa demande change d’état (déclencheur \`evenement\`, étape \`agent\`) ; \`par\` nomme les rôles de l’équipe qui peuvent le relancer`);
    }
    const deposees = a.lit.filter((t) => m.tables.find((x) => x.nom === t)?.ecriture.some((r) => servis.has(r)));
    if (deposees.length > 0 && !lances.has(a.nom)) {
      dire(`l’agent ${a.nom} travaille sur ce que les personnes servies déposent (${deposees.join(', ')}) : une automatisation le lance quand leur demande est envoyée (déclencheur \`evenement\` sur sa table et l’état d’envoi, étape \`agent\`) ; sans elle, leur demande attend qu’on la lance à la main`);
    }
  }
  for (const t of m.tables) {
    // Ce que la personne obtient, quand l'IA le propose : elle ne le valide pas elle-même.
    if (t.propositions && m.resultat && (t.nom === m.resultat || t.parent === m.resultat)) {
      for (const tr of t.cycle?.transitions ?? []) for (const r of tr.par.filter((x) => servis.has(x))) {
        dire(`${t.nom}.${tr.nom} : ${r} est servi par l’app ; il ne valide pas ce que l’IA propose comme son résultat : l’équipe le fait (\`par\`), ou la base seule quand la demande veut le résultat sans relecture (\`sansRelecture\`)`);
      }
    }
    if (t.sansRelecture) {
      const tr = t.cycle?.transitions.find((x) => x.nom === t.sansRelecture);
      if (!t.propositions) dire(`${t.nom} : \`sansRelecture\` se déclare sur une table qui reçoit des propositions de l’IA`);
      else if (!tr) dire(`${t.nom} : ${t.sansRelecture} n’est pas une transition de ${t.nom}`);
      else if (!tr.de.includes(t.cycle!.initial)) dire(`${t.nom}.${tr.nom} : la base la fait sur une proposition qui vient de naître ; elle part de l’état initial ${t.cycle!.initial}`);
    }
  }
}
