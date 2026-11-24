// Repris de constructor-v13@5bb786e : app/api/geocode/[projectId]/route.ts (Nominatim, fuseau par tz-lookup, file et cache)
/**
 * LES LIEUX — une adresse saisie, ses lieux : coordonnées et fuseau. Nominatim (OpenStreetMap, sans clé) ; le fuseau est
 * une propriété du lieu au même titre que ses coordonnées (sans lui, une heure saisie se lit dans le fuseau du serveur),
 * déduit par `tz-lookup`. Nominatim tolère une requête par seconde et par application, et l'adresse qui appelle est celle
 * de la plateforme : une file à un passage par seconde et un cache, ici, quel que soit l'appelant. La borne est par
 * instance ; le cache porte l'essentiel, et le plafond de la porte (en base) borne chaque app.
 */
import tzlookup from 'tz-lookup';
import { cacheDuService, fileDuService } from './debit-de-service-public';

export type Issue<T> = { readonly lu: true; readonly valeur: T } | { readonly lu: false; readonly pourquoi: string; readonly sature?: true };
export interface Lieu { readonly label: string; readonly latitude: number; readonly longitude: number; readonly timezone: string }

export const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const QUESTION_AU_PLUS = 200;
const RESULTATS_AU_PLUS = 5;

/** La demande relue. PUR. */
export function laQuestion(corps: Record<string, unknown>): Issue<{ readonly question: string; readonly limite: number; readonly langue: string }> {
  const question = typeof corps.query === 'string' ? corps.query.trim() : '';
  if (!question) return { lu: false, pourquoi: 'une adresse ou un lieu (`query`)' };
  if (question.length > QUESTION_AU_PLUS) return { lu: false, pourquoi: `une adresse de ${QUESTION_AU_PLUS} caractères au plus` };
  const limite = Math.min(RESULTATS_AU_PLUS, Math.max(1, Math.trunc(Number(corps.limit)) || RESULTATS_AU_PLUS));
  const langue = typeof corps.lang === 'string' && /^[a-z]{2}$/.test(corps.lang) ? corps.lang : 'fr';
  return { lu: true, valeur: { question, limite, langue } };
}

/** Ce que Nominatim rend, à la forme de l'app : chaque lieu avec son fuseau. PUR. */
export function lesLieux(brut: unknown): Lieu[] {
  return (Array.isArray(brut) ? brut : []).flatMap((x): Lieu[] => {
    const r = (x ?? {}) as Record<string, unknown>;
    const latitude = Number(r.lat), longitude = Number(r.lon);
    const label = typeof r.display_name === 'string' ? r.display_name : '';
    if (!label || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return [];
    return [{ label, latitude, longitude, timezone: tzlookup(latitude, longitude) }];
  });
}

const trouves = () => cacheDuService<Lieu[]>('nominatim', 24 * 3_600_000, 1_000);
/** Une absence se garde moins longtemps : elle peut n'être que la moitié d'un mot en cours de frappe. */
const absents = () => cacheDuService<Lieu[]>('nominatim-absences', 10 * 60_000, 1_000);

export async function chercherUnLieu(q: { readonly question: string; readonly limite: number; readonly langue: string }, appeler: typeof fetch = fetch): Promise<Issue<Lieu[]>> {
  const cle = `${q.langue}|${q.limite}|${q.question.toLowerCase()}`;
  const deja = trouves().lire(cle) ?? absents().lire(cle);
  if (deja) return { lu: true, valeur: deja };
  const url = `${NOMINATIM}?format=jsonv2&q=${encodeURIComponent(q.question)}&limit=${q.limite}&accept-language=${q.langue}`;
  try {
    const res = await fileDuService('nominatim', { intervalleMs: 1_000, attenteMaxMs: 4_000 })
      .passer(() => appeler(url, { headers: { 'User-Agent': 'vavi (geocoding for hosted apps)', Accept: 'application/json' }, signal: AbortSignal.timeout(8_000) }));
    if (!res.ok) return { lu: false, pourquoi: `le service des lieux ne répond pas (${res.status})` };
    const lieux = lesLieux(await res.json());
    (lieux.length ? trouves() : absents()).ecrire(cle, lieux);
    return { lu: true, valeur: lieux };
  } catch (e) {
    const sature = (e as Error)?.name === 'ServiceSature';
    return { lu: false, pourquoi: sature ? (e as Error).message : `le service des lieux ne répond pas (${String((e as Error)?.message ?? e).slice(0, 120)})`, ...(sature ? { sature: true as const } : {}) };
  }
}
