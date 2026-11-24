/**
 * L'IA d'une app : elle PROPOSE, une personne décide. `<ProposerParLIA>` demande au modèle une ligne de la table, à la
 * forme exacte de ses champs, avec son explication et sa confiance, d'après un texte et, au besoin, un fichier joint : une
 * photo, regardée par le modèle, ou un document, dont la plateforme lit le texte. Elle l'enregistre comme proposition, au
 * nom de ce compte (`<table>_proposer`), marquée « ia » et à l'état initial ; une transition en fait un fait.
 * `<ProvenanceDeLIA>` dit, sur chaque ligne proposée, d'où elle vient, pourquoi, et avec quelle confiance.
 *
 * Les règles que le modèle suit sont ici, et nulle part ailleurs : ne rien inventer qui ne soit dans ce qu'il lit,
 * expliquer d'où vient chaque valeur, dire sa confiance, et la dire basse plutôt que deviner.
 */
import { useState } from 'react';
import { APP, type ChampDeLApp } from '../lib/app';
import { clientDesLectures, type Ligne, type TableAvecPropositions } from '../lib/donnees';
import { langueCourante } from '../lib/langue';
import { libellesPour } from '../lib/libelles';
import { appelerLaPlateforme } from '../lib/plateforme';
import { Button } from '../ui/button';

const REGLES_DE_CONFIANCE = [
  'Vous proposez une ligne qu’une personne validera ou refusera : vous ne décidez rien.',
  'N’employez que ce que contient le texte fourni. Une valeur absente du texte reste vide ; ne l’inventez jamais.',
  'Dans « explication », dites en une ou deux phrases d’où vient chaque valeur proposée, en citant le texte.',
  'Dans « confiance » : « haute » quand chaque valeur est écrite dans le texte, « moyenne » quand l’une est déduite, « basse » dès qu’un doute demeure. Dans le doute, « basse ».',
].join('\n');

const FORME_D_UN_CHAMP: Readonly<Record<string, Record<string, unknown>>> = {
  texte: { type: 'string' }, texte_long: { type: 'string' }, nombre: { type: 'number' }, montant: { type: 'number' },
  entier: { type: 'integer' }, date: { type: 'string', format: 'date' }, date_heure: { type: 'string', format: 'date-time' },
  booleen: { type: 'boolean' },
};

/** Les champs que l'IA peut proposer : ceux qui s'écrivent d'un texte (ni pièce, ni image, ni ligne d'une autre table). */
const proposables = (champs: readonly ChampDeLApp[]): readonly ChampDeLApp[] =>
  champs.filter((c) => c.type === 'choix' ? (c.valeurs?.length ?? 0) > 0 : c.type in FORME_D_UN_CHAMP);

function formeDeLaLigne(champs: readonly ChampDeLApp[]): Record<string, unknown> {
  const proprietes = Object.fromEntries(proposables(champs).map((c) => [c.nom, {
    ...(c.type === 'choix' ? { type: 'string', enum: c.valeurs } : FORME_D_UN_CHAMP[c.type]), description: c.libelle,
  }]));
  return {
    type: 'object',
    properties: {
      ...proprietes,
      explication: { type: 'string', description: 'd’où vient chaque valeur, en citant le texte' },
      confiance: { type: 'string', enum: ['haute', 'moyenne', 'basse'] },
    },
    required: [...proposables(champs).filter((c) => c.obligatoire).map((c) => c.nom), 'explication', 'confiance'],
  };
}

interface ReponseDeLIA { readonly proposition?: { readonly id: string } | { readonly refus: string } }

/** Le plus grand côté d'une photo envoyée au modèle : au-delà, il la réduit lui-même et la paie plus cher. */
const COTE_POUR_L_IA = 1568;

/** Une photo réduite dans le navigateur, en `data:` JPEG ; `null` quand ce navigateur ne sait pas l'ouvrir. */
async function photoPourLIA(f: Blob): Promise<string | null> {
  const image = await createImageBitmap(f, { imageOrientation: 'from-image' }).catch(() => null);
  if (!image) return null;
  const echelle = Math.min(1, COTE_POUR_L_IA / Math.max(image.width, image.height));
  const toile = document.createElement('canvas');
  toile.width = Math.max(1, Math.round(image.width * echelle));
  toile.height = Math.max(1, Math.round(image.height * echelle));
  toile.getContext('2d')?.drawImage(image, 0, 0, toile.width, toile.height);
  image.close();
  return toile.toDataURL('image/jpeg', 0.85);
}

/** Ce que le modèle lit d'un fichier joint : la photo elle-même, ou le texte que la plateforme tire du document. */
async function lireLeFichier(f: File): Promise<{ readonly texte?: string; readonly image?: string } | { readonly refus: string }> {
  const L = libellesPour(langueCourante());
  if (f.type.startsWith('image/')) {
    const image = await photoPourLIA(f);
    return image ? { image } : { refus: L.photoIllisible };
  }
  const corps = new FormData();
  corps.append('file', f, f.name);
  const r = await appelerLaPlateforme<{ readonly text?: string }>('file/<projet>/parse', corps);
  return r.forme === 'refus' ? { refus: `${r.raison} ${r.geste}` } : { texte: `<document nom="${f.name}">\n${r.donnee.text ?? ''}\n</document>` };
}

