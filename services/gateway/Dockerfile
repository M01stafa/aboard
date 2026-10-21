# Build stage: Node 22 on Alpine (multi-arch: amd64 + arm64)
FROM node:22-alpine AS builder

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@12.11.2 --activate

COPY package.json ./
RUN pnpm install

COPY tsconfig.json ./
COPY src/ ./src/

RUN pnpm run build

# Production runner stage
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8787

RUN corepack enable && corepack prepare pnpm@12.11.2 --activate

COPY package.json ./
RUN pnpm install --prod

COPY --from=builder /app/dist ./dist

EXPOSE 8787

USER node

HEALTHCHECK --interval=15s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8787/health || exit 1

CMD ["node", "dist/index.js"]
