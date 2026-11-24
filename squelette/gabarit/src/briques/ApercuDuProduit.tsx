/**
 * L'app montrée sur sa page publique, avant qu'on s'y inscrive : une fenêtre de l'app dessinée depuis app.json (son nom,
 * ses écrans au menu, les lignes d'exemple d'une table avec leurs états) et, posée devant, une ligne de ce que la
 * personne obtient. Rien n'est lu en base : un visiteur ne lit aucune ligne de personne ; tout est marqué comme exemple.
 *
 * Ce qu'elle remplace (interdit 9) : la photo d'illustration à l'ouverture d'une app, qui ne montrait jamais l'app.
 */
import { APP, libelleDEtat, type ChampDeLApp, type TableDeLApp } from '../lib/app';
import { langueCourante } from '../lib/langue';
import { libellesPour } from '../lib/libelles';
import { valeurDExemple } from '../lib/valeur-d-exemple';
import { TABLES_DE_LA_PLATEFORME } from '../donnees/types';
import { cn } from '../ui/cn';

const DE_LA_PLATEFORME = new Set((TABLES_DE_LA_PLATEFORME as readonly { readonly nom: string }[]).map((t) => t.nom));
const LISIBLE = (c: ChampDeLApp): boolean => c.type !== 'fichier' && c.type !== 'image' && c.type !== 'texte_long';

/** Les tables que l'app montre à ses écrans et qui ont des exemples à montrer. */
function tablesMontrees(): readonly TableDeLApp[] {
  return APP.tables.filter((t) => !DE_LA_PLATEFORME.has(t.nom) && (t.exemples ?? []).length > 0);
}

/** Les valeurs d'une ligne d'exemple, écrites en clair, dans l'ordre de ses champs lisibles. */
function valeurs(t: TableDeLApp, x: Readonly<Record<string, unknown>>, langue: string, L: ReturnType<typeof libellesPour>) {
  return t.champs.filter(LISIBLE).flatMap((c) => {
    const v = valeurDExemple(c, x[c.nom], langue, L);
    return v === null ? [] : [{ libelle: c.libelle, valeur: v, type: c.type }];
  });
}

/** Ce qu'une ligne rend se lit d'abord dans ses chiffres et ses choix : ils passent devant les textes et les dates. */
const PARLANTS = ['nombre', 'entier', 'montant', 'choix', 'booleen'];
const parlantsDabord = <T extends { readonly type: string }>(xs: readonly T[]): T[] =>
  [...xs.filter((x) => PARLANTS.includes(x.type)), ...xs.filter((x) => !PARLANTS.includes(x.type))];

export function ApercuDuProduit({ table, className }: {
  /** L'écran montré dans la fenêtre ; par défaut, une table à états autre que le résultat. */
  readonly table?: string;
  readonly className?: string;
}) {
  const langue = langueCourante();
  const L = libellesPour(langue);
  const montrees = tablesMontrees();
  const fenetre = montrees.find((t) => t.nom === table)
    ?? montrees.find((t) => t.nom !== APP.resultat && t.cycle)
    ?? montrees.find((t) => t.nom !== APP.resultat)
    ?? montrees[0];
  if (!fenetre) return null;
  const resultat = montrees.find((t) => t.nom === APP.resultat && t.nom !== fenetre.nom);
  const ligneDuResultat = resultat?.exemples?.[0];
  return (
    <figure data-piece="apercu-du-produit" data-table={fenetre.nom} className={cn('relative', resultat && 'pb-24 md:pb-16', className)}>
      <figcaption className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{L.exempleFictif}</figcaption>
      <div className="overflow-hidden rounded-xl border border-border bg-card text-left shadow-xl">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3" aria-hidden>
          <span className="size-2.5 rounded-full bg-border" /><span className="size-2.5 rounded-full bg-border" /><span className="size-2.5 rounded-full bg-border" />
          <span className="ml-3 truncate text-xs font-medium text-muted-foreground">{APP.nom}</span>
        </div>
        <div className="grid sm:grid-cols-[10rem_minmax(0,1fr)]">
          <ul className="hidden space-y-1 border-r border-border p-3 text-xs sm:block">
            {montrees.map((t) => (
              <li key={t.nom} className={cn('truncate rounded-md px-2 py-1.5', t.nom === fenetre.nom ? 'bg-secondary font-semibold' : 'text-muted-foreground')}>{t.libelle}</li>
            ))}
          </ul>
          <div className="min-w-0 space-y-3 p-4">
            <p className="font-titre text-lg leading-tight">{fenetre.libelle}</p>
            <ul className="divide-y divide-border rounded-lg border border-border">
              {(fenetre.exemples ?? []).slice(0, 4).map((x, i) => {
                const [nom, ...reste] = valeurs(fenetre, x, langue, L);
                return (
                  <li key={i} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{nom?.valeur}</p>
                      {reste.length > 0 ? <p className="truncate text-xs text-muted-foreground">{reste.slice(0, 2).map((v) => v.valeur).join(' · ')}</p> : null}
                    </div>
                    {typeof x.etat === 'string' ? <span className="shrink-0 rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-accent-texte">{libelleDEtat(fenetre.nom, x.etat)}</span> : null}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </div>
      {resultat && ligneDuResultat ? (() => {
        const [nom, ...reste] = valeurs(resultat, ligneDuResultat, langue, L);
        return (
          <article className="absolute bottom-0 right-3 w-72 max-w-[90%] rounded-xl border border-border bg-card p-4 text-left shadow-2xl md:-right-6 md:w-80">
            <p className="text-xs font-semibold uppercase tracking-wide text-accent-texte">
              {resultat.libelle}{typeof ligneDuResultat.etat === 'string' ? ` · ${libelleDEtat(resultat.nom, ligneDuResultat.etat)}` : ''}
            </p>
            {nom ? <p className="mt-1 truncate font-medium">{nom.valeur}</p> : null}
            <dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-sm">
              {parlantsDabord(reste).slice(0, 3).map((v) => (
                <div key={v.libelle} className="contents"><dt className="text-muted-foreground">{v.libelle}</dt><dd className="truncate text-right font-medium tabular-nums">{v.valeur}</dd></div>
              ))}
            </dl>
          </article>
        );
      })() : null}
    </figure>
  );
}
