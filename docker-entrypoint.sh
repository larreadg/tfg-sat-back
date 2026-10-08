#!/bin/sh
set -e

# Migraciones antes de levantar la API. Con Supabase van por DIRECT_URL (pooler
# en modo sesion, puerto 5432): el pooler en modo transaccion (6543), que es el
# que usa la app, no soporta lo que necesita `migrate deploy`.
if [ "${MIGRAR_AL_INICIAR:-true}" = "true" ]; then
  echo "Aplicando migraciones pendientes..."
  DATABASE_URL="${DIRECT_URL:-$DATABASE_URL}" ./node_modules/.bin/prisma migrate deploy
fi

exec "$@"
