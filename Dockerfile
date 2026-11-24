# L'image de vavi : le serveur Next (sortie autonome), le gabarit des apps et les exemples de design lus sur disque,
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
ARG VAVI_VERSION=inconnue
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 VAVI_VERSION=$VAVI_VERSION VAVI_DEPENDANCES_DES_APPS=/tmp/vavi-dependances-des-apps
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/squelette/gabarit ./squelette/gabarit
COPY --from=build /app/lib/design/exemples ./lib/design/exemples
USER node
EXPOSE 3000
CMD ["node", "server.js"]
