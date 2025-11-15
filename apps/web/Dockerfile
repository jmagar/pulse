# Multi-stage build for Next.js Web App

# Stage 1: Builder
FROM node:20-alpine AS builder

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

# Copy workspace configuration
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Copy workspace packages
COPY packages/ ./packages/
COPY apps/web/ ./apps/web/

# Install all dependencies
RUN pnpm install

# Build firecrawl client package
RUN pnpm --filter @firecrawl/client run build

# Build Next.js app
RUN pnpm --filter web run build

# Stage 2: Production
FROM node:20-alpine

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

# Create non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001

WORKDIR /app

# Copy workspace configuration
COPY --from=builder /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./

# Copy package manifests
COPY --from=builder /app/packages/firecrawl-client/package.json ./packages/firecrawl-client/
COPY --from=builder /app/apps/web/package.json ./apps/web/

# Copy built artifacts
COPY --from=builder /app/packages/firecrawl-client/dist ./packages/firecrawl-client/dist
COPY --from=builder /app/apps/web/.next ./apps/web/.next
COPY --from=builder /app/apps/web/public ./apps/web/public

# Install production dependencies only (skip scripts to avoid husky)
RUN pnpm install --prod --frozen-lockfile --ignore-scripts

# Change ownership to nodejs user
RUN chown -R nodejs:nodejs /app

USER nodejs

# Set working directory
WORKDIR /app/apps/web

# Set environment
ENV NODE_ENV=production
ENV PORT=3000

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

# Start Next.js
CMD ["pnpm", "start"]
