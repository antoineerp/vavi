import { describe, expect, it } from 'vitest';
import { lesReglagesDuMagasin } from '@/lib/publication/les-reglages-du-magasin';

describe('les réglages du magasin des builds', () => {
  it('incident du 24/11 : le stockage Tigris que Fly pose (AWS_*, BUCKET_NAME) suffit', () => {
    const r = lesReglagesDuMagasin({ AWS_ENDPOINT_URL_S3: 'https://fly.storage.tigris.dev', AWS_ACCESS_KEY_ID: 'tid', AWS_SECRET_ACCESS_KEY: 'tsec', BUCKET_NAME: 'vavi', AWS_REGION: 'auto' });
    expect(r).toEqual({ lu: true, reglages: { endpoint: 'https://fly.storage.tigris.dev', cle: 'tid', secret: 'tsec', bucket: 'vavi', region: 'auto' } });
  });
  it('les noms de vavi passent devant', () => {
    const r = lesReglagesDuMagasin({ S3_ENDPOINT: 'https://s3.ovh', S3_ACCESS_KEY: 'k', S3_SECRET_KEY: 's', S3_BUCKET: 'b', BUCKET_NAME: 'autre', S3_REGION: 'gra' });
    expect(r.lu && r.reglages).toEqual({ endpoint: 'https://s3.ovh', cle: 'k', secret: 's', bucket: 'b', region: 'gra' });
  });
  it('ce qui manque est nommé, une valeur vide compte comme absente', () => {
    expect(lesReglagesDuMagasin({ S3_ENDPOINT: 'x', S3_BUCKET: ' ' })).toEqual({ lu: false, manque: ['S3_ACCESS_KEY', 'S3_SECRET_KEY', 'S3_BUCKET'] });
  });
});
