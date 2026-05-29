# ── Stage 1: build ───────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
# Install ALL deps (devDeps needed for tsc)
RUN npm ci

COPY . .

# Generate Prisma client
RUN npx prisma generate

# Build TypeScript
RUN npm run build

# ── Stage 2: runtime ─────────────────────────────────────────────────────────
FROM node:20-alpine
WORKDIR /app

# Install bash and dos2unix to ensure the entrypoint script runs correctly on Alpine
RUN apk add --no-cache bash dos2unix

COPY package*.json ./
RUN npm ci --omit=dev

# Copy generated Prisma Client from builder stage
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

# Copy compiled output from builder
COPY --from=builder /app/dist ./dist

# Copy prisma schema and migrations (needed for runtime migration)
COPY --from=builder /app/prisma ./prisma

# Copy entrypoint script and ensure it is executable and has LF line endings
COPY --from=builder /app/scripts ./scripts
RUN dos2unix ./scripts/docker-entrypoint.sh && chmod +x ./scripts/docker-entrypoint.sh

EXPOSE 5002

ENTRYPOINT ["/bin/sh", "-c", "bash ./scripts/docker-entrypoint.sh"]
