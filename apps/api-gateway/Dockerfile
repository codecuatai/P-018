FROM node:22-alpine AS builder
WORKDIR /workspace
RUN corepack enable
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api-gateway/package.json ./apps/api-gateway/package.json
RUN pnpm install --filter @x-one/api-gateway --frozen-lockfile
COPY apps/api-gateway ./apps/api-gateway
RUN pnpm --dir apps/api-gateway run build

FROM node:22-alpine
WORKDIR /workspace
ENV NODE_ENV=production
RUN corepack enable
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api-gateway/package.json ./apps/api-gateway/package.json
RUN pnpm install --filter @x-one/api-gateway --prod --frozen-lockfile
COPY --from=builder /workspace/apps/api-gateway/dist ./apps/api-gateway/dist
COPY --from=builder /workspace/apps/api-gateway/migrations ./apps/api-gateway/migrations
WORKDIR /workspace/apps/api-gateway
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD node -e "fetch('http://localhost:3000/health/live').then(r => { if (!r.ok) process.exit(1) }).catch(() => process.exit(1))"
CMD ["node", "dist/main.js"]
