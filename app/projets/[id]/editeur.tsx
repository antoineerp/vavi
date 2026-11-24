'use client';
/**
 * L'aperçu dans la console, et ses textes réécrits par la personne : l'app encadrée souligne ce qui se survole et dit ce
 * qui est cliqué (`squelette/gabarit/src/lib/edition.ts`, son `data-texte`) ; la console montre ses passages, les
 * renvoie réécrits, puis recharge l'aperçu rebâti. Rien d'autre n'est écrit.
 */
import { useEffect, useRef, useState } from 'react';
import { lesTextes, reecrire } from './gestes';

export interface TextesDeLEditeur {
  readonly textes: string; readonly textesExplication: string; readonly textesActif: string; readonly textesChoisir: string; readonly textesPasIci: string;
  readonly enregistrer: string; readonly annuler: string; readonly enCours: string; readonly textesFait: string; readonly textesRouge: string;
  readonly textesRefus: Record<string, string>;
}

type Choix = { readonly situation: string; readonly passages: string[] };

/** `apercu` : l'adresse de l'aperçu, à son hôte (vague 0) ; les messages ne s'échangent qu'avec son origine. */
export function EditeurDeTextes({ id, apercu, t }: { readonly id: string; readonly apercu: string; readonly t: TextesDeLEditeur }) {
  const origine = new URL(apercu, typeof window === 'undefined' ? 'http://localhost' : window.location.href).origin;
  const cadre = useRef<HTMLIFrameElement>(null);
  const [actif, setActif] = useState(false);
  const [choix, setChoix] = useState<Choix | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);
  const [cle, setCle] = useState(0);

  const dire = (a: boolean) => cadre.current?.contentWindow?.postMessage({ type: 'EDITION_VISUELLE', actif: a }, origine);
  useEffect(() => {
    const ecouter = async (e: MessageEvent) => {
      if (e.origin !== origine || e.source !== cadre.current?.contentWindow) return;
      const d = e.data as { type?: string; source?: string; image?: string } | null;
      if (d?.type === 'EDITION_DISPONIBLE' && actif) dire(true);
      if (d?.type !== 'EDITION_CIBLE') return;
      if (!d.source) { setChoix(null); setMessage(t.textesPasIci); return; }
      const r = await lesTextes(id, d.source);
      if (!r.lu) { setChoix(null); setMessage(t.textesRefus[r.pourquoi] ?? t.textesPasIci); return; }
      setMessage(null);
      setChoix({ situation: d.source, passages: r.passages });
    };
    window.addEventListener('message', ecouter);
    return () => window.removeEventListener('message', ecouter);
  }, [actif, id, t, origine]);

  const basculer = () => { const a = !actif; setActif(a); setChoix(null); setMessage(a ? t.textesChoisir : null); dire(a); };
  const envoyer = async (f: FormData) => {
    if (!choix) return;
    setOccupe(true);
    setMessage(t.enCours);
    const r = await reecrire(id, choix.situation, choix.passages.map((_, i) => String(f.get(`p${i}`) ?? '')));
    setOccupe(false);
    setChoix(null);
    setMessage(r.reecrit ? (r.apercu === 'build_rouge' ? t.textesRouge : t.textesFait) : (t.textesRefus[r.pourquoi] ?? r.pourquoi));
    if (r.reecrit && r.apercu === 'a_jour') { setCle((k) => k + 1); setActif(false); }
  };

  return (
    <div className="carte">
      <div className="ligne">
        <button type="button" className={actif ? undefined : 'discret'} onClick={basculer} disabled={occupe}>{actif ? t.textesActif : t.textes}</button>
        <span className="attenue">{t.textesExplication}</span>
      </div>
      {message && <p role="status">{message}</p>}
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
