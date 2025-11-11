# Multi-stage build for the Pulse web frontend

# Base image with shared tooling
FROM node:20-alpine AS base

# Install compatibility libraries and pnpm
RUN apk add --no-cache libc6-compat \
  && corepack enable \
  && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

# Dependency installation stage
FROM base AS deps

# Copy workspace manifests
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json ./apps/web/
COPY packages/firecrawl-client/package.json ./packages/firecrawl-client/
COPY apps/mcp/package.json ./apps/mcp/

# Install only the web app dependency graph
RUN pnpm install --filter ./apps/web... --frozen-lockfile

# Builder stage
FROM base AS builder

# Copy dependency tree from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=deps /app/packages/firecrawl-client/node_modules ./packages/firecrawl-client/node_modules
COPY --from=deps /app/apps/mcp/node_modules ./apps/mcp/node_modules
COPY --from=deps /app/package.json ./package.json
COPY --from=deps /app/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=deps /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=deps /app/apps/web/package.json ./apps/web/
COPY --from=deps /app/packages/firecrawl-client/package.json ./packages/firecrawl-client/
COPY --from=deps /app/apps/mcp/package.json ./apps/mcp/

# Copy source code needed for the build
COPY apps/web ./apps/web
COPY packages ./packages
COPY apps/mcp ./apps/mcp

# Build the Next.js application
RUN pnpm --filter ./apps/web... build

# Runner stage
FROM base AS runner

ENV NODE_ENV=production \
    PORT=3000 \
    NEXT_TELEMETRY_DISABLED=1

# Use the non-root node user provided by the base image
USER node

WORKDIR /app

# Copy the standalone build output
COPY --from=builder --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=builder --chown=node:node /app/apps/web/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/apps/web/public ./public

EXPOSE 3000

CMD ["node", "apps/web/server.js"]
