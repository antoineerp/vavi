/**
 * Des photos montées en vidéo, avec leurs légendes, dans le navigateur : rien ne part. Les photos sont réduites, montées
 * (un plan par photo, un lent rapprochement, un fondu entre deux, la légende dans un bandeau) et enregistrées en vidéo
 * sur l'appareil. Le montage dure le temps du film : l'écran montre l'avancement (`enCours`), l'onglet reste ouvert
 * (caché, l'enregistrement se met en pause). Sans son. Un navigateur qui ne sait pas enregistrer une vidéo rend un refus
 * qui le dit ; une photo qu'il ne sait pas ouvrir est écartée et nommée. Servi par `capacites.film`.
 *
 *   const r = await capacites.film.monter({ diapos: retenues.map((p) => ({ image: p.fichier, legende: p.nom })),
 *     format: 'portrait', enCours: (a) => setAvance(a) });
 *   if (r.forme === 'donnee') capacites.film.enregistrer(r.donnee.video, titre);
 */
import type { Resultat } from './resultat';
import { refusDesPhotos } from './refus-des-photos';
import { reduireUneImage, ouvrirUneImage } from './image-reduite';
import { chronologie, aLInstant, cadrer, enLignes } from './chronologie-du-film';

/** Une photo du film : l'image, sa légende (affichée en bandeau), sa durée (sinon `secondesParDiapo`). */
export interface DiapoDuFilm { readonly image: Blob; readonly legende?: string; readonly secondes?: number }
export type FormatDuFilm = 'paysage' | 'portrait' | 'carre';
/** Où en est le montage : la préparation des photos (une à une), puis l'enregistrement (en secondes du film). */
export type AvanceeDuFilm = { readonly etape: 'preparation' | 'enregistrement'; readonly fait: number; readonly total: number };

export const DIAPOS_AU_PLUS = 300;
const DIMENSIONS: Readonly<Record<FormatDuFilm, { l: number; h: number }>> = {
  paysage: { l: 1280, h: 720 }, portrait: { l: 720, h: 1280 }, carre: { l: 1080, h: 1080 },
};
/** Le rapprochement d'un plan, du début à la fin : assez pour que la photo vive, pas assez pour qu'elle bouge. */
const RAPPROCHEMENT = 0.06;
const FONDU = 0.8;
const TYPES = ['video/mp4;codecs=avc1.42E01E', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];

const extensionDe = (type: string): 'mp4' | 'webm' => (type.startsWith('video/mp4') ? 'mp4' : 'webm');

