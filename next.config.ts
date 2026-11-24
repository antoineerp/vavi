import type { NextConfig } from 'next';
import { lesEntetes } from './lib/les-entetes';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  // Les en-têtes de sécurité (lib/les-entetes.ts) : la console jamais encadrée, les apps servies si.
  headers: async () => lesEntetes(),
};

export default nextConfig;
