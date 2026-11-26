'use client';
/**
 * L'aperçu dans la console, et ses textes réécrits par la personne : l'app encadrée souligne ce qui se survole et dit ce
 * qui est cliqué (`squelette/gabarit/src/lib/edition.ts`, son `data-texte`) ; la console montre ses passages, les
 * renvoie réécrits, puis recharge l'aperçu rebâti. Rien d'autre n'est écrit.
 */
import { useEffect, useRef, useState } from 'react';
import { lesTextes, reecrire } from './gestes';
import { fournirUnePhoto } from './contenu/gestes';
import { laPhrasePourClaude, type Endroit } from '@/lib/contenus/la-phrase-pour-claude';

export interface TextesDeLEditeur {
  readonly textes: string; readonly textesExplication: string; readonly textesActif: string; readonly textesChoisir: string; readonly textesPasIci: string;
  readonly enregistrer: string; readonly annuler: string; readonly enCours: string; readonly textesFait: string; readonly textesRouge: string;
  readonly textesRefus: Record<string, string>;
}

/** « Montrer à Claude » : la personne clique une zone, dit ce qu'elle veut, et copie la phrase pour Claude. */
const MONTRER = {
  fr: { bouton: 'Montrer à Claude', actif: 'Arrêter de montrer', choisir: 'Cliquez sur la zone à changer.', demande: 'Que faut-il changer ici ?',
    exemple: 'Par exemple : mets ce titre en plus gros, ajoute une photo du port à droite', phrase: 'À coller dans votre conversation avec Claude :', copier: 'Copier', copie: 'Copié' },
  en: { bouton: 'Show Claude', actif: 'Stop showing', choisir: 'Click the area to change.', demande: 'What should change here?',
    exemple: 'For example: make this title bigger, add a photo of the harbour on the right', phrase: 'To paste in your conversation with Claude:', copier: 'Copy', copie: 'Copied' },
} as const;

type Choix = { readonly situation: string; readonly passages: string[] };

/** Une photo cliquée dans l'aperçu : la sienne à la place, sur place (`fournirUnePhoto`), ou une autre de la banque plus bas. */
const PHOTO = {
  fr: { titre: 'Remplacer cette photo', fichier: 'Votre photo (JPEG, PNG ou WebP, 8 Mo au plus ; le lieu de la prise de vue est retiré)', alt: 'Ce que montre la photo', mettre: 'Mettre ma photo',
    banque: 'Ou choisir une autre photo de la banque', pasIci: 'Cette image ne se remplace pas ici (elle est écrite dans la page) : montrez-la à Claude.' },
  en: { titre: 'Replace this photo', fichier: 'Your photo (JPEG, PNG or WebP, 8 MB at most; where it was taken is removed)', alt: 'What the photo shows', mettre: 'Use my photo',
    banque: 'Or pick another bank photo', pasIci: 'This image cannot be replaced here (it is written in the page): show it to Claude.' },
} as const;

