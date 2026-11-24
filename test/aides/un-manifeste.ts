/** Un app.json valide pour les essais : la direction et la langue fixées, le reste donné. */
import { lireLeManifeste, type Manifeste } from '@/lib/backend/app/manifeste';

export const DIRECTION = { couleurs: { fond: '#ffffff', texte: '#111111', accent: '#1f6f5c', surface: '#f5f5f5', bordure: '#e5e5e5' },
  polices: { titres: 'Inter', texte: 'Inter' }, rayon: 'doux' } as const;

export function unManifeste(x: Record<string, unknown>): Manifeste {
  const r = lireLeManifeste({ version: 1, nom: 'Essai', description: 'Un essai.', langues: { principale: 'fr' }, direction: DIRECTION, ...x });
  if (!r.ok) throw new Error(r.erreurs.join(' ; '));
  return r.manifeste;
}
