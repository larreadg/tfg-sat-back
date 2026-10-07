import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { PERMISOS } from './permissions.ts';

/**
 * Red de seguridad contra el bug mas silencioso de este proyecto: un permiso
 * declarado en `PERMISOS` que el seed nunca crea. `requirePermiso` devuelve 403
 * aunque el rol "deberia" tenerlo, y no hay ningun error en los logs que lo
 * explique. Antes de este test los dos seeds ya se habian desincronizado
 * (`seed.ts` no sembraba `zona_riesgo`, `configuracion_sistema` ni `webhook`).
 *
 * `createRequire` porque el catalogo es CommonJS: los dos seeds son CJS y lo
 * consumen con `require`.
 */
const require_ = createRequire(import.meta.url);
const { permisosCatalogo, ORGANISMO_PERMISOS } = require_('../../prisma/permisos-catalogo.js') as {
  permisosCatalogo: () => { nombre: string; descripcion: string }[];
  ORGANISMO_PERMISOS: string[];
};

test('todo permiso de PERMISOS existe en el catalogo que siembran los seeds', () => {
  const sembrados = new Set(permisosCatalogo().map((p) => p.nombre));
  const faltantes = Object.entries(PERMISOS)
    .filter(([, nombre]) => !sembrados.has(nombre))
    .map(([clave, nombre]) => `${clave} (${nombre})`);

  assert.deepEqual(
    faltantes,
    [],
    `Permisos usados por requirePermiso que el seed no crea: ${faltantes.join(', ')}. ` +
      'Agregalos a prisma/permisos-catalogo.js (al recurso del cartesiano o a PERMISOS_EXTRA).',
  );
});

test('los permisos del rol ORGANISMO existen en el catalogo', () => {
  const sembrados = new Set(permisosCatalogo().map((p) => p.nombre));
  const inexistentes = ORGANISMO_PERMISOS.filter((nombre) => !sembrados.has(nombre));

  assert.deepEqual(
    inexistentes,
    [],
    `ORGANISMO_PERMISOS nombra permisos que no existen: ${inexistentes.join(', ')}`,
  );
});

test('ORGANISMO puede hacer seguimiento pero no editar la alerta', () => {
  // La distincion es el centro del diseño: el organismo documenta su inspeccion,
  // pero mover la alerta de estado es del ADMIN.
  assert.ok(ORGANISMO_PERMISOS.includes(PERMISOS.ALERTAS_SEGUIMIENTO));
  assert.ok(ORGANISMO_PERMISOS.includes(PERMISOS.ALERTAS_VER));
  assert.ok(!ORGANISMO_PERMISOS.includes(PERMISOS.ALERTAS_EDITAR));
});

test('el catalogo no tiene permisos duplicados', () => {
  const nombres = permisosCatalogo().map((p) => p.nombre);
  assert.equal(new Set(nombres).size, nombres.length);
});
