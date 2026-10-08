import test from 'node:test';
import assert from 'node:assert/strict';
import { codigoEnLetras, mensajeCodigoVerificacion, usaCodigoEnLetras } from './sms-codigo.ts';

test('codigoEnLetras deletrea cada digito, ceros incluidos', () => {
  assert.equal(codigoEnLetras('1203'), 'uno dos cero tres');
  assert.equal(codigoEnLetras('987654'), 'nueve ocho siete seis cinco cuatro');
  assert.equal(codigoEnLetras('0000'), 'cero cero cero cero');
});

test('usaCodigoEnLetras: solo los numeros que empiezan con 59599', () => {
  assert.equal(usaCodigoEnLetras('595991234567'), true);
  assert.equal(usaCodigoEnLetras('+595 99 1234567'), true);
  assert.equal(usaCodigoEnLetras('595981234567'), false);
  assert.equal(usaCodigoEnLetras('595971234567'), false);
  // 599 en otra posicion no cuenta: es un prefijo, no una subcadena.
  assert.equal(usaCodigoEnLetras('595985995991'), false);
});

test('mensajeCodigoVerificacion: en letras para 59599, en numeros para el resto', () => {
  assert.equal(
    mensajeCodigoVerificacion('595991234567', '123456', 5),
    'Tu pin es uno dos tres cuatro cinco seis. Vence en 5 minutos.',
  );
  assert.equal(
    mensajeCodigoVerificacion('595981234567', '1234', 5),
    'Tu codigo de verificacion es 1234. Vence en 5 minutos.',
  );
  assert.equal(mensajeCodigoVerificacion('595991234567', '1234', 1), 'Tu pin es uno dos tres cuatro. Vence en 1 minuto.');
});
