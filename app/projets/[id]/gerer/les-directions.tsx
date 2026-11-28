/**
 * « Directions » dans « Gérer le contenu » (Antoine, 28/11 : des designs uniques, choix « Réglages puis 3 directions ») : la
 * direction posée et les deux autres que Claude a proposées (`autresDirections` d'app.json), montrées côte à côte dans leurs
 * couleurs et leurs polices ; « Poser cette direction » l'échange avec la posée, sans modèle, l'aperçu rebâti. Claude
 * propose, la personne choisit ; la composition des pages reste celle que Claude a écrite.
 */
import type { Manifeste } from '@/lib/backend/app/manifeste';
import { poserUneDirection } from '../contenu/gestes';

type UneDirection = Omit<Manifeste['direction'], 'logo' | 'travail'>;

const MOTS = {
  fr: { titre: 'Directions artistiques', explication: 'Les directions que Claude a proposées pour votre site. Posez-en une : ses couleurs, ses polices et ses effets passent sur tout le site, l’aperçu est rebâti, rien ne part en ligne avant « Publier ». La composition des pages reste : pour la refaire dans le style d’une direction, demandez-le à Claude.',
    aucune: 'Claude n’a proposé qu’une direction. Pour comparer, demandez-lui dans la conversation :', phrase: '« Propose-moi deux autres directions artistiques pour mon site. »',
    posee: 'Posée', poser: 'Poser cette direction', actuelle: 'Direction actuelle', exemple: 'Un titre', bouton: 'Bouton',
    registres: { classique: 'classique', editorial: 'éditorial', narratif: 'narratif', catalogue: 'catalogue', brut: 'brut', outil: 'outil' } as Record<string, string> },
  en: { titre: 'Art directions', explication: 'The directions Claude proposed for your site. Set one: its colours, fonts and effects apply to the whole site, the preview is rebuilt, nothing goes online before “Publish”. The page layouts stay: to redo them in a direction’s style, ask Claude.',
    aucune: 'Claude proposed a single direction. To compare, ask it in the conversation:', phrase: '“Propose two other art directions for my site.”',
    posee: 'Current', poser: 'Set this direction', actuelle: 'Current direction', exemple: 'A heading', bouton: 'Button',
    registres: { classique: 'classic', editorial: 'editorial', narratif: 'narrative', catalogue: 'catalogue', brut: 'bold', outil: 'tool' } as Record<string, string> },
} as const;

/** Le texte lisible sur une couleur : clair sur une teinte sombre, sombre sur une claire. PUR. */
const surLaCouleur = (hex: string): string => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b! > 0.3 ? '#111111' : '#ffffff';
};

function Carte({ d, nom, posee, id, m }: { readonly d: UneDirection; readonly nom: string; readonly posee: boolean; readonly id: string; readonly m: (typeof MOTS)[keyof typeof MOTS] }) {
  const c = d.couleurs;
  const rayon = { net: 2, doux: 10, rond: 999 }[d.rayon];
  return (
    <div className="carte" style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: '0.75rem', outline: posee ? `2px solid ${c.accent}` : undefined }}>
      <div style={{ background: c.fond, color: c.texte, border: `1px solid ${c.bordure}`, borderRadius: 10, padding: '1.25rem', minHeight: 150 }}>
        <div style={{ fontFamily: `'${d.polices.titres}', serif`, fontSize: '1.9rem', lineHeight: 1.05, letterSpacing: '-0.02em' }}>{m.exemple}</div>
        <p style={{ fontFamily: `'${d.polices.texte}', sans-serif`, fontSize: '0.9rem', margin: '0.5rem 0 0.9rem', opacity: 0.8 }}>{d.polices.titres} · {d.polices.texte}</p>
        <span style={{ display: 'inline-block', background: c.accent, color: surLaCouleur(c.accent), borderRadius: rayon, padding: '0.45rem 1rem', fontFamily: `'${d.polices.texte}', sans-serif`, fontSize: '0.85rem', fontWeight: 600 }}>{m.bouton}</span>
      </div>
      <div style={{ display: 'flex', gap: 6 }} aria-hidden>
        {[c.fond, c.surface, c.texte, c.accent, c.second, c.ancre].filter(Boolean).map((x, i) => <span key={i} title={x} style={{ width: 26, height: 26, borderRadius: 6, background: x, border: '1px solid #0002' }} />)}
      </div>
      <div>
        <strong>{nom}</strong>{d.registre ? <span className="attenue"> · {m.registres[d.registre] ?? d.registre}</span> : null}
        {d.intention?.signature && <p className="attenue" style={{ margin: '0.25rem 0 0', fontSize: '0.9rem' }}>{d.intention.signature}</p>}
      </div>
      {posee ? <p style={{ margin: 0, fontWeight: 600 }}>{m.posee}</p> : (
        <form action={poserUneDirection.bind(null, id)}>
          <input type="hidden" name="nom" value={nom} />
          <button type="submit">{m.poser}</button>
        </form>
      )}
    </div>
  );
}

const lienDesPolices = (noms: readonly string[]): string =>
  `https://fonts.googleapis.com/css2?${[...new Set(noms)].map((n) => `family=${n.replace(/ /g, '+')}`).join('&')}&display=swap`;

export function Directions({ id, direction, autres, langue }: { readonly id: string; readonly direction: Manifeste['direction']; readonly autres: Manifeste['autresDirections']; readonly langue: 'fr' | 'en' }) {
  const m = MOTS[langue];
  const toutes: readonly { d: UneDirection; nom: string; posee: boolean }[] = [{ d: direction, nom: direction.nom ?? m.actuelle, posee: true }, ...(autres ?? []).map((d) => ({ d, nom: d.nom, posee: false }))];
  return (
    <section className="carte" id="directions">
      <h2>{m.titre}</h2>
      {toutes.length > 1 ? <p className="attenue">{m.explication}</p> : <p className="attenue">{m.aucune} <strong>{m.phrase}</strong></p>}
      {toutes.length > 1 && (
        <>
          <link rel="stylesheet" href={lienDesPolices(toutes.flatMap((x) => [x.d.polices.titres, x.d.polices.texte]))} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '1rem' }}>
            {toutes.map((x) => <Carte key={x.nom} d={x.d} nom={x.nom} posee={x.posee} id={id} m={m} />)}
          </div>
        </>
      )}
    </section>
  );
}
