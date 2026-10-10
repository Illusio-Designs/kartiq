# Kartriq backend — production image.
#   docker build -t kartriq-backend ./backend
#   docker run --env-file backend/.env -p 5001:5001 kartriq-backend
#
# Secrets are NEVER baked in: pass them at run time (environment variables or the
# platform's secrets manager). See docs/AWS_PENTEST_AND_AMAZON_SPAPI_REGISTRATION.md.

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# Production dependencies only; no dev tools or test files ship to production.
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

FROM node:22-alpine
ENV NODE_ENV=production \
    PORT=5001
WORKDIR /app
# Run as an unprivileged user.
RUN addgroup -S app && adduser -S app -G app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
USER app
EXPOSE 5001
# /healthz is the liveness endpoint (see src/routes/health.routes.js).
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget -qO- http://127.0.0.1:${PORT}/healthz >/dev/null 2>&1 || exit 1
CMD ["node", "src/index.js"]
