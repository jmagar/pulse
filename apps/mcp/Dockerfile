# Multi-stage build for Pulse Fetch HTTP Server

# Stage 1: Builder
FROM node:20-alpine AS builder

WORKDIR /app

# Copy root package files (includes workspace configuration)
COPY package*.json ./

# Copy workspace packages
COPY shared/ ./shared/
COPY remote/ ./remote/

# Install all dependencies via root workspace
RUN npm ci

# Build shared
WORKDIR /app/shared
RUN npm run build

# Build remote
WORKDIR /app/remote
RUN npm run build

# Stage 2: Production
FROM node:20-alpine

# Create non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001

WORKDIR /app

# Copy root package files (workspace configuration)
COPY --from=builder /app/package*.json ./

# Copy workspace package files
COPY --from=builder /app/shared/package*.json ./shared/
COPY --from=builder /app/remote/package*.json ./remote/

# Copy built files
COPY --from=builder /app/remote/dist ./remote/dist
# Copy shared dist into remote/dist/remote/shared to match compiled import paths
COPY --from=builder /app/shared/dist ./remote/dist/remote/shared

# Install production dependencies
RUN npm ci --omit=dev --ignore-scripts

# Create resources directory with proper ownership
RUN mkdir -p /app/resources && \
    chown -R nodejs:nodejs /app/resources

# Move to remote directory for runtime
WORKDIR /app/remote

# Switch to non-root user
USER nodejs

# Set environment
ENV NODE_ENV=production
ENV PORT=3060

# Expose port
EXPOSE 3060

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:' + (process.env.PORT || 3060) + '/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

# Start server
CMD ["node", "/app/remote/dist/remote/index.js"]
