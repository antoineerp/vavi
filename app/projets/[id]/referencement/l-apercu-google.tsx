'use client';
/**
 * L'aperçu d'un résultat Google pour une page : son adresse, son titre, sa description, tels que la personne les tape
 * (sinon ceux que le site sert), coupés là où Google les coupe à peu près. Remplace la seule note chiffrée de « Référencement ».
 */
import { useEffect, useState } from 'react';
import { TITRE, DESCRIPTION } from '@/lib/seo/la-note';

const couper = (t: string, max: number): string => ([...t].length > max ? `${[...t].slice(0, max - 1).join('').trimEnd()}…` : t);

export function ApercuGoogle({ adresse, racine, titre, description, legende }: { adresse: string; racine: string; titre: string; description: string; legende: string }) {
  const [t, setT] = useState(titre);
  const [d, setD] = useState(description);
  useEffect(() => {
    const champT = document.getElementById(`titre:${adresse}`) as HTMLInputElement | null;
    const champD = document.getElementById(`description:${adresse}`) as HTMLTextAreaElement | null;
    const lire = () => { setT(champT?.value.trim() || titre); setD(champD?.value.trim() || description); };
    lire();
    champT?.addEventListener('input', lire); champD?.addEventListener('input', lire);
    return () => { champT?.removeEventListener('input', lire); champD?.removeEventListener('input', lire); };
  }, [adresse, titre, description]);
  const url = `${racine}${adresse === '/' ? '' : adresse}`.replace(/^https?:\/\//, '').replace(/\//g, ' › ');
  return (
    <div aria-label={legende} style={{ marginTop: '0.6rem' }}>
      <p className="attenue" style={{ margin: '0 0 0.3rem', fontSize: '0.85rem' }}>{legende}</p>
      <div style={{ background: '#fff', color: '#202124', borderRadius: 8, padding: '0.7rem 0.9rem', fontFamily: 'arial, sans-serif', maxWidth: 600 }}>
        <div style={{ fontSize: 12, color: '#4d5156', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{url}</div>
        <div style={{ fontSize: 18, color: '#1a0dab', lineHeight: 1.3, margin: '2px 0' }}>{couper(t, TITRE.max + 5)}</div>
        <div style={{ fontSize: 14, color: '#4d5156', lineHeight: 1.45 }}>{d ? couper(d, DESCRIPTION.max) : '—'}</div>
      </div>
    </div>
  );
}
