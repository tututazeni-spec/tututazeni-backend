# syntax=docker/dockerfile:1
# ─── Stage 1: build — compila TypeScript (precisa das devDependencies) ───────
FROM node:20-slim AS build
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY prisma ./prisma
# postinstall corre prisma generate (o schema já está presente)
RUN npm ci --no-audit --no-fund

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ─── Stage 2: runtime — só dependências de produção ──────────────────────────
FROM node:20-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY prisma ./prisma
# --ignore-scripts: o `prepare` (husky) é devDependency e rebentaria com exit 127;
# por isso o prisma generate (postinstall) corre explicitamente a seguir.
# bcrypt/better-sqlite3/sqlite3 usam prebuilds linux-x64 glibc (sem toolchain).
RUN npm ci --omit=dev --no-audit --no-fund --ignore-scripts \
  && npx prisma generate

COPY --from=build /app/dist ./dist
COPY ops/deploy/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

RUN chmod +x /usr/local/bin/docker-entrypoint.sh \
  && useradd -r -m -u 1001 innova \
  && chown -R innova:innova /app

USER innova
EXPOSE 4000

HEALTHCHECK --interval=15s --timeout=5s --start-period=45s --retries=5 \
  CMD ["node", "-e", "require('http').get('http://localhost:'+(process.env.PORT||4000)+'/health/ready',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"]

ENTRYPOINT ["docker-entrypoint.sh"]
