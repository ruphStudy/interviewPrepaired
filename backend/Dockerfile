# syntax-agnostic multi-stage build — the previous single-stage Dockerfile
# ran `npm ci --only=production` THEN `npm run build` (which invokes `tsc`),
# but `typescript` is a devDependency not installed by --only=production, so
# that build would actually fail in a clean environment. Fixed below: the
# builder stage installs full (dev+prod) dependencies and compiles; the
# final stage installs prod-only dependencies and copies ONLY the compiled
# dist/ output.

FROM node:18-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:18-alpine

WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist

EXPOSE 5000

# Cheap liveness check only — no DB/dependency call (see GET /health).
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:' + (process.env.PORT || 5000) + '/health', (res) => process.exit(res.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

USER node

CMD ["node", "dist/server.js"]
