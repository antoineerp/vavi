/**
 * Le logo de vavi (la prise de l'accueil, `app/_accueil`), pour la console. Aucun logo de Claude : la marque d'Anthropic ne
 * s'emploie pas sans son accord ; « pour Claude » se dit en texte.
 */
export function LogoVavi({ taille = 30 }: { readonly taille?: number }) {
  return (
    <svg width={taille} height={taille} viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="6" y="12" width="20" height="18" rx="5" fill="#ffe36e" /><path d="M12 12V5M20 12V5M26 21h8" />
    </svg>
  );
}
