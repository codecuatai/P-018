FROM node:22-alpine AS base
WORKDIR /workspace
RUN corepack enable

FROM base AS dependencies
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/web/package.json ./apps/web/package.json
RUN pnpm install --filter p018-frontend-web... --frozen-lockfile

FROM base AS builder
COPY --from=dependencies /workspace/node_modules ./node_modules
COPY --from=dependencies /workspace/apps/web/node_modules ./apps/web/node_modules
COPY apps/web ./apps/web
ARG NEXT_PUBLIC_API_URL=http://localhost:3000
ARG NEXT_PUBLIC_HERO_VIDEO_URL=
ARG NEXT_PUBLIC_HERO_POSTER_URL=
ARG NEXT_PUBLIC_GEOAPIFY_MAP_API_KEY=
ARG NEXT_PUBLIC_GEOAPIFY_MAP_STYLE=osm-bright
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_HERO_VIDEO_URL=$NEXT_PUBLIC_HERO_VIDEO_URL
ENV NEXT_PUBLIC_HERO_POSTER_URL=$NEXT_PUBLIC_HERO_POSTER_URL
ENV NEXT_PUBLIC_GEOAPIFY_MAP_API_KEY=$NEXT_PUBLIC_GEOAPIFY_MAP_API_KEY
ENV NEXT_PUBLIC_GEOAPIFY_MAP_STYLE=$NEXT_PUBLIC_GEOAPIFY_MAP_STYLE
WORKDIR /workspace/apps/web
RUN pnpm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder /workspace/apps/web/.next/standalone ./
COPY --from=builder /workspace/apps/web/.next/static ./.next/static
COPY --from=builder /workspace/apps/web/public ./public
# Copy dependencies so Next standalone and all nested package symlinks resolve cleanly.
COPY --from=builder /workspace/node_modules ./node_modules
USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD node -e "fetch('http://localhost:3000/api/health').then(r => { if (!r.ok) process.exit(1) }).catch(() => process.exit(1))"
CMD ["node", "server.js"]