/**
 * `contexte` : ce que la page donne à lire (le texte d'une ligne, d'un document) ; la personne peut y ajouter le sien.
 * `apres` : appelé avec l'identifiant de la ligne proposée.
 */
export function ProposerParLIA<T extends TableAvecPropositions>({ table, contexte, apres }: {
  readonly table: T; readonly contexte?: string; readonly apres?: (id: string) => void;
}) {
  const L = libellesPour(langueCourante());
  const [texte, setTexte] = useState('');
  const [fichier, setFichier] = useState<File | null>(null);
  const [etat, setEtat] = useState<{ readonly enCours: boolean; readonly dit: string | null; readonly refus: boolean }>({ enCours: false, dit: null, refus: false });
  const t = APP.tables.find((x) => x.nom === table);
  if (!APP.fonctions.ia || !t) return null;
  const lu = [contexte, texte].map((x) => x?.trim()).filter(Boolean).join('\n\n');

  const proposer = async () => {
    setEtat({ enCours: true, dit: null, refus: false });
    const joint = fichier ? await lireLeFichier(fichier) : {};
    if ('refus' in joint) { setEtat({ enCours: false, dit: joint.refus, refus: true }); return; }
    const aLire = [lu, joint.texte].filter(Boolean).join('\n\n');
    const r = await appelerLaPlateforme<ReponseDeLIA>('ai/<projet>/complete', {
      system: `${REGLES_DE_CONFIANCE}\nÉcrivez les valeurs dans la langue « ${langueCourante()} ».`,
      prompt: `Proposez une ligne de « ${t.libelle} » d’après ${joint.image ? 'la photo jointe et ' : ''}ce texte :\n<texte>\n${aLire}\n</texte>`,
      schema: formeDeLaLigne(t.champs), description: `une ligne proposée de « ${t.libelle} »`, proposer: { table },
      ...(joint.image ? { images: [joint.image] } : {}),
    });
    if (r.forme === 'refus') { setEtat({ enCours: false, dit: `${r.raison} ${r.geste}`, refus: true }); return; }
    const p = r.donnee.proposition;
    if (!p || 'refus' in p) { setEtat({ enCours: false, dit: p && 'refus' in p ? p.refus : L.reessayerDansUnInstant, refus: true }); return; }
    setEtat({ enCours: false, dit: L.propositionEnregistree, refus: false });
    setTexte('');
    setFichier(null);
    void clientDesLectures.invalidateQueries({ queryKey: ['base'] });
    apres?.(p.id);
  };

  return (
    <div data-ia-propose={table} className="space-y-3">
      <label className="block space-y-1 text-sm">
        <span>{L.ceQueLIALit}</span>
        <textarea value={texte} onChange={(e) => setTexte(e.target.value)} rows={4} maxLength={20_000}
          className="w-full rounded-lg border border-bordure bg-fond p-2" />
      </label>
      <label className="block space-y-1 text-sm">
        <span>{L.fichierPourLIA}</span>
        <input type="file" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt" onChange={(e) => setFichier(e.target.files?.[0] ?? null)}
          className="block w-full text-sm" />
      </label>
      <Button type="button" disabled={etat.enCours || (lu.length === 0 && !fichier)} onClick={() => void proposer()}>{etat.enCours ? L.unInstant : L.proposerParLIA}</Button>
      {etat.dit ? <p role={etat.refus ? 'alert' : 'status'} className="text-sm">{etat.dit}</p> : null}
    </div>
  );
}

/** D'où vient une ligne : rien pour une ligne écrite par une personne ; pour une proposition de l'IA, sa confiance et pourquoi. */
export function ProvenanceDeLIA<T extends TableAvecPropositions>({ ligne }: { readonly table: T; readonly ligne: Ligne<T> }) {
  const L = libellesPour(langueCourante());
  const l = ligne as unknown as { readonly origine: string; readonly ia_explication: string | null; readonly ia_confiance: string | null };
  if (l.origine !== 'ia') return null;
  const confiance = l.ia_confiance === 'haute' ? L.confianceHaute : l.ia_confiance === 'moyenne' ? L.confianceMoyenne : L.confianceBasse;
  return (
    <div data-provenance="ia" data-confiance={l.ia_confiance ?? 'basse'} className="space-y-1 rounded-lg border border-bordure bg-surface p-3 text-sm">
      <p><span className="font-medium">{L.proposeParLIA}</span> · {confiance}</p>
      {l.ia_explication ? <details><summary className="cursor-pointer">{L.pourquoi}</summary><p className="mt-1">{l.ia_explication}</p></details> : null}
    </div>
  );
}
