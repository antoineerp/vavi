/**
 * /projets/<id>/contenu — « Gérer le contenu » : l'apparence de l'app (couleurs, polices, arrondi) et le référencement de
 * ses pages publiques (titre et description lus par les moteurs et les liens partagés), changés par la personne sans
 * modèle (exception à la règle 4, Antoine, 25/11). Les textes se réécrivent dans l'aperçu de la page du projet.
 */
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { laConsole } from '@/app/_partage/la-console';
import { leManifesteStocke } from '@/lib/projets/l-arbre-d-un-projet';
import { NOMS_DES_POLICES } from '@/lib/backend/fige/polices';
import { CHEMIN_DU_REFERENCEMENT, COULEURS, RAYONS, leReferencementStocke } from '@/lib/contenus/le-contenu';
import { magasinS3 } from '@/lib/publication/le-magasin';
import { racineDuBuild } from '@/lib/publication/publier';
import { FICHIER_DE_DECOUVERTE, lireLaDecouverte, type PageDecouverte } from '@/lib/seo/la-decouverte';
import { enregistrerLApparence, enregistrerLeReferencement } from './gestes';

export const dynamic = 'force-dynamic';

const MOTS = {
  fr: { titre: 'Gérer le contenu', retour: 'Retour au projet', apparence: 'Apparence', referencement: 'Référencement des pages',
    couleurs: { fond: 'Fond', texte: 'Texte', accent: 'Accent (boutons, liens)', surface: 'Surfaces (cartes)', bordure: 'Bordures' } as Record<string, string>,
    policeTitres: 'Police des titres', policeTexte: 'Police du texte', rayon: 'Arrondi', rayons: { net: 'net', doux: 'doux', rond: 'rond' } as Record<string, string>,
    enregistrer: 'Enregistrer et rebâtir l’aperçu', contraste: 'Le contraste de lecture est recalculé à partir de vos couleurs.',
    pageTitre: 'Titre (70 caractères au plus)', pageDescription: 'Description (200 caractères au plus)', parDefaut: 'par défaut :',
    sansPages: 'Les pages publiques apparaissent ici après un premier aperçu construit.', textes: 'Les textes des pages se réécrivent dans l’aperçu, sur la page du projet.',
    images: 'Les photos : bientôt ici. Pour l’instant, demandez à Claude de les changer.',
    fait: { apparence: 'Apparence enregistrée.', referencement: 'Référencement enregistré.' } as Record<string, string>,
    apercu: { a_jour: 'L’aperçu est à jour : publiez pour mettre en ligne.', build_rouge: 'L’aperçu n’a pas pu être rebâti : le changement est gardé, demandez à Claude de regarder.', rien_change: 'Rien n’a changé.' } as Record<string, string>,
    erreurs: { chantier_ouvert: 'Claude travaille sur ce projet : réessayez quand il a fini.', conflit: 'Le projet a changé entre-temps : rechargez la page.', panne: 'vavi n’a pas répondu ; réessayez.', mal_forme: 'À corriger :' } as Record<string, string> },
  en: { titre: 'Manage content', retour: 'Back to the project', apparence: 'Appearance', referencement: 'Page search listings',
    couleurs: { fond: 'Background', texte: 'Text', accent: 'Accent (buttons, links)', surface: 'Surfaces (cards)', bordure: 'Borders' } as Record<string, string>,
    policeTitres: 'Heading font', policeTexte: 'Body font', rayon: 'Corners', rayons: { net: 'sharp', doux: 'soft', rond: 'round' } as Record<string, string>,
    enregistrer: 'Save and rebuild the preview', contraste: 'Reading contrast is recomputed from your colours.',
    pageTitre: 'Title (70 characters at most)', pageDescription: 'Description (200 characters at most)', parDefaut: 'default:',
    sansPages: 'Public pages appear here after a first preview is built.', textes: 'Page texts are rewritten in the preview, on the project page.',
    images: 'Photos: coming here soon. For now, ask Claude to change them.',
    fait: { apparence: 'Appearance saved.', referencement: 'Search listings saved.' } as Record<string, string>,
    apercu: { a_jour: 'The preview is up to date: publish to put it online.', build_rouge: 'The preview could not be rebuilt: the change is kept, ask Claude to look.', rien_change: 'Nothing changed.' } as Record<string, string>,
    erreurs: { chantier_ouvert: 'Claude is working on this project: try again when it is done.', conflit: 'The project changed meanwhile: reload the page.', panne: 'vavi did not answer; try again.', mal_forme: 'To fix:' } as Record<string, string> },
} as const;

