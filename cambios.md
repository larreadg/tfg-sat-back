# Cambios en la arquitectura de la API (2026-07-22)

Este documento resume los cambios hechos sobre el diseño de la API a partir de una
revisión de arquitectura REST. **Todos los cambios de rutas son breaking changes**:
el front tiene que actualizar las URLs y, en el caso de `GET /usuarios` y del envío
de reportes, también la forma de leer la respuesta.

## Resumen rápido de URLs (antes → ahora)

| Antes | Ahora | Método |
|---|---|---|
| `/api/usuarios` (ya usaba `/api/users`) | `/api/v1/usuarios` | GET, POST |
| `/api/users/:id` | `/api/v1/usuarios/:id` | GET, PUT, DELETE |
| `/api/auth/captcha` | `/api/v1/auth/captcha` | GET |
| `/api/auth/login` | `/api/v1/auth/login` | POST |
| `/api/auth/2fa/reenviar` | `/api/v1/auth/2fa-codigos` | POST |
| `/api/auth/2fa/verificar` | `/api/v1/auth/2fa-codigos/verificacion` | POST |
| `/api/auth/refresh` | `/api/v1/auth/refresh` | POST |
| `/api/auth/logout` | `/api/v1/auth/logout` | POST |
| `/api/reporte-ciudadano/auth/login` | `/api/v1/auth/ciudadano/login` | POST |
| `/api/reporte-ciudadano/auth/2fa/reenviar` | `/api/v1/auth/ciudadano/2fa-codigos` | POST |
| `/api/reporte-ciudadano/auth/2fa/verificar` | `/api/v1/auth/ciudadano/2fa-codigos/verificacion` | POST |
| `GET /api/reporte-ciudadano` (traía la encuesta) | `GET /api/v1/encuestas/activa` | GET |
| `POST /api/reporte-ciudadano` (crea el reporte) | `POST /api/v1/reportes-ciudadanos` | POST |

Ningún body de request cambió (mismos campos, mismo `multipart/form-data` para las fotos).
Lo que cambió es la URL, y en dos casos el body de la respuesta (ver más abajo).

---

## 1. Versionado de la API

Todo el árbol de rutas ahora cuelga de `/api/v1` en vez de `/api`
(`src/index.ts`). Motivo: sin versión, cualquier cambio incompatible (como los de
este mismo documento) rompe a los clientes sin aviso. A partir de ahora, un cambio
incompatible futuro se publicaría en `/api/v2` en paralelo, sin tocar `/v1`.

**Acción del front:** anteponer `/v1` a la base URL configurada.

## 2. `GET /api/reporte-ciudadano` ya no existe: se separó en dos recursos

El endpoint mezclaba dos recursos distintos bajo el mismo path: el `GET` devolvía
una **encuesta** y el `POST` creaba un **reporte** (respuestas + fotos). Ahora son
dos recursos independientes:

- `GET /api/v1/encuestas/activa` → devuelve la encuesta vigente (mismo shape de
  respuesta que antes: `{ id, nombre, descripcion, preguntas: [...] }`).
- `POST /api/v1/reportes-ciudadanos` → crea el reporte. Mismo body que antes
  (`respuestas`, `encuestaId` opcional, `fotos` como `multipart/form-data`).
  **Cambia la respuesta:** antes devolvía `data: null` con `201`, ahora devuelve el
  reporte creado:
  ```json
  {
    "code": 201,
    "status": "success",
    "data": {
      "encuestaId": 3,
      "validacionSmsId": 42,
      "respuestaIds": [101, 102, 103]
    },
    "message": "Reporte enviado correctamente."
  }
  ```
  No existe una tabla `Reporte` única — un envío genera varias filas `Respuesta`
  (una por pregunta) que comparten `validacionSmsId`. Por eso ese campo identifica
  al envío como conjunto; se devuelve por si el front necesita referenciarlo
  (ej. para logs o soporte). No hay un endpoint `GET /reportes-ciudadanos/:id`
  porque no hay un único recurso que consultar.

**Acción del front:** separar la carga de la encuesta (ahora `GET /encuestas/activa`)
del envío del reporte (`POST /reportes-ciudadanos`), y si usan la respuesta del
POST, ya no esperar `data: null`.

