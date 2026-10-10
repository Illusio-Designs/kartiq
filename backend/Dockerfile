# Kartriq backend — production image. The repo is an npm-workspaces monorepo, so
# build from the REPOSITORY ROOT:
#   docker build -f backend/Dockerfile -t kartriq-backend .
#   docker run --env-file backend/.env -p 5001:5001 kartriq-backend
#
# Secrets are NEVER baked in: pass them at run time (environment variables or the
# platform's secrets manager). See docs/AWS_PENTEST_AND_AMAZON_SPAPI_REGISTRATION.md.

FROM node:22-alpine AS deps
WORKDIR /app
# npm needs every workspace manifest to validate the lockfile, but only the
# backend's production dependencies are installed.
COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm ci --omit=dev --no-audit --no-fund --workspace @kartriq/backend --include-workspace-root=false \
 && npm cache clean --force

FROM node:22-alpine
ENV NODE_ENV=production \
    PORT=5001
WORKDIR /app/backend
# Run as an unprivileged user.
RUN addgroup -S app && adduser -S app -G app
COPY --from=deps /app/node_modules /app/node_modules
COPY backend/package.json ./
COPY backend/src ./src
USER app
EXPOSE 5001
# /healthz is the liveness endpoint (see src/routes/health.routes.js).
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget -qO- http://127.0.0.1:${PORT}/healthz >/dev/null 2>&1 || exit 1
CMD ["node", "src/index.js"]
