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
COPY package*.json ./
RUN npm install
COPY . .
ARG VITE_API_URL=http://localhost:3000
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

FROM nginx:1.27-alpine

COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 80
