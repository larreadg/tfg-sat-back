import test from 'node:test';
import assert from 'node:assert/strict';
import { enmascararTelefono, sanear, saneadoParaJson, LARGO_MAX_JSON } from './auditoria.sanear.ts';

/**
 * El saneador es la barrera entre "guardar evidencia" y "filtrar credenciales".
 * `AuditoriaLog` la puede leer cualquiera con `auditoria.ver`, que es un permiso
 * de LECTURA y por eso se reparte con mas soltura que `usuario.editar`: si un
 * `datosPrevios` arrastra el `hashContrasena` de un usuario, la bitacora se
 * convierte en un volcado de hashes con otro nombre.
 */

test('tapa los campos sensibles y deja pasar el resto', () => {
  const saneado = sanear({
    correoElectronico: 'ana@aguard.gov.py',
    hashContrasena: 'scrypt:abc:def',
    contrasena: 'Clave123*',
    activo: true,
  }) as Record<string, unknown>;

  assert.equal(saneado['correoElectronico'], 'ana@aguard.gov.py');
  assert.equal(saneado['activo'], true);
  assert.equal(saneado['hashContrasena'], '[oculto]');
  assert.equal(saneado['contrasena'], '[oculto]');
});

test('tapa los campos sensibles anidados y dentro de arrays', () => {
  const saneado = sanear({
    regla: {
      nombre: 'Aviso nivel 3',
      secretoFirma: 'hmac-super-secreto',
      cabeceras: [{ nombre: 'Authorization', valor: 'Bearer abc123' }],
    },
  }) as {
    regla: { nombre: string; secretoFirma: string; cabeceras: { nombre: string; valor: string }[] };
  };

  assert.equal(saneado.regla.nombre, 'Aviso nivel 3');
  assert.equal(saneado.regla.secretoFirma, '[oculto]');
  // El NOMBRE de la cabecera se conserva (sirve para auditar), el valor no.
  assert.equal(saneado.regla.cabeceras[0].nombre, 'Authorization');
  assert.equal(saneado.regla.cabeceras[0].valor, '[oculto]');
});

test('no tapa codigoPublico, que es el identificador que ve el ciudadano', () => {
  // La lista es por nombre EXACTO y no por subcadena justamente por este caso: si
  // "codigo" tapara todo lo que lo contiene, la bitacora no podria nombrar un
  // reporte y seria inutil para rastrear el reclamo de una persona.
  const saneado = sanear({ codigo: '1234', codigoPublico: 'AGD-7K2M' }) as Record<string, unknown>;

  assert.equal(saneado['codigo'], '[oculto]');
  assert.equal(saneado['codigoPublico'], 'AGD-7K2M');
});

test('tapa cualquier campo que termine en Contrasena o secreto', () => {
  const saneado = sanear({ smtpContrasena: 'x', miSecreto: 'y', nombre: 'z' }) as Record<string, unknown>;

  assert.equal(saneado['smtpContrasena'], '[oculto]');
  assert.equal(saneado['miSecreto'], '[oculto]');
  assert.equal(saneado['nombre'], 'z');
});

test('serializa lo que JSON.stringify no sabe manejar', () => {
  // `BigInt` (telegramChatId) hace tirar TypeError a JSON.stringify y `Decimal`
  // (criticidad) sale como un objeto ilegible. Sin esta conversion el INSERT de
  // auditoria falla y, como el registro nunca propaga errores, la entrada se
  // perderia en silencio.
  const decimalFalso = { toFixed: () => '2.75', toString: () => '2.75' };
  const saneado = sanear({
    chatId: 123456789012345n,
    criticidad: decimalFalso,
    fecha: new Date('2026-10-01T12:00:00.000Z'),
  }) as Record<string, unknown>;

  assert.equal(saneado['chatId'], '123456789012345');
  assert.equal(saneado['criticidad'], 2.75);
  assert.equal(saneado['fecha'], '2026-10-01T12:00:00.000Z');
  assert.doesNotThrow(() => JSON.stringify(saneado));
});

test('recorta los arrays largos sin perder la cuenta', () => {
  const saneado = sanear(Array.from({ length: 60 }, (_, indice) => indice)) as unknown[];

  assert.equal(saneado.length, 51);
  assert.equal(saneado[50], '[+10 elementos omitidos]');
});

test('corta la estructura ciclica en vez de recorrerla sin fin', () => {
  // Dos filas de Prisma que se referencian entre si colgarian el registro; el
  // tope de profundidad lo corta.
  const ciclico: Record<string, unknown> = { nombre: 'raiz' };
  ciclico['hijo'] = ciclico;

  assert.doesNotThrow(() => JSON.stringify(sanear(ciclico)));
});

test('un detalle demasiado grande se reemplaza por un aviso, no se pierde la entrada', () => {
  const enorme = { texto: 'x'.repeat(LARGO_MAX_JSON + 100) };

  assert.deepEqual(saneadoParaJson(enorme), {
    omitido: `El detalle supera ${LARGO_MAX_JSON} caracteres y no se guardo.`,
  });
});

test('saneadoParaJson devuelve undefined para que la columna no se escriba', () => {
  assert.equal(saneadoParaJson(undefined), undefined);
  assert.equal(saneadoParaJson(null), undefined);
});

test('enmascararTelefono deja el numero reconocible sin guardarlo entero', () => {
  assert.equal(enmascararTelefono('+595971123456'), '+5959****3456');
  assert.equal(enmascararTelefono('12345'), '***');
  assert.equal(enmascararTelefono(null), null);
});