export const film = {
  /** Le format de vidéo que CE navigateur sait enregistrer — `null` : il n'en sait aucun. */
  format(): { type: string; extension: 'mp4' | 'webm' } | null {
    if (typeof MediaRecorder === 'undefined' || typeof HTMLCanvasElement === 'undefined' || !('captureStream' in HTMLCanvasElement.prototype)) return null;
    const type = TYPES.find((t) => MediaRecorder.isTypeSupported(t));
    return type ? { type, extension: extensionDe(type) } : null;
  },

  /** MONTE le film et rend la vidéo — rien n'est envoyé. `signal` : un bouton « Arrêter ». */
  async monter(opts: {
    diapos: readonly DiapoDuFilm[]; format?: FormatDuFilm; secondesParDiapo?: number;
    enCours?: (a: AvanceeDuFilm) => void; signal?: AbortSignal;
  }): Promise<Resultat<{ video: Blob; extension: 'mp4' | 'webm'; secondes: number; ecartees: string[] }>> {
    const format = film.format();
    if (!format) return refusDesPhotos('videoImpossible');
    if (opts.diapos.length === 0) return refusDesPhotos('aucunePhoto');
    if (opts.diapos.length > DIAPOS_AU_PLUS) return refusDesPhotos('tropDePhotos', { n: opts.diapos.length, max: DIAPOS_AU_PLUS });
    const taille = DIMENSIONS[opts.format ?? 'paysage'];
    const arrete = () => refusDesPhotos('montageArrete');

    // 1. LES PHOTOS, RÉDUITES à ce que le film montre (une photo de 12 Mpx n'entre pas cent fois en mémoire).
    const prets: DiapoDuFilm[] = [];
    const ecartees: string[] = [];
    for (const [i, d] of opts.diapos.entries()) {
      if (opts.signal?.aborted) return arrete();
      const r = await reduireUneImage(d.image, Math.ceil(Math.max(taille.l, taille.h) * (1 + RAPPROCHEMENT)), 0.9);
      if (r.forme === 'refus') ecartees.push((d.image as File).name || `#${i + 1}`);
      else prets.push({ ...d, image: r.donnee });
      opts.enCours?.({ etape: 'preparation', fait: i + 1, total: opts.diapos.length });
    }
    if (prets.length === 0) return refusDesPhotos('aucuneOuverte');
    const c = chronologie(prets, { secondesParDiapo: opts.secondesParDiapo ?? 3, fondu: FONDU });

    // 2. L'ENREGISTREMENT, au rythme du film.
    const toile = document.createElement('canvas');
    toile.width = taille.l;
    toile.height = taille.h;
    const ctx = toile.getContext('2d');
    if (!ctx) return refusDesPhotos('dessinImpossible');
    const famille = getComputedStyle(document.body).fontFamily || 'sans-serif';
    const police = Math.round(Math.min(taille.l, taille.h) * 0.045);
    const decodees = new Map<number, ImageBitmap>();
    const enDecodage = new Set<number>();
    const decoder = async (k: number) => {
      const d = prets[k];
      if (!d || decodees.has(k) || enDecodage.has(k)) return;
      enDecodage.add(k);
      const b = await ouvrirUneImage(d.image);
      enDecodage.delete(k);
      if (b) decodees.set(k, b);
    };
    const plan = (k: number, avance: number, opacite: number) => {
      ctx.globalAlpha = opacite;
      const b = decodees.get(k);
      if (b) {
        const r = cadrer({ l: b.width, h: b.height }, taille, 1 + RAPPROCHEMENT * avance);
        ctx.drawImage(b, r.sx, r.sy, r.sl, r.sh, 0, 0, taille.l, taille.h);
      }
      const legende = prets[k]?.legende?.trim();
      if (!legende) return;
      // Le bandeau d'une vidéo : sombre et uni sous un texte clair, lisible sur toute photo (aucun dégradé).
      ctx.font = `600 ${police}px ${famille}`;
      const marge = Math.round(police * 0.8);
      const lignes = enLignes(legende, taille.l - 4 * marge, (s) => ctx.measureText(s).width, 2);
      const interligne = police * 1.3;
      const bande = lignes.length * interligne + 1.5 * marge;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
      ctx.fillRect(0, taille.h - bande, taille.l, bande);
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      lignes.forEach((x, i) => ctx.fillText(x, taille.l / 2, taille.h - bande + 0.75 * marge + i * interligne));
    };
    const dessiner = (t: number) => {
      const e = aLInstant(c, t);
      if (!e) return;
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, taille.l, taille.h);
      plan(e.dessous, e.avanceDessous, 1);
      if (e.dessus !== null) plan(e.dessus, e.avanceDessus, e.opacite);
      ctx.globalAlpha = 1;
      for (const k of [...decodees.keys()]) if (k < e.dessous) { decodees.get(k)?.close(); decodees.delete(k); }
      void decoder(e.dessous + 1).then(() => decoder(e.dessous + 2));
    };

    await decoder(0);
    await decoder(1);
    dessiner(0);
    const flux = toile.captureStream(30);
    const enregistreur = new MediaRecorder(flux, { mimeType: format.type, videoBitsPerSecond: 5_000_000 });
    const morceaux: Blob[] = [];
    enregistreur.ondataavailable = (e) => { if (e.data.size > 0) morceaux.push(e.data); };
    const arreteLEnregistreur = new Promise<void>((ok) => { enregistreur.onstop = () => ok(); });
    let ecoule = 0;
    let dernier = performance.now();
    let enPause = false;
    const quandCache = () => {
      if (document.hidden && enregistreur.state === 'recording') { enregistreur.pause(); enPause = true; }
      else if (!document.hidden && enregistreur.state === 'paused') { dernier = performance.now(); enPause = false; enregistreur.resume(); }
    };
    document.addEventListener('visibilitychange', quandCache);
    enregistreur.start(1000);
    try {
      await new Promise<void>((ok) => {
        const image = () => {
          if (opts.signal?.aborted) return ok();
          const maintenant = performance.now();
          if (!enPause) ecoule += (maintenant - dernier) / 1000;
          dernier = maintenant;
          if (ecoule >= c.duree) return ok();
          dessiner(ecoule);
          opts.enCours?.({ etape: 'enregistrement', fait: Math.min(ecoule, c.duree), total: c.duree });
          requestAnimationFrame(image);
        };
        requestAnimationFrame(image);
      });
    } finally {
      document.removeEventListener('visibilitychange', quandCache);
      if (enregistreur.state !== 'inactive') enregistreur.stop();
      await arreteLEnregistreur;
      flux.getTracks().forEach((t) => t.stop());
      for (const b of decodees.values()) b.close();
    }
    if (opts.signal?.aborted) return arrete();
    const video = new Blob(morceaux, { type: format.type.split(';')[0] });
    if (video.size === 0) return refusDesPhotos('videoVide');
    return { forme: 'donnee', donnee: { video, extension: format.extension, secondes: Math.round(c.duree * 10) / 10, ecartees } };
  },

  /** Enregistre la vidéo sur l'appareil (le dossier des téléchargements). */
  enregistrer(video: Blob, nom: string): void {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(video);
    a.download = `${nom}.${extensionDe(video.type)}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
  },

  /** Ouvre le partage du téléphone (l'enregistrer dans Photos, l'envoyer) ; un navigateur qui ne sait pas : REFUS. */
  async partager(video: Blob, nom: string): Promise<Resultat<{ partage: true }>> {
    const fichier = new File([video], `${nom}.${extensionDe(video.type)}`, { type: video.type });
    if (typeof navigator === 'undefined' || !navigator.canShare?.({ files: [fichier] })) {
      return refusDesPhotos('partageImpossible');
    }
    try {
      await navigator.share({ files: [fichier], title: nom });
      return { forme: 'donnee', donnee: { partage: true } };
    } catch (e) {
      return (e as Error)?.name === 'AbortError'
        ? refusDesPhotos('partageAnnule')
        : refusDesPhotos('partageEchoue', { detail: String((e as Error)?.message || e) });
    }
  },
};
