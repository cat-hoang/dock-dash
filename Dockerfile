# ── Stage 1: Build frontend ───────────────────────────────────────────────────
FROM node:20-alpine AS frontend-build
WORKDIR /app

# Copy workspace manifests first for better layer caching
COPY package.json package-lock.json ./
COPY packages/frontend/package.json ./packages/frontend/
COPY packages/backend/package.json  ./packages/backend/

RUN npm ci --workspace=packages/frontend

COPY packages/frontend ./packages/frontend
RUN npm run build -w packages/frontend

# ── Stage 2: Compile backend TypeScript ──────────────────────────────────────
FROM node:20-alpine AS backend-build
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/backend/package.json  ./packages/backend/
COPY packages/frontend/package.json ./packages/frontend/

RUN npm ci --workspace=packages/backend

COPY packages/backend ./packages/backend
RUN npm run build -w packages/backend

# ── Stage 3: Production runtime ───────────────────────────────────────────────
FROM node:20-alpine
WORKDIR /app

# Install production dependencies only
COPY package.json package-lock.json ./
COPY packages/backend/package.json  ./packages/backend/
COPY packages/frontend/package.json ./packages/frontend/
RUN npm ci --workspace=packages/backend --omit=dev

# Compiled backend
COPY --from=backend-build  /app/packages/backend/dist  ./packages/backend/dist

# Built frontend (served as static files by the backend)
COPY --from=frontend-build /app/packages/frontend/dist ./packages/frontend/dist

# Run as non-root user (SEC-002)
RUN addgroup -S appgroup && adduser -S appuser -G appgroup \
    && mkdir -p /app/packages/backend/data \
    && chown -R appuser:appgroup /app/packages/backend/data
USER appuser

ENV NODE_ENV=production
ENV PORT=3001
EXPOSE 3001

CMD ["node", "packages/backend/dist/index.js"]
