'use client';
/** Un bouton qui copie un texte, et dit qu'il l'a copié. */
import { useState } from 'react';

export function Copier({ texte, libelle, fait }: { texte: string; libelle: string; fait: string }) {
  const [copie, setCopie] = useState(false);
  return (
    <button type="button" className="discret" onClick={() => { void navigator.clipboard?.writeText(texte).then(() => setCopie(true)); }}>
      {copie ? fait : libelle}
    </button>
  );
}
