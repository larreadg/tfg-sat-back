# syntax=docker/dockerfile:1

# Node 22: los seeds corren con `--experimental-strip-types` (22.6+).
# Debian slim y no Alpine: `sharp` y los motores de Prisma traen binarios
# precompilados para glibc; con musl hay que compilar o elegir otro target.
ARG NODE_VERSION=22-bookworm-slim

# --- Build -------------------------------------------------------------------
FROM node:${NODE_VERSION} AS build
WORKDIR /app

# OpenSSL: Prisma lo detecta al generar el cliente para elegir su motor.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY prisma ./prisma
COPY src ./src

RUN npx prisma generate \
  && npm run build \
  && npm prune --omit=dev \
  # El prune puede dejar el cliente sin generar: se regenera con el CLI, que
  # ahora es dependencia de produccion (lo usa `migrate deploy` al arrancar).
  && npx prisma generate

# --- Runtime -----------------------------------------------------------------
FROM node:${NODE_VERSION} AS runtime
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production

COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node prisma ./prisma
COPY --chown=node:node package.json ./
COPY --chown=node:node docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

# Las carpetas se crean aca, con dueno `node`, para que los volumenes con
# nombre hereden ese dueno al montarse por primera vez. `uploads/` lo publica
# express.static; `adjuntos-seguimiento/` es PRIVADA y no se publica nunca.
RUN sed -i 's/\r$//' /usr/local/bin/docker-entrypoint.sh \
  && chmod +x /usr/local/bin/docker-entrypoint.sh \
  && mkdir -p uploads adjuntos-seguimiento \
  && chown node:node uploads adjuntos-seguimiento

USER node

EXPOSE 5201

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 5201) + '/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "dist/server.js"]
