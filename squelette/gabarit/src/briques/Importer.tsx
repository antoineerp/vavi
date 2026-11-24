/**
 * L'import d'un tableur dans une table de l'app. La plateforme lit le fichier et propose, pour chaque champ, la colonne
 * dont l'en-tête est son libellé ; la personne confirme ou choisit (et, pour un chiffre écrit en deux colonnes, celle
 * qui se retranche), voit les lignes prêtes et celles qui ne se lisent pas, puis importe : toutes les lignes entrent en
 * une écriture, à son nom, sous ses droits ; une ligne déjà là (même identité) n'est pas reprise.
 *
 * Ce qu'il remplace : la boucle de créations que chaque page écrivait, une ligne à la fois, dans le navigateur.
 */
import { useRef, useState } from 'react';
import { clientDesLectures, type NomDeTable, type Nouvelle } from '../lib/donnees';
import { langueCourante } from '../lib/langue';
import { libellesPour } from '../lib/libelles';
import { appelerLaPlateforme } from '../lib/plateforme';
import { Button } from '../ui/button';

interface Essai {
  readonly entetes: readonly string[];
  readonly colonnes: Readonly<Record<string, string>>;
  readonly moins: Readonly<Record<string, string>>;
  readonly champs: ReadonlyArray<{ readonly nom: string; readonly libelle: string; readonly type: string; readonly obligatoire: boolean }>;
  readonly total: number;
  readonly apercu: readonly Record<string, unknown>[];
  readonly ecartees: ReadonlyArray<{ readonly rang: number; readonly pourquoi: string }>;
  readonly nombreDEcartees: number;
  readonly manquants: readonly string[];
}
const CHIFFRES = ['nombre', 'entier', 'montant'];

