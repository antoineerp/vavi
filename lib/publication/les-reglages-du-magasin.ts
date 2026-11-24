/**
 * Les réglages du magasin des builds, lus de l'environnement. PUR.
 * Les noms de vavi (`S3_*`) d'abord ; sinon ceux que Fly pose lui-même quand on attache un stockage Tigris
 * (`AWS_ENDPOINT_URL_S3`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `BUCKET_NAME`, `AWS_REGION`) : sans eux, un
 * serveur à qui Fly a donné son stockage se disait « non configuré » (incident du 24/11, premier essai d'Antoine).
 */
export interface ReglagesDuMagasin { readonly endpoint: string; readonly cle: string; readonly secret: string; readonly bucket: string; readonly region: string }

const NOMS = {
  endpoint: ['S3_ENDPOINT', 'AWS_ENDPOINT_URL_S3'],
  cle: ['S3_ACCESS_KEY', 'AWS_ACCESS_KEY_ID'],
  secret: ['S3_SECRET_KEY', 'AWS_SECRET_ACCESS_KEY'],
  bucket: ['S3_BUCKET', 'BUCKET_NAME'],
} as const;

/** PURE — les réglages, ou ce qui manque (nommé par le nom de vavi). */
export function lesReglagesDuMagasin(env: Readonly<Record<string, string | undefined>>):
  { readonly lu: true; readonly reglages: ReglagesDuMagasin } | { readonly lu: false; readonly manque: readonly string[] } {
  const lire = (noms: readonly string[]) => noms.map((n) => env[n]?.trim()).find(Boolean) ?? null;
  const v = { endpoint: lire(NOMS.endpoint), cle: lire(NOMS.cle), secret: lire(NOMS.secret), bucket: lire(NOMS.bucket) };
  const manque = (Object.keys(NOMS) as (keyof typeof NOMS)[]).filter((k) => !v[k]).map((k) => NOMS[k][0]);
  if (manque.length) return { lu: false, manque };
  return { lu: true, reglages: { endpoint: v.endpoint!, cle: v.cle!, secret: v.secret!, bucket: v.bucket!, region: lire(['S3_REGION', 'AWS_REGION']) ?? 'auto' } };
}
