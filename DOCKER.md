# Despliegue del backend con Docker + Supabase

El contenedor corre solo la API. La base de datos está en Supabase y el HTTPS lo pone un proxy inverso (nginx, Caddy…) delante del contenedor.

## 1. Preparar Supabase (una sola vez)

1. **Cadenas de conexión**: en *Connect > ORMs > Prisma* copiar las dos del pooler y cargarlas en el `.env` del servidor:
   - `DATABASE_URL`: modo transacción, puerto **6543**, con `?pgbouncer=true&connection_limit=5`. Es la que usa la app.
   - `DIRECT_URL`: modo sesión, puerto **5432**. La usa solo `prisma migrate deploy`.

   No usar la conexión directa (`db.<ref>.supabase.co`): es solo IPv6 y la red por defecto de Docker no lo tiene.

2. **Zona horaria**: Supabase arranca en UTC. La tendencia diaria de *Análisis* agrupa por día según la zona de la sesión de Postgres (`analisis.service.ts`), así que sin esto los días se cortan a las 21:00 de Paraguay. En el *SQL Editor*:

   ```sql
   ALTER DATABASE postgres SET timezone TO 'America/Asuncion';
   ```

## 2. Configurar el servidor

```sh
cp .env.example .env   # completar con los valores de producción
```

Además de las cadenas de Supabase, revisar en `.env`:

- `CORS_ORIGIN`: la URL pública del front.
- Secretos JWT, `OPENAI_API_KEY`, `TURNSTILE_SECRET` (el real, no el de prueba) y `CONFIG_ENCRYPTION_KEY`.
- `WEBHOOKS_PERMITIR_RED_PRIVADA=false`.

`docker-compose.yml` ya fija lo que depende de estar en un contenedor (`USE_HTTPS=false`, `HOST`, `PORT`, carpetas, `TRUST_PROXY`, `TZ`), y esos valores pisan los del `.env`.

## 3. Levantar

```sh
docker compose up -d --build
docker compose logs -f backend
```

Al arrancar, el contenedor aplica las migraciones pendientes y después levanta la API. Tiene `restart: always`: vuelve solo si se cae o si se reinicia el servidor. Si una migración falla, el contenedor no arranca y reintenta en bucle: mirar los logs.

Para actualizar después de un `git pull`: `docker compose up -d --build`.

## 4. Primera carga de datos

Los seeds se corren dentro del contenedor (toman las variables del propio contenedor; no hace falta `--env-file`):

```sh
docker compose exec backend node --experimental-strip-types prisma/seed.ts --contrasena-admin="Clave123*"
docker compose exec backend node --experimental-strip-types prisma/seed-encuesta-agua.ts
docker compose exec backend node --experimental-strip-types prisma/seed-config-criticidad.ts
```

Scripts de mantenimiento (ya compilados en la imagen):

```sh
docker compose exec backend node dist/scripts/backfill-geocoding.js
docker compose exec backend node dist/scripts/recalcular-criticidad.js
```

## 5. Proxy inverso

El puerto se publica solo en `127.0.0.1:5201`: desde afuera se entra por el proxy, con HTTPS. En producción la API vive bajo una subruta, `https://simplifika.lat/api-aguardpy`, y el proxy se la quita antes de pasar el request: el back sigue viendo `/api/v1/...` y `/uploads/...`, así que no hay que configurar nada en la app. Ejemplo con nginx (la barra final de `location` y de `proxy_pass` es la que recorta el prefijo):

```nginx
location /api-aguardpy/ {
    proxy_pass http://127.0.0.1:5201/;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    # Un envío llega a 50 MB: 10 fotos de 5 MB o 5 adjuntos de 10 MB.
    client_max_body_size 55m;
}
```

El front (`environment.ts`) apunta a `https://simplifika.lat/api-aguardpy`.

**Webhook de Telegram**: el contenedor lo registra solo en cada arranque, con la URL de `TELEGRAM_WEBHOOK_URL` (`https://simplifika.lat/api-aguardpy/api/v1/telegram/webhook`). En los logs aparece `Telegram: webhook registrado en …` o `confirmado`. Telegram entrega a una sola URL por bot: si alguien corre `start-https.bat` en local con el mismo token, el bot se va a su túnel hasta el próximo reinicio del contenedor (`docker compose restart backend`).

`TRUST_PROXY=uniquelocal` hace que la API tome la IP real del `X-Forwarded-For` solo cuando la conexión viene de una IP privada (el proxy, vía la red de Docker). Es la IP que usan los límites de intentos y la auditoría. Para exponer el contenedor sin proxy: `BACK_BIND=0.0.0.0`.

## 6. Datos que persisten

| Volumen    | Ruta en el contenedor        | Contenido                                     |
|------------|------------------------------|-----------------------------------------------|
| `uploads`  | `/app/uploads`               | Fotos de los reportes (públicas).             |
| `adjuntos` | `/app/adjuntos-seguimiento`  | Adjuntos internos de las alertas (privados).  |

`docker compose down` los conserva; `docker compose down -v` **los borra**. Incluirlos en el backup del servidor: la base de datos tiene las rutas, pero los archivos están solo acá.