async function lesPagesPubliques(projet: string, empreinte: string | null): Promise<readonly PageDecouverte[]> {
  const magasin = magasinS3();
  if (!empreinte || !magasin.lu) return [];
  const o = await magasin.magasin.lire(`${racineDuBuild(projet, empreinte)}/${FICHIER_DE_DECOUVERTE}`).catch(() => 'absent' as const);
  return o === 'absent' ? [] : lireLaDecouverte(o.octets.toString('utf8'))?.pages ?? [];
}

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params;
  const q = await searchParams;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)) notFound();
  const c = await laConsole(`/projets/${id}/contenu`);
  const m = MOTS[c.langue];
  const p = await c.projets.lire(c.compte, id);
  if (p.lu && !p.valeur) notFound();
  const f = await c.projets.fichiers(c.compte, id);
  const lu = f.lu ? leManifesteStocke(f.valeur.get('app.json')) : null;
  const haut = <><Link href={`/projets/${id}`}>{m.retour}</Link><div className="entete"><h1>{m.titre}</h1>{p.lu && <span className="attenue">{p.valeur!.nom}</span>}</div></>;
  if (!p.lu || !f.lu || !lu?.lu) return <main className="console">{haut}<p role="alert">{m.erreurs.panne}</p></main>;
  const d = lu.manifeste.direction;
  const ref = leReferencementStocke(f.valeur.get(CHEMIN_DU_REFERENCEMENT));
  const pages = await lesPagesPubliques(id, p.valeur!.apercuEmpreinte);
  const message = q.fait ? `${m.fait[q.fait] ?? ''} ${q.apercu ? m.apercu[q.apercu] ?? '' : ''}` : q.erreur ? `${m.erreurs[q.erreur] ?? q.erreur}${q.detail ? ` ${q.detail}` : ''}` : null;
  return (
    <main className="console">
      {haut}
      {message && <div className="carte" role={q.erreur ? 'alert' : 'status'}>{message}</div>}
      {p.valeur!.chantier && <div className="carte" role="status">{m.erreurs.chantier_ouvert}</div>}

      <section className="carte">
        <h2>{m.apparence}</h2>
        <form action={enregistrerLApparence.bind(null, id)}>
          <div className="ligne">
            {COULEURS.map((k) => <label key={k} style={{ fontWeight: 500 }}><input type="color" name={k} defaultValue={d.couleurs[k]} /> {m.couleurs[k]}</label>)}
          </div>
          <div className="ligne" style={{ marginTop: '0.75rem' }}>
            <label>{m.policeTitres} <select name="titres" defaultValue={d.polices.titres}>{NOMS_DES_POLICES.map((n) => <option key={n}>{n}</option>)}</select></label>
            <label>{m.policeTexte} <select name="texte" defaultValue={d.polices.texte}>{NOMS_DES_POLICES.map((n) => <option key={n}>{n}</option>)}</select></label>
            <label>{m.rayon} <select name="rayon" defaultValue={d.rayon}>{RAYONS.map((r) => <option key={r} value={r}>{m.rayons[r]}</option>)}</select></label>
          </div>
          <p className="attenue">{m.contraste}</p>
          <button type="submit" disabled={Boolean(p.valeur!.chantier)}>{m.enregistrer}</button>
        </form>
      </section>

      <section className="carte">
        <h2>{m.referencement}</h2>
        {pages.length === 0 ? <p className="attenue">{m.sansPages}</p> : (
          <form action={enregistrerLeReferencement.bind(null, id)}>
            {pages.map((x) => (
              <fieldset key={x.adresse} style={{ border: 0, padding: 0, margin: '0 0 1rem' }}>
                <input type="hidden" name="adresse" value={x.adresse} />
                <strong>{x.adresse}</strong>
                <label style={{ fontWeight: 500 }}>{m.pageTitre}<input name={`titre:${x.adresse}`} maxLength={70} defaultValue={ref.pages[x.adresse]?.titre ?? ''} placeholder={`${m.parDefaut} ${x.titre}`} style={{ width: '100%' }} /></label>
                <label style={{ fontWeight: 500 }}>{m.pageDescription}<textarea name={`description:${x.adresse}`} maxLength={200} rows={2} defaultValue={ref.pages[x.adresse]?.description ?? ''} placeholder={`${m.parDefaut} ${x.description}`} style={{ width: '100%' }} /></label>
              </fieldset>
            ))}
            <button type="submit" disabled={Boolean(p.valeur!.chantier)}>{m.enregistrer}</button>
          </form>
        )}
      </section>
      <p className="attenue">{m.textes}</p>
      <p className="attenue">{m.images}</p>
    </main>
  );
}
