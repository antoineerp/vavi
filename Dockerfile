# L'image de vavi : le serveur Next (sortie autonome) et le gabarit des apps,
# et npm pour l'atelier (qui installe et construit chaque app). Les NEXT_PUBLIC_* sont figés au build (Next les inscrit
# dans le code) : ils arrivent en arguments de build, jamais un secret ; les secrets sont posés chez l'hébergeur.
FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_APP_URL
ARG VAVI_VERSION=inconnue
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
RUN pnpm build

FROM node:22-bookworm-slim
WORKDIR /app
# bubblewrap : le bac à sable où tsc et vite construisent chaque app (lib/atelier/le-bac-a-sable.ts).
RUN apt-get update && apt-get install -y --no-install-recommends bubblewrap && rm -rf /var/lib/apt/lists/*
# Chromium par Playwright : le pré-rendu des pages publiques (lib/seo/le-pre-rendu.ts), avec son propre bac à sable, sous
# l'utilisateur node. Hors des dépendances de vavi : chargé à l'exécution par VAVI_PLAYWRIGHT.
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright VAVI_PLAYWRIGHT=/opt/playwright/node_modules/playwright
RUN mkdir -p /opt/playwright && cd /opt/playwright && npm init -y >/dev/null && npm install --no-audit --no-fund playwright@1.49.1 \
  && npx playwright install --with-deps chromium && rm -rf /var/lib/apt/lists/* /root/.npm && chmod -R a+rX /ms-playwright
ARG VAVI_VERSION=inconnue
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 VAVI_VERSION=$VAVI_VERSION VAVI_DEPENDANCES_DES_APPS=/tmp/vavi-dependances-des-apps
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/squelette/gabarit ./squelette/gabarit
USER node
EXPOSE 3000
CMD ["node", "server.js"]
