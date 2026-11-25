import type { NextConfig } from 'next';
import { lesEntetes } from './lib/les-entetes';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  // Les en-têtes de sécurité (lib/les-entetes.ts) : la console jamais encadrée, les apps servies si.
  headers: async () => lesEntetes(),
  // Une photo fournie dans « Gérer le contenu » (8 Mo au plus, `lib/images/la-photo-fournie.ts`) passe par un geste du serveur.
  experimental: { serverActions: { bodySizeLimit: '9mb' } },
};

export default nextConfig;
