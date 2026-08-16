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
# Next's standalone trace keeps the pnpm link to this helper package; copy the
# locked package target so the production runner does not depend on a build
# workspace symlink that is absent from the image.
COPY --from=builder /workspace/node_modules/.pnpm/@swc+helpers@0.5.15/node_modules/@swc/helpers ./node_modules/.pnpm/@swc+helpers@0.5.15/node_modules/@swc/helpers
COPY --from=builder /workspace/node_modules/.pnpm/@swc+helpers@0.5.15/node_modules/@swc/helpers ./node_modules/.pnpm/next@16.3.1_@babel+core@7.29.7_supports-color@8.1.1__@playwright+test@1.51.1_@types+nod_e60c423f8bacfe264aab9444d4fa4228/node_modules/@swc/helpers
USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD node -e "fetch('http://localhost:3000/api/health').then(r => { if (!r.ok) process.exit(1) }).catch(() => process.exit(1))"
CMD ["node", "server.js"]
