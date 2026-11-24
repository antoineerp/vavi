/**
 * Ce que la personne obtient de l'app, montré sur la page publique avant qu'elle ne s'inscrive : les lignes d'exemple de
 * la table `resultat` d'app.json, champ par champ, sous leurs libellés, marquées comme des exemples. Rien n'est lu en
 * base : un visiteur ne lit aucune ligne de personne.
 *
 * Ce qu'il remplace (interdit 9) : une vitrine qui décrivait l'app en trois cartes sans jamais montrer ce qu'elle rend.
 */
import { APP, libelleDEtat } from '../lib/app';
import { langueCourante } from '../lib/langue';
import { libellesPour } from '../lib/libelles';
import { valeurDExemple } from '../lib/valeur-d-exemple';

export function ExempleDuResultat({ titre, nombre = 3 }: {
  /** Ce que la page dit de ces lignes, au-dessus d'elles. */
  readonly titre?: string;
  /** Combien de lignes d'exemple montrer. */
  readonly nombre?: number;
}) {
  const langue = langueCourante();
  const L = libellesPour(langue);
  const t = APP.tables.find((x) => x.nom === APP.resultat);
  if (!t) return null;
  const champs = t.champs.filter((c) => c.type !== 'fichier' && c.type !== 'image');
  const lignes = (t.exemples ?? []).slice(0, nombre);
  return (
    <section data-piece="exemple-du-resultat" data-table={t.nom} className="@container space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        {titre ? <h2 className="font-titre text-2xl tracking-tight">{titre}</h2> : null}
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sur-fond-attenue">{L.exempleFictif}</p>
      </div>
      <div className="grid gap-4 @xl:grid-cols-2">
        {lignes.map((x, i) => (
          <article key={i} className="rounded-lg border border-bordure bg-fond p-5">
            {typeof x.etat === 'string' ? <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-accent-texte">{libelleDEtat(t.nom, x.etat)}</p> : null}
            <dl className="grid gap-x-4 gap-y-1 text-sm @md:grid-cols-[minmax(7rem,auto)_1fr] @md:gap-y-2">
              {champs.map((c) => {
                const v = valeurDExemple(c, x[c.nom], langue, L);
                return v === null ? null : (
                  <div key={c.nom} className="contents"><dt className="text-sur-fond-attenue">{c.libelle}</dt><dd className="min-w-0 break-words">{v}</dd></div>
                );
              })}
            </dl>
          </article>
        ))}
      </div>
    </section>
  );
}
