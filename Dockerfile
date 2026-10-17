# Multi-stage Docker build for Google Cloud Run
FROM node:20-bookworm-slim AS builder

WORKDIR /app

# Install build essentials for native packages (e.g., sqlite3, pg)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json tsconfig.json ./
RUN npm ci --legacy-peer-deps

COPY . .
RUN npm run build

# -------------------------------------------------------------
# Production Runner Stage
# -------------------------------------------------------------
FROM node:20-bookworm-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --only=production --legacy-peer-deps

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json

COPY data/ ./data/
RUN mkdir -p data/resumes data/agent_profile data/debug

EXPOSE 8080

CMD ["node", "dist/server/index.js"]
