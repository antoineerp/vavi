/**
 * Mettre un article au panier : une ligne d'une table qui se vend (`vente` dans app.json), désignée par son identifiant.
 * Quand l'article se décline (`vente.options`), ses variantes se lisent sur sa ligne et l'acheteur en choisit une avant
 * de l'ajouter. Le prix n'est pas donné ici : la plateforme le lit en base au panier et au paiement, et refuse une
 * variante qui n'est pas proposée.
 *
 * Ce qu'il remplace : un article décliné s'ajoutait sans variante ; la plateforme refusait ensuite de le faire payer.
 */
import { useState } from 'react';
import { Link } from 'react-router';
import { panier } from '../lib/panier';
import { APP } from '../lib/app';
import { useLecture, type NomDeTable } from '../lib/donnees';
import { langueCourante } from '../lib/langue';
import { libellesPour } from '../lib/libelles';
import { Button } from '../ui/button';

export interface AjouterAuPanierProps {
  readonly table: string;
  readonly id: string;
  readonly quantite?: number;
  readonly className?: string;
}

/** Les variantes d'un article, comme la plateforme les lit : une liste JSON, ou un texte séparé par des virgules. PUR. */
export function lesVariantes(brut: unknown): string[] {
  const t = typeof brut === 'string' ? brut.trim() : Array.isArray(brut) ? JSON.stringify(brut) : '';
  let liste: unknown = null;
  try { liste = t.startsWith('[') ? JSON.parse(t) : null; } catch { liste = null; }
  const valeurs = Array.isArray(liste) ? liste.map(String) : t.split(/[,;\n]/);
  return [...new Set(valeurs.map((v) => v.trim()).filter(Boolean))];
}

export function AjouterAuPanier(p: AjouterAuPanierProps) {
  const champ = APP.tables.find((t) => t.nom === p.table)?.vente?.options;
  return champ ? <AvecSesVariantes {...p} champ={champ} /> : <Ajout {...p} variantes={[]} />;
}

function AvecSesVariantes({ champ, ...p }: AjouterAuPanierProps & { readonly champ: string }) {
  const lecture = useLecture(p.table as NomDeTable, { egal: { id: p.id } as never, limite: 1 });
  const ligne = lecture.forme === 'donnee' ? (lecture.donnee.lignes[0] as Record<string, unknown> | undefined) : undefined;
  const libelle = APP.tables.find((t) => t.nom === p.table)?.champs.find((c) => c.nom === champ)?.libelle ?? champ;
  return <Ajout {...p} variantes={lesVariantes(ligne?.[champ])} libelle={libelle} pret={lecture.forme !== 'attente'} />;
}

function Ajout({ table, id, quantite = 1, className, variantes, libelle = '', pret = true }: AjouterAuPanierProps & {
  readonly variantes: readonly string[]; readonly libelle?: string; readonly pret?: boolean;
}) {
  const L = libellesPour(langueCourante());
  const [choisie, choisir] = useState<string | null>(null);
  const [dit, dire] = useState<'ajoute' | 'choisir' | null>(null);
  const ajouter = () => {
    if (variantes.length > 0 && !choisie) { dire('choisir'); return; }
    panier.ajouter(table, id, quantite, choisie ?? undefined);
    dire('ajoute');
  };
  return (
    <span data-ajouter-au-panier={table} className={`inline-flex flex-col gap-3 ${className ?? ''}`}>
      {variantes.length > 0 ? (
        <fieldset data-variantes="" className="space-y-2">
          <legend className="text-sm font-medium">{libelle}</legend>
          <span className="flex flex-wrap gap-2">
            {variantes.map((v) => (
              <button key={v} type="button" aria-pressed={choisie === v} onClick={() => { choisir(v); dire(null); }}
                className={`min-w-11 rounded-md border px-3 py-2 text-sm transition-colors ${choisie === v ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:border-foreground'}`}>
                {v}
              </button>
            ))}
          </span>
        </fieldset>
      ) : null}
      <span className="inline-flex flex-wrap items-center gap-3">
        <Button type="button" disabled={!pret} onClick={ajouter}>{L.ajouterAuPanier}</Button>
        {dit === 'ajoute' ? <Link to="/panier" role="status" className="text-sm underline underline-offset-4">{L.ajouteAuPanier}</Link> : null}
        {dit === 'choisir' ? <span role="alert" className="text-sm text-destructive">{L.choisirDAbord.replace('{x}', libelle)}</span> : null}
      </span>
    </span>
  );
}
