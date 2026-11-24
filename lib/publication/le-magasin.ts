/**
 * Le magasin d'objets où vivent les builds : une interface de trois gestes, et son adaptateur S3 (Tigris aujourd'hui,
 * le stockage objet d'OVH demain : les deux parlent S3). La publication ne connaît que l'interface ; les essais la
 * tiennent en mémoire.
 */
import 'server-only';
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

export interface Objet { readonly octets: Buffer; readonly type: string; readonly meta: Readonly<Record<string, string>> }
export interface TeteDObjet { readonly taille: number; readonly meta: Readonly<Record<string, string>> }

export interface Magasin {
  poser(cle: string, octets: Buffer, o: { readonly type: string; readonly cache: string; readonly meta?: Readonly<Record<string, string>> }): Promise<void>;
  /** `'absent'` : la clé n'existe pas ; une exception : le magasin n'a pas répondu (jamais confondu avec absent). */
  tete(cle: string): Promise<TeteDObjet | 'absent'>;
  lire(cle: string): Promise<Objet | 'absent'>;
}

const VARIABLES = ['S3_ENDPOINT', 'S3_ACCESS_KEY', 'S3_SECRET_KEY', 'S3_BUCKET'] as const;

export type LectureDuMagasin = { readonly lu: true; readonly magasin: Magasin } | { readonly lu: false; readonly manque: readonly string[] };

const estAbsent = (e: unknown): boolean => {
  const x = e as { name?: string; $metadata?: { httpStatusCode?: number } };
  return x?.name === 'NotFound' || x?.name === 'NoSuchKey' || x?.$metadata?.httpStatusCode === 404;
};

/** Le magasin S3 lu de l'environnement ; ce qui manque est nommé. */
export function magasinS3(env: Readonly<Record<string, string | undefined>> = process.env): LectureDuMagasin {
  const manque = VARIABLES.filter((v) => !env[v]);
  if (manque.length) return { lu: false, manque };
  const client = new S3Client({ endpoint: env.S3_ENDPOINT, region: env.S3_REGION || 'auto', forcePathStyle: true,
    credentials: { accessKeyId: env.S3_ACCESS_KEY!, secretAccessKey: env.S3_SECRET_KEY! } });
  const Bucket = env.S3_BUCKET!;
  return { lu: true, magasin: {
    async poser(cle, octets, o) {
      await client.send(new PutObjectCommand({ Bucket, Key: cle, Body: octets, ContentType: o.type, CacheControl: o.cache, Metadata: o.meta ? { ...o.meta } : undefined }));
    },
    async tete(cle) {
      try {
        const t = await client.send(new HeadObjectCommand({ Bucket, Key: cle }));
        return { taille: t.ContentLength ?? 0, meta: t.Metadata ?? {} };
      } catch (e) { if (estAbsent(e)) return 'absent'; throw e; }
    },
    async lire(cle) {
      try {
        const r = await client.send(new GetObjectCommand({ Bucket, Key: cle }));
        return { octets: Buffer.from(await r.Body!.transformToByteArray()), type: r.ContentType ?? 'application/octet-stream', meta: r.Metadata ?? {} };
      } catch (e) { if (estAbsent(e)) return 'absent'; throw e; }
    },
  } };
}
