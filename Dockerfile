# ==============================================================================
# Z2G - Zoho to Google Workspace Migration Engine
# Multi-stage production container build for Node.js 22 LTS
# ==============================================================================

FROM node:22-bookworm-slim AS base
WORKDIR /app

# Install native build tools for compiling SQLite C++ bindings
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    build-essential \
    curl \
    tar \
    gzip \
    && rm -rf /var/lib/apt/lists/*

# Copy package descriptors & npmrc
COPY package.json package-lock.json* .npmrc* ./

# Install dependencies (unblocking scripts for native better-sqlite3 compilation)
RUN npm install

# Copy source code and configuration
COPY . .

# Auto-restore migration database snapshot if present
RUN if [ -f z2g-migration-data.tar.gz ] && [ ! -f data/migration.db ]; then \
      tar -xzf z2g-migration-data.tar.gz; \
    fi

# Build Next.js application
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
RUN npm run build

# ==============================================================================
# Production Runner Stage
# ==============================================================================
FROM node:22-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Install curl for container health checks
RUN apt-get update && apt-get install -y curl tar gzip && rm -rf /var/lib/apt/lists/*

# Copy built application and dependencies
COPY --from=base /app /app

# Declare persistent volume for SQLite database & logs
VOLUME ["/app/data"]

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3000/ || exit 1

CMD ["npm", "run", "start"]
