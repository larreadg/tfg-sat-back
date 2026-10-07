import test from 'node:test';
import assert from 'node:assert/strict';
import { esEstadoTerminal, esTransicionValida } from './alertas.estado.ts';

test('NUEVA solo puede pasar a EN_REVISION', () => {
  assert.equal(esTransicionValida('NUEVA', 'EN_REVISION'), true);
  assert.equal(esTransicionValida('NUEVA', 'DERIVADA'), false);
  assert.equal(esTransicionValida('NUEVA', 'CERRADA'), false);
  assert.equal(esTransicionValida('NUEVA', 'DESCARTADA'), false);
});

test('EN_REVISION puede derivar, cerrar o descartar', () => {
  assert.equal(esTransicionValida('EN_REVISION', 'DERIVADA'), true);
  assert.equal(esTransicionValida('EN_REVISION', 'CERRADA'), true);
  assert.equal(esTransicionValida('EN_REVISION', 'DESCARTADA'), true);
  assert.equal(esTransicionValida('EN_REVISION', 'NUEVA'), false);
});

test('DERIVADA solo puede cerrar', () => {
  assert.equal(esTransicionValida('DERIVADA', 'CERRADA'), true);
  assert.equal(esTransicionValida('DERIVADA', 'DESCARTADA'), false);
  assert.equal(esTransicionValida('DERIVADA', 'EN_REVISION'), false);
});

test('CERRADA y DESCARTADA son terminales', () => {
  assert.equal(esEstadoTerminal('CERRADA'), true);
  assert.equal(esEstadoTerminal('DESCARTADA'), true);
  assert.equal(esTransicionValida('CERRADA', 'EN_REVISION'), false);
  assert.equal(esTransicionValida('DESCARTADA', 'EN_REVISION'), false);
});

test('los estados no terminales no son terminales', () => {
  assert.equal(esEstadoTerminal('NUEVA'), false);
  assert.equal(esEstadoTerminal('EN_REVISION'), false);
  assert.equal(esEstadoTerminal('DERIVADA'), false);
});
