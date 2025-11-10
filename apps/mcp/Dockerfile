# Multi-stage build for Pulse Fetch MCP Server

# Stage 1: Builder
FROM node:20-alpine AS builder

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy root workspace configuration
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Copy all workspace packages
COPY packages/ ./packages/
COPY apps/mcp/ ./apps/mcp/

# Install all dependencies
RUN pnpm install

# Build packages
RUN pnpm --filter @firecrawl/client run build
RUN pnpm --filter @pulsemcp/pulse-shared run build
RUN pnpm --filter @pulsemcp/pulse-remote run build

# Stage 2: Production
FROM node:20-alpine

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Create non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001

WORKDIR /app

# Copy workspace configuration
COPY --from=builder /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./

# Copy package manifests for dependency installation
COPY --from=builder /app/packages/firecrawl-client/package.json ./packages/firecrawl-client/
COPY --from=builder /app/apps/mcp/shared/package.json ./apps/mcp/shared/
COPY --from=builder /app/apps/mcp/remote/package.json ./apps/mcp/remote/

# Copy built artifacts
COPY --from=builder /app/packages/firecrawl-client/dist ./packages/firecrawl-client/dist
COPY --from=builder /app/apps/mcp/shared/dist ./apps/mcp/shared/dist
COPY --from=builder /app/apps/mcp/remote/dist ./apps/mcp/remote/dist

# Install production dependencies only
RUN pnpm install --prod --ignore-scripts

# Create symlink for remote to access shared package
# The built JS is in dist/remote/, so the symlink must be there too
RUN cd /app/apps/mcp/remote/dist/remote && \
    ln -s ../../../shared/dist shared

# Create resources directory with proper ownership
RUN mkdir -p /app/resources && \
    chown -R nodejs:nodejs /app/resources

# Create entrypoint script to fix volume permissions
RUN echo '#!/bin/sh' > /entrypoint.sh && \
    echo 'chown -R nodejs:nodejs /app/resources 2>/dev/null || true' >> /entrypoint.sh && \
    echo 'exec su-exec nodejs "$@"' >> /entrypoint.sh && \
    chmod +x /entrypoint.sh && \
    apk add --no-cache su-exec

# Don't switch user here - entrypoint will do it
# USER nodejs

# Set working directory to remote
WORKDIR /app/apps/mcp/remote

# Set environment
ENV NODE_ENV=production
ENV PORT=3060

# Expose port
EXPOSE 3060

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:' + (process.env.PORT || 3060) + '/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

# Use entrypoint to fix permissions before starting
ENTRYPOINT ["/entrypoint.sh"]
CMD ["node", "dist/remote/index.js"]