## 3. Auth de ciudadano: dejó de vivir bajo `/reporte-ciudadano`

Antes: `/api/reporte-ciudadano/auth/login` (auth anidado 3 niveles bajo un recurso
que ni siquiera es "auth"). Ahora vive junto al resto de la autenticación:

- `POST /api/v1/auth/ciudadano/login`
- `POST /api/v1/auth/ciudadano/2fa-codigos`
- `POST /api/v1/auth/ciudadano/2fa-codigos/verificacion`

Mismos bodies y mismas respuestas que antes, solo cambia la URL.

## 4. Endpoints de doble factor: de verbos a recursos

`/2fa/reenviar` y `/2fa/verificar` (tanto en auth de admin como de ciudadano) usaban
verbos en la URL. Se modelaron como un recurso `2fa-codigos`:

- Reenviar código = crear un código nuevo → `POST /auth/2fa-codigos` (antes
  `POST /auth/2fa/reenviar`).
- Verificar código → `POST /auth/2fa-codigos/verificacion` (antes
  `POST /auth/2fa/verificar`).

`login`, `refresh` y `logout` se dejaron como estaban (`POST /auth/login`,
`/auth/refresh`, `/auth/logout`): no son operaciones CRUD sobre un recurso, y
"login/logout" como verbos de URL es una excepción aceptada en la industria.

## 5. `GET /api/v1/usuarios` con paginación, orden y filtro

Antes devolvía la tabla completa sin paginar. Ahora acepta query params:

- `page` (default `1`)
- `limit` (default `20`, máximo `100`)
- `sort` (uno de `correoElectronico`, `telefono`, `activo`, `fechaCreacion`,
  `fechaActualizacion`; anteponer `-` para orden descendente, ej. `sort=-fechaCreacion`)
- `activo` (`true` / `false`)

Ejemplo: `GET /api/v1/usuarios?page=2&limit=10&sort=-fechaCreacion&activo=true`

**La respuesta ahora incluye `meta`:**
```json
{
  "code": 200,
  "status": "success",
  "data": [ /* usuarios de esta página */ ],
  "message": "Usuarios obtenidos correctamente.",
  "meta": { "page": 2, "limit": 10, "total": 47, "totalPages": 5 }
}
```
Si no se manda ningún query param, se comporta como antes salvo que ahora trae
como máximo 20 usuarios (antes traía todos). **Si el front lista usuarios sin
paginar, tiene que empezar a leer `meta.totalPages` y pedir las páginas
siguientes, o mandar explícitamente un `limit` más alto.**

## 6. Idioma consistente en nombres de recurso

`/api/users` pasó a `/api/v1/usuarios` para no mezclar inglés y español entre
recursos (`reporte-ciudadano`, `encuestas`, etc. ya estaban en español). Se dejó
`auth` sin traducir porque es un término técnico de uso estándar incluso en APIs
en español, y traducirlo (`/autenticacion`) no aportaba claridad.

## 7. Captcha: excepción documentada, sin cambios

`GET /api/v1/auth/captcha` sigue devolviendo un SVG crudo (`Content-Type: image/svg+xml`)
en vez del envelope JSON `{code, status, data, message}` que usa el resto de la
API. Es intencional: el front lo consume como `<img src="...">`, y envolverlo en
JSON obligaría a hacer un fetch + blob innecesario. Se documenta acá como
excepción explícita del formato estándar de respuesta, no como algo pendiente de
arreglar.

---

## Otros archivos actualizados

- `postman/SAT-Auth.postman_collection.json`: URLs actualizadas a `/api/v1` y a
  los nuevos paths de `2fa-codigos`.

## Reorganización interna (no afecta al front, informativo)

Para poder separar `encuestas` de `reportes-ciudadanos` como recursos distintos,
se movió el código correspondiente:
- `src/services/encuesta.service.ts` y `src/controllers/encuesta.controller.ts`
  (nuevos): antes vivían dentro de `reporteCiudadano.service.ts` / `.controller.ts`.
- `src/models/encuesta.model.ts` (nuevo): tipos `EncuestaConPreguntasDTO`,
  `PreguntaDTO`, `PreguntaOpcionDTO`, antes en `reporteCiudadano.model.ts`.