/** `apercu` : l'adresse de l'aperçu, à son hôte (vague 0) ; les messages ne s'échangent qu'avec son origine. */
export function EditeurDeTextes({ id, apercu, t, projet, langue, photos = [] }: { readonly id: string; readonly apercu: string; readonly t: TextesDeLEditeur; readonly projet: string; readonly langue: 'fr' | 'en';
  /** Les photos de l'app (`src/images.json`) : cliquées dans l'aperçu, elles se remplacent sur place. */
  readonly photos?: readonly { readonly nom: string; readonly alt: string }[] }) {
  const origine = new URL(apercu, typeof window === 'undefined' ? 'http://localhost' : window.location.href).origin;
  const cadre = useRef<HTMLIFrameElement>(null);
  const [mode, setMode] = useState<'textes' | 'claude' | null>(null);
  const actif = mode !== null;
  const [endroit, setEndroit] = useState<Endroit | null>(null);
  const [demande, setDemande] = useState('');
  const [copie, setCopie] = useState(false);
  const m = MONTRER[langue];
  const [choix, setChoix] = useState<Choix | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);
  const [cle, setCle] = useState(0);
  const [photo, setPhoto] = useState<{ readonly nom: string; readonly alt: string } | null>(null);
  const mp = PHOTO[langue];

  const dire = (a: boolean) => cadre.current?.contentWindow?.postMessage({ type: 'EDITION_VISUELLE', actif: a }, origine);
  useEffect(() => {
    const ecouter = async (e: MessageEvent) => {
      if (e.origin !== origine || e.source !== cadre.current?.contentWindow) return;
      const d = e.data as { type?: string; source?: string; image?: string; texte?: string; chemin?: string; titreDeLaPage?: string; section?: string } | null;
      if (d?.type === 'EDITION_DISPONIBLE' && actif) dire(true);
      if (d?.type !== 'EDITION_CIBLE') return;
      if (mode === 'claude') {
        const texte = (v: unknown, n: number) => (typeof v === 'string' ? v.slice(0, n) : undefined);
        setEndroit({ chemin: texte(d.chemin, 300) ?? '/', titreDeLaPage: texte(d.titreDeLaPage, 200), section: texte(d.section, 200), texte: texte(d.texte, 500), source: texte(d.source, 300), image: texte(d.image, 100) });
        setCopie(false);
        setMessage(null);
        return;
      }
      if (d.image) {
        const trouvee = photos.find((x) => x.nom === d.image);
        setChoix(null); setPhoto(trouvee ?? null); setMessage(trouvee ? null : mp.pasIci);
        return;
      }
      setPhoto(null);
      if (!d.source) { setChoix(null); setMessage(t.textesPasIci); return; }
      const r = await lesTextes(id, d.source);
      if (!r.lu) { setChoix(null); setMessage(t.textesRefus[r.pourquoi] ?? t.textesPasIci); return; }
      setMessage(null);
      setChoix({ situation: d.source, passages: r.passages });
    };
    window.addEventListener('message', ecouter);
    return () => window.removeEventListener('message', ecouter);
  }, [actif, mode, id, t, origine, photos, mp]);

  const basculer = (vers: 'textes' | 'claude') => {
    const suivant = mode === vers ? null : vers;
    setMode(suivant); setChoix(null); setPhoto(null); setEndroit(null); setDemande('');
    setMessage(suivant === 'textes' ? t.textesChoisir : suivant === 'claude' ? m.choisir : null);
    dire(suivant !== null);
  };
  const phrase = endroit && demande.trim() ? laPhrasePourClaude({ projet, endroit, demande, langue }) : null;
  const copier = async () => { if (!phrase) return; try { await navigator.clipboard.writeText(phrase); setCopie(true); } catch { setCopie(false); } };
  const envoyer = async (f: FormData) => {
    if (!choix) return;
    setOccupe(true);
    setMessage(t.enCours);
    const r = await reecrire(id, choix.situation, choix.passages.map((_, i) => String(f.get(`p${i}`) ?? '')));
    setOccupe(false);
    setChoix(null);
    setMessage(r.reecrit ? (r.apercu === 'build_rouge' ? t.textesRouge : t.textesFait) : (t.textesRefus[r.pourquoi] ?? r.pourquoi));
    if (r.reecrit && r.apercu === 'a_jour') { setCle((k) => k + 1); setMode(null); }
  };

  return (
    <div className="carte">
      <div className="ligne">
        <button type="button" className={mode === 'textes' ? undefined : 'discret'} onClick={() => basculer('textes')} disabled={occupe}>{mode === 'textes' ? t.textesActif : t.textes}</button>
        <button type="button" className={mode === 'claude' ? undefined : 'discret'} onClick={() => basculer('claude')} disabled={occupe}>{mode === 'claude' ? m.actif : m.bouton}</button>
        <span className="attenue">{t.textesExplication}</span>
      </div>
      {message && <p role="status">{message}</p>}
      {mode === 'claude' && endroit && (
        <div style={{ marginTop: '0.75rem' }}>
          <label style={{ fontWeight: 500, display: 'block' }}>{m.demande}
            <textarea value={demande} onChange={(e) => { setDemande(e.target.value); setCopie(false); }} rows={2} maxLength={1000} placeholder={m.exemple} style={{ width: '100%' }} />
          </label>
          {phrase && (
            <>
              <p className="attenue">{m.phrase}</p>
              <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{phrase}</pre>
              <button type="button" onClick={copier}>{copie ? m.copie : m.copier}</button>
            </>
          )}
        </div>
      )}
      {mode === 'textes' && photo && (
        <form action={fournirUnePhoto.bind(null, id, photo.nom)} style={{ marginTop: '0.75rem' }}>
          <strong>{mp.titre}</strong>
          <label htmlFor="photo-cliquee" className="attenue" style={{ display: 'block', fontSize: '0.85rem' }}>{mp.fichier}</label>
          <input id="photo-cliquee" name="photo" type="file" accept="image/jpeg,image/png,image/webp" required />
          <label htmlFor="alt-cliquee" className="attenue" style={{ display: 'block', fontSize: '0.85rem' }}>{mp.alt}</label>
          <input id="alt-cliquee" name="alt" maxLength={300} defaultValue={photo.alt} style={{ width: '100%' }} />
          <div className="ligne">
            <button type="submit">{mp.mettre}</button>
            <a className="bouton discret" href={`#photo-${photo.nom}`}>{mp.banque}</a>
            <button type="button" className="discret" onClick={() => setPhoto(null)}>{t.annuler}</button>
          </div>
        </form>
      )}
      {choix && (
        <form action={envoyer}>
          {choix.passages.map((p, i) => (
            <textarea key={`${choix.situation}-${i}`} name={`p${i}`} defaultValue={p} rows={Math.min(8, Math.max(2, Math.ceil(p.length / 70)))} maxLength={2000} required style={{ width: '100%' }} />
          ))}
          <div className="ligne">
            <button type="submit" disabled={occupe}>{t.enregistrer}</button>
            <button type="button" className="discret" onClick={() => setChoix(null)} disabled={occupe}>{t.annuler}</button>
          </div>
        </form>
      )}
      <iframe key={cle} ref={cadre} src={apercu} title="aperçu" style={{ width: '100%', height: '70vh', border: '1px solid currentColor', borderRadius: 8, marginTop: '0.75rem' }} />
    </div>
  );
}
