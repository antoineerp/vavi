/**
 * L'apparence dans « Gérer le contenu » : couleurs, polices et arrondi de l'app, changés par la personne sans modèle, l'aperçu
 * rebâti (`enregistrerLApparence`). Venue de l'ancien écran « Apparence et titres » quand la console n'a gardé qu'un écran
 * pour le contenu (26/11) ; les titres des pages sont dans le référencement.
 */
import { POLICES_PROPOSEES } from '@/lib/backend/fige/polices';
import { CHAMPS_DES_EFFETS, CHAMPS_DES_POLICES, COULEURS, RAYONS } from '@/lib/contenus/le-contenu';
import { MOUVEMENTS } from '@/lib/backend/app/manifeste';
import { deposerLeLogo, enregistrerLApparence, retirerLeLogo } from '../contenu/gestes';

const MOTS = {
  fr: { apparence: 'Apparence', explication: 'Les couleurs, les polices, les arrondis et les effets de tout le site. L’aperçu est rebâti ; rien ne part en ligne avant « Publier ».',
    couleurs: { fond: 'Fond', texte: 'Texte', accent: 'Accent (boutons, liens)', surface: 'Surfaces (cartes)', bordure: 'Bordures' } as Record<string, string>,
    policeTitres: 'Police des titres', policeTexte: 'Police du texte', rayon: 'Arrondi', rayons: { net: 'net', doux: 'doux', rond: 'rond' } as Record<string, string>,
    enregistrer: 'Enregistrer et rebâtir l’aperçu', contraste: 'Le contraste de lecture est recalculé à partir de vos couleurs.',
    logo: 'Logo', logoExplication: 'Montré à la place du nom dans l’en-tête et le pied, et en icône de l’onglet. PNG ou WebP à fond transparent de préférence, 8 Mo au plus.',
    logoActuel: 'Votre logo', deposerLogo: 'Déposer ce logo', retirerLogo: 'Retirer le logo', sansLogo: 'Aucun logo : le nom du site est montré.',
    mouvement: 'Mouvement', mouvements: { vivant: 'vivant (les sections apparaissent, les cartes se soulèvent)', discret: 'discret (court et sobre)', immobile: 'immobile (rien ne bouge)' } as Record<string, string>,
    verre: 'Verre dépoli (en-tête, cartes posées sur une photo)', degrade: 'Mots du titre en dégradé', oui: 'oui', non: 'non' },
  en: { apparence: 'Appearance', explication: 'The colours, fonts, corners and effects of the whole site. The preview is rebuilt; nothing goes online before “Publish”.',
    couleurs: { fond: 'Background', texte: 'Text', accent: 'Accent (buttons, links)', surface: 'Surfaces (cards)', bordure: 'Borders' } as Record<string, string>,
    policeTitres: 'Heading font', policeTexte: 'Body font', rayon: 'Corners', rayons: { net: 'sharp', doux: 'soft', rond: 'round' } as Record<string, string>,
    enregistrer: 'Save and rebuild the preview', contraste: 'Reading contrast is recomputed from your colours.',
    logo: 'Logo', logoExplication: 'Shown instead of the name in the header and footer, and as the tab icon. PNG or WebP with a transparent background preferably, 8 MB at most.',
    logoActuel: 'Your logo', deposerLogo: 'Upload this logo', retirerLogo: 'Remove the logo', sansLogo: 'No logo: the site name is shown.',
    mouvement: 'Motion', mouvements: { vivant: 'lively (sections rise into view, cards lift)', discret: 'subtle (short and sober)', immobile: 'still (nothing moves)' } as Record<string, string>,
    verre: 'Frosted glass (header, cards over a photo)', degrade: 'Headline words in a gradient', oui: 'yes', non: 'no' },
} as const;

/** Les polices proposées ; celle déjà choisie reste dans la liste même retirée, pour qu'enregistrer ne la change pas en douce. */
const lesPolices = (choisie: string): readonly string[] => (POLICES_PROPOSEES.includes(choisie) ? POLICES_PROPOSEES : [choisie, ...POLICES_PROPOSEES]);

export interface DirectionMontree {
  readonly couleurs: Readonly<Record<(typeof COULEURS)[number], string>>;
  readonly polices: { readonly titres: string; readonly texte: string };
  readonly rayon: string;
  readonly logo?: string;
  readonly mouvement: string;
  readonly verre: boolean;
  readonly degrade: boolean;
}

export function Apparence({ id, d, langue }: { readonly id: string; readonly d: DirectionMontree; readonly langue: 'fr' | 'en' }) {
  const m = MOTS[langue];
  return (
    <section className="carte" id="apparence">
      <h2>{m.apparence}</h2>
      <p className="attenue">{m.explication}</p>
      <form action={enregistrerLApparence.bind(null, id)}>
        <div className="ligne">
          {COULEURS.map((k) => <label key={k} style={{ fontWeight: 500 }}><input type="color" name={k} defaultValue={d.couleurs[k]} /> {m.couleurs[k]}</label>)}
        </div>
        <div className="ligne" style={{ marginTop: '0.75rem' }}>
          <label>{m.policeTitres} <select name={CHAMPS_DES_POLICES.titres} defaultValue={d.polices.titres}>{lesPolices(d.polices.titres).map((n) => <option key={n}>{n}</option>)}</select></label>
          <label>{m.policeTexte} <select name={CHAMPS_DES_POLICES.texte} defaultValue={d.polices.texte}>{lesPolices(d.polices.texte).map((n) => <option key={n}>{n}</option>)}</select></label>
          <label>{m.rayon} <select name="rayon" defaultValue={d.rayon}>{RAYONS.map((r) => <option key={r} value={r}>{m.rayons[r]}</option>)}</select></label>
        </div>
        <div className="ligne" style={{ marginTop: '0.75rem' }}>
          <label>{m.mouvement} <select name={CHAMPS_DES_EFFETS.mouvement} defaultValue={d.mouvement}>{MOUVEMENTS.map((x) => <option key={x} value={x}>{m.mouvements[x]}</option>)}</select></label>
          <label>{m.verre} <select name={CHAMPS_DES_EFFETS.verre} defaultValue={d.verre ? 'oui' : 'non'}><option value="oui">{m.oui}</option><option value="non">{m.non}</option></select></label>
          <label>{m.degrade} <select name={CHAMPS_DES_EFFETS.degrade} defaultValue={d.degrade ? 'oui' : 'non'}><option value="oui">{m.oui}</option><option value="non">{m.non}</option></select></label>
        </div>
        <p className="attenue">{m.contraste}</p>
        <button type="submit">{m.enregistrer}</button>
      </form>
      <h3 id="logo" style={{ marginTop: '1.5rem' }}>{m.logo}</h3>
      <p className="attenue">{m.logoExplication}</p>
      {d.logo ? (
        <div className="ligne" style={{ alignItems: 'center' }}>
          <img src={d.logo} alt={m.logoActuel} style={{ height: 48, width: 'auto', maxWidth: 220, objectFit: 'contain', background: '#fff', borderRadius: 8, padding: 6 }} />
          <form action={retirerLeLogo.bind(null, id)}><button type="submit" className="discret petit">{m.retirerLogo}</button></form>
        </div>
      ) : <p className="attenue">{m.sansLogo}</p>}
      <form action={deposerLeLogo.bind(null, id)} className="ligne" style={{ marginTop: '0.5rem' }}>
        <input name="photo" type="file" accept="image/png,image/webp,image/jpeg" required aria-label={m.logo} />
        <button type="submit" className="discret">{m.deposerLogo}</button>
      </form>
    </section>
  );
}
