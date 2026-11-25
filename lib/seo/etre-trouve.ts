/**
 * ÊTRE TROUVÉ SUR GOOGLE ET LES IA — la liste, tirée de l'état RÉEL du site. Chaque ligne regarde une CHOSE : le site
 * publié, son domaine, la balise Search Console posée, la description de chaque page, les coordonnées déclarées, l'image
 * de partage, le choix des robots d'IA. Ce qui se fait CHEZ Google (valider la propriété, envoyer le sitemap, la fiche
 * d'établissement) n'est jamais coché par vavi : c'est dit « chez Google », avec le lien direct. PUR.
 *
 * Repris de constructor-v13@32d18f3 (`lib/publication/etre-trouve.ts`), au vous de la console ; sans la ligne IndexNow,
 * que vavi n'envoie pas.
 */
export type EtatDUnPas = 'fait' | 'a-faire' | 'chez-google';

export interface PasPourEtreTrouve { readonly id: string; readonly etat: EtatDUnPas; readonly titre: string; readonly aide: string; readonly lien?: string }

export interface CeQueLeSiteEst {
  /** Le site est en ligne : sitemap, robots et llms.txt servis. */
  readonly publie: boolean;
  /** L'adresse publique du site, sans `/` final ; `''` avant la mise en ligne. */
  readonly adresse: string;
  readonly domaineActif: boolean;
  readonly jetonGoogle: boolean;
  /** Les pages publiques, et celles qui ont leur propre description. */
  readonly pages: readonly string[];
  readonly pagesDecrites: readonly string[];
  readonly imageDePartage: boolean;
  /** Ce qui manque aux coordonnées de l'éditeur (`lesCoordonneesManquantes`). */
  readonly coordonneesManquantes: readonly string[];
  readonly adressePostale: boolean;
  readonly assistantsAutorises: boolean;
}

/** Les coordonnées que Google et les assistants IA lisent pour dire « qui », « où » et « comment joindre ». PURE. */
export function lesCoordonneesManquantes(e: { readonly nom?: string; readonly adresse?: string; readonly telephone?: string; readonly courriel?: string } | null | undefined): string[] {
  return ([['nom', 'le nom'], ['adresse', 'l’adresse'], ['telephone', 'le téléphone'], ['courriel', 'le courriel']] as const)
    .filter(([k]) => !e?.[k]?.trim()).map(([, libelle]) => libelle);
}

export function pourEtreTrouve(s: CeQueLeSiteEst): PasPourEtreTrouve[] {
  const racine = s.adresse.replace(/\/+$/, '');
  const sansDescription = s.pages.filter((p) => !s.pagesDecrites.includes(p));
  return [
    { id: 'publie', etat: s.publie ? 'fait' : 'a-faire', titre: 'Le site est en ligne',
      aide: s.publie ? 'Sitemap, robots.txt et llms.txt sont servis.' : 'Cliquez « Publier » : rien n’est référencé avant.' },
    { id: 'domaine', etat: s.domaineActif ? 'fait' : 'a-faire', titre: 'Votre domaine est branché',
      aide: s.domaineActif ? `L’adresse officielle est ${racine}.` : 'Un domaine à vous (www.votre-nom.fr) inspire confiance et devient l’adresse que Google retient.' },
    { id: 'search-console', etat: s.jetonGoogle ? 'chez-google' : 'a-faire', titre: 'Le site est déclaré à Google (Search Console)',
      aide: s.jetonGoogle ? 'La balise est posée sur votre site : cliquez « Valider » dans Search Console.' : 'Ajoutez la propriété dans Search Console, puis collez la balise ci-dessous.',
      lien: 'https://search.google.com/search-console' },
    { id: 'sitemap', etat: 'chez-google', titre: 'Le plan du site est envoyé à Google',
      aide: racine ? `Dans Search Console › Sitemaps, envoyez ${racine}/sitemap.xml.` : 'Après la mise en ligne, envoyez le plan du site dans Search Console.',
      ...(racine ? { lien: `https://search.google.com/search-console/sitemaps?resource_id=${encodeURIComponent(`${racine}/`)}` } : {}) },
    { id: 'descriptions', etat: sansDescription.length === 0 ? 'fait' : 'a-faire', titre: 'Chaque page a sa description',
      aide: sansDescription.length === 0 ? 'Google affiche la vôtre sous chaque lien.' : `Sans description propre : ${sansDescription.join(', ')}. Google choisira un extrait au hasard.` },
    { id: 'coordonnees', etat: s.coordonneesManquantes.length === 0 ? 'fait' : 'a-faire', titre: 'Vos coordonnées sont complètes',
      aide: s.coordonneesManquantes.length === 0 ? 'Elles figurent sur le site, dans ses données pour Google et dans llms.txt.'
        : `À compléter : ${s.coordonneesManquantes.join(', ')}. Les assistants IA répondent « où » et « comment vous joindre » avec elles.` },
    { id: 'fiche-google', etat: 'chez-google', titre: 'Votre fiche d’établissement Google',
      aide: s.adressePostale ? 'Créez-la ou revendiquez-la avec la même adresse et le même téléphone que le site : c’est elle qui apparaît sur Maps.'
        : 'Si vous recevez des clients, créez-la : c’est elle qui apparaît sur Maps et dans les recherches « près de chez moi ».',
      lien: 'https://www.google.com/business/' },
    { id: 'image', etat: s.imageDePartage ? 'fait' : 'a-faire', titre: 'Une image de partage',
      aide: s.imageDePartage ? 'Elle accompagne vos liens partagés.' : 'Choisissez-la ci-dessous : sans elle, un lien partagé n’a pas d’image.' },
    { id: 'assistants', etat: s.assistantsAutorises ? 'fait' : 'a-faire', titre: 'Les assistants IA peuvent vous citer',
      aide: s.assistantsAutorises ? 'ChatGPT, Claude, Perplexity… lisent le site et le citent avec son lien.' : 'Vous les avez refusés : ils ne recommanderont pas votre site.' },
  ];
}
