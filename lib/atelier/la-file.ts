/**
 * LA FILE DES GROS TRAVAUX (Antoine, 27/11 : « combien d'utilisateurs mon app peut accepter ? »). Un build (`tsc` et
 * `vite`) et un navigateur (pré-rendu, captures, parcours) prennent chacun plusieurs centaines de Mo ; ils tournent sur
 * la machine qui sert aussi les sites en ligne. Sans borne, cinq aperçus demandés ensemble pouvaient la mettre à court de
 * mémoire, et tous les sites tombaient avec elle. Ici : au plus `places` travaux à la fois, les suivants attendent leur
 * tour, dans l'ordre d'arrivée. Ce qu'elle remplace : rien ne bornait. PUR (aucune entrée-sortie).
 */
export interface File {
  /** Lance `travail` dès qu'une place se libère ; la place est rendue quoi qu'il arrive. */
  passer<T>(travail: () => Promise<T>): Promise<T>;
  readonly enCours: () => number;
  readonly enAttente: () => number;
}

export function uneFile(places: number): File {
  const n = Math.max(1, Math.floor(Number.isFinite(places) ? places : 1));
  let occupees = 0;
  const attente: (() => void)[] = [];
  const liberer = (): void => {
    const suivant = attente.shift();
    if (suivant) suivant(); else occupees--;
  };
  return {
    async passer<T>(travail: () => Promise<T>): Promise<T> {
      if (occupees < n) occupees++;
      else await new Promise<void>((r) => attente.push(r));
      try { return await travail(); } finally { liberer(); }
    },
    enCours: () => occupees,
    enAttente: () => attente.length,
  };
}

/** Les places du serveur : `VAVI_GROS_TRAVAUX_EN_MEME_TEMPS`, 2 par défaut (une machine de 4 Go). */
export const placesDuServeur = (env: Readonly<Record<string, string | undefined>> = process.env): number => {
  const v = Number(env.VAVI_GROS_TRAVAUX_EN_MEME_TEMPS);
  return Number.isInteger(v) && v >= 1 && v <= 16 ? v : 2;
};

/** La file du serveur, une pour tous les projets et tous les comptes. */
export const LES_GROS_TRAVAUX: File = uneFile(placesDuServeur());

/** Passe par la file du serveur, et dit au journal quand un travail a dû attendre son tour. */
export async function enFile<T>(quoi: string, travail: () => Promise<T>, file: File = LES_GROS_TRAVAUX): Promise<T> {
  const avant = file.enAttente(), t = Date.now();
  return file.passer(() => {
    const attendu = Date.now() - t;
    if (attendu > 1000) console.log(`[file] ${quoi} a attendu ${Math.round(attendu / 1000)} s (${avant} devant lui)`);
    return travail();
  });
}
