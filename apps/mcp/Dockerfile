# Multi-stage build for MCP Server

# Stage 1: Builder
FROM node:20-alpine AS builder

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

# Copy workspace configuration
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Copy workspace packages
COPY packages/ ./packages/
COPY apps/mcp/ ./apps/mcp/

# Install all dependencies
RUN pnpm install

# Build firecrawl client package
RUN pnpm --filter @firecrawl/client run build

# Build MCP server
RUN pnpm --filter @pulsemcp/mcp-server run build

# Stage 2: Production
FROM node:20-alpine

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

# Install Docker CLI, Compose, and SSH for remote context support
RUN apk add --no-cache docker-cli docker-cli-compose openssh-client

# Create non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001

WORKDIR /app

# Copy workspace configuration
COPY --from=builder /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./

# Copy package manifests
COPY --from=builder /app/packages/firecrawl-client/package.json ./packages/firecrawl-client/
COPY --from=builder /app/apps/mcp/package.json ./apps/mcp/

# Copy built artifacts
COPY --from=builder /app/packages/firecrawl-client/dist ./packages/firecrawl-client/dist
COPY --from=builder /app/apps/mcp/dist ./apps/mcp/dist

# Install production dependencies only (skip scripts to avoid husky)
RUN pnpm install --prod --frozen-lockfile --ignore-scripts

# Create resources directory
RUN mkdir -p /app/resources && chown -R nodejs:nodejs /app/resources

# Install su-exec for non-root user execution
RUN apk add --no-cache su-exec=0.2-r3

# Copy entrypoint script
COPY apps/mcp/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Set working directory
WORKDIR /app/apps/mcp

# Set environment
ENV NODE_ENV=production
ENV PORT=3060

# Expose port
EXPOSE 3060

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3060/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

# Use entrypoint
ENTRYPOINT ["/entrypoint.sh"]
CMD ["node", "dist/index.js"]
