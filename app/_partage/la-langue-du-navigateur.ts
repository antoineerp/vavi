/**
 * PURE : la langue que le navigateur préfère parmi les deux de vavi, lue dans `Accept-Language` poids compris (Antoine,
 * 27/11 : « toucher un public international »). Remplace le seul premier code lu par la console : « de, fr;q=0.8 » y
 * donnait l'anglais. Hors français et anglais, l'anglais ; sans en-tête, `sansEntete`.
 */
export type Langue = 'fr' | 'en';

export function laLangueDuNavigateur(entete: string | null | undefined, sansEntete: Langue = 'fr'): Langue {
  const choix = (entete ?? '').split(',').map((x) => {
    const [code, ...p] = x.trim().toLowerCase().split(';');
    const q = Number(p.find((y) => y.trim().startsWith('q='))?.trim().slice(2) ?? '1');
    return { code: (code ?? '').trim().split('-')[0]!, q: Number.isFinite(q) ? q : 0 };
  }).filter((c) => c.code && c.q > 0).sort((a, b) => b.q - a.q);
  if (!choix.length) return sansEntete;
  return choix.find((c) => c.code === 'fr' || c.code === 'en')?.code === 'fr' ? 'fr' : 'en';
}
