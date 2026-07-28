# CLAUDE.md

## Skills por defecto

- Toda interaccion en este proyecto debe usar por defecto las skills `caveman`
  y `rest-api-design`, sin necesidad de que el usuario las solicite
  explicitamente.

## Reglas de arquitectura

- Para cualquier tarea que implique diseñar, agregar o modificar endpoints de la
  API (rutas, nombres de recurso, métodos HTTP, códigos de estado, versionado,
  formato de request/response), usar la skill `rest-api-design` antes de
  proponer o aplicar cambios.