export function Importer<T extends NomDeTable>({ table, valeurs, apres }: {
  readonly table: T;
  /** Les valeurs de chaque ligne importée que le tableau ne donne pas : la ligne mère, une référence. */
  readonly valeurs?: Partial<Nouvelle<T>>;
  /** Appelé quand les lignes sont entrées. */
  readonly apres?: (n: number) => void;
}) {
  const L = libellesPour(langueCourante());
  const choix = useRef<HTMLInputElement>(null);
  const [fichier, setFichier] = useState<File | null>(null);
  const [essai, setEssai] = useState<Essai | null>(null);
  const [etat, setEtat] = useState<{ readonly enCours: boolean; readonly dit: string | null }>({ enCours: false, dit: null });

  const envoyer = async (geste: 'essayer' | 'importer', f: File, colonnes?: Readonly<Record<string, string>>, moins?: Readonly<Record<string, string>>) => {
    const corps = new FormData();
    corps.set('fichier', f); corps.set('table', table); corps.set('geste', geste);
    if (colonnes) corps.set('colonnes', JSON.stringify(colonnes));
    if (moins) corps.set('moins', JSON.stringify(moins));
    if (valeurs) corps.set('valeurs', JSON.stringify(valeurs));
    setEtat({ enCours: true, dit: null });
    const r = await appelerLaPlateforme<{ essai?: Essai; importees?: number; deja?: number }>('importer/<projet>/lignes', corps);
    if (r.forme === 'refus') { setEtat({ enCours: false, dit: `${r.raison} ${r.geste}` }); return; }
    if (r.donnee.essai) { setEssai(r.donnee.essai); setEtat({ enCours: false, dit: null }); return; }
    const n = r.donnee.importees ?? 0;
    setEtat({ enCours: false, dit: [L.importFait.replace('{n}', String(n)), r.donnee.deja ? L.importDeja.replace('{n}', String(r.donnee.deja)) : ''].filter(Boolean).join(' ') });
    setEssai(null); setFichier(null);
    void clientDesLectures.invalidateQueries({ queryKey: ['base'] });
    apres?.(n);
  };
  const changer = (champ: string, entete: string, cle: 'colonnes' | 'moins') => {
    if (!essai || !fichier) return;
    const suivant = { ...essai[cle] };
    if (entete) suivant[champ] = entete; else delete suivant[champ];
    if (cle === 'colonnes' && !entete) { const m = { ...essai.moins }; delete m[champ]; void envoyer('essayer', fichier, suivant, m); }
    else void envoyer('essayer', fichier, cle === 'colonnes' ? suivant : essai.colonnes, cle === 'moins' ? suivant : essai.moins);
  };
  const libelle = (nom: string) => essai?.champs.find((c) => c.nom === nom)?.libelle ?? nom;
  const options = (valeur: string | undefined, surChange: (v: string) => void, nom: string) => (
    <select aria-label={nom} value={valeur ?? ''} disabled={etat.enCours} onChange={(e) => surChange(e.target.value)}
      className="h-9 rounded-md border border-bordure bg-fond px-2 text-sm">
      <option value="">{L.aucuneColonne}</option>
      {essai?.entetes.map((h) => <option key={h} value={h}>{h}</option>)}
    </select>
  );

  return (
    <div data-piece="importer" data-table={table} className="space-y-4">
      <input ref={choix} type="file" accept=".csv,.tsv,.xlsx,.xls,.ods,text/csv" className="sr-only" tabIndex={-1} aria-hidden
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) { setFichier(f); setEssai(null); void envoyer('essayer', f); } }} />
      <Button type="button" variant="outline" disabled={etat.enCours} onClick={() => choix.current?.click()}>
        {etat.enCours && !essai ? L.lectureDuTableau : essai ? L.autreTableau : L.importerUnTableau}
      </Button>
      {essai ? (
        <div className="space-y-4">
          <div className="grid gap-x-4 gap-y-2 sm:grid-cols-[minmax(8rem,auto)_1fr]">
            {essai.champs.map((c) => (
              <div key={c.nom} className="contents">
                <span className="self-center text-sm font-medium">{c.libelle}{c.obligatoire ? ' *' : ''}</span>
                <span className="flex flex-wrap items-center gap-2">
                  {options(essai.colonnes[c.nom], (v) => changer(c.nom, v, 'colonnes'), `${L.colonneDuChamp} ${c.libelle}`)}
                  {CHIFFRES.includes(c.type) && essai.colonnes[c.nom] ? (
                    <>
                      <span className="text-sm text-sur-fond-attenue">{L.moinsLaColonne}</span>
                      {options(essai.moins[c.nom], (v) => changer(c.nom, v, 'moins'), `${L.moinsLaColonne} ${c.libelle}`)}
                    </>
                  ) : null}
                </span>
              </div>
            ))}
          </div>
          {essai.manquants.length > 0 ? <p role="alert" className="text-sm">{L.choisirLaColonneDe.replace('{x}', essai.manquants.join(', '))}</p> : null}
          <p className="text-sm font-medium">{L.lignesPretes.replace('{n}', String(essai.total))}</p>
          {essai.apercu.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr>{Object.keys(essai.colonnes).map((n) => <th key={n} className="border-b border-bordure px-2 py-1 text-left font-medium">{libelle(n)}</th>)}</tr></thead>
                <tbody>{essai.apercu.map((l, i) => (
                  <tr key={i}>{Object.keys(essai.colonnes).map((n) => <td key={n} className="border-b border-bordure px-2 py-1">{l[n] === null || l[n] === undefined ? '—' : String(l[n])}</td>)}</tr>
                ))}</tbody>
              </table>
            </div>
          ) : null}
          {essai.nombreDEcartees > 0 ? (
            <div className="text-sm">
              <p>{L.lignesQuiNeSeLisentPas.replace('{n}', String(essai.nombreDEcartees))}</p>
              <ul className="mt-1 list-disc pl-5">{essai.ecartees.map((e) => <li key={e.rang}>{L.ligneN.replace('{n}', String(e.rang))} : {e.pourquoi}</li>)}</ul>
            </div>
          ) : null}
          <Button type="button" disabled={etat.enCours || essai.total === 0 || essai.manquants.length > 0}
            onClick={() => fichier && void envoyer('importer', fichier, essai.colonnes, essai.moins)}>
            {L.importerNLignes.replace('{n}', String(essai.total))}
          </Button>
        </div>
      ) : null}
      {etat.dit ? <p role="status" className="text-sm">{etat.dit}</p> : null}
    </div>
  );
}
