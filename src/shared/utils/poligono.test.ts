import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calcularBoundingBox,
  parsearPoligono,
  puntoEnBoundingBox,
  puntoEnPoligono,
  type Vertice,
} from './poligono.ts';

/** Cuadrado de 2x2 centrado en el origen, en sentido antihorario. */
const CUADRADO: Vertice[] = [
  { lat: -1, lng: -1 },
  { lat: -1, lng: 1 },
  { lat: 1, lng: 1 },
  { lat: 1, lng: -1 },
];

test('puntoEnPoligono: adentro y afuera de un cuadrado', () => {
  assert.equal(puntoEnPoligono(0, 0, CUADRADO), true);
  assert.equal(puntoEnPoligono(0.9, 0.9, CUADRADO), true);
  assert.equal(puntoEnPoligono(2, 0, CUADRADO), false);
  assert.equal(puntoEnPoligono(0, -5, CUADRADO), false);
});

test('puntoEnPoligono: el sentido del dibujo no importa', () => {
  const horario = [...CUADRADO].reverse();
  assert.equal(puntoEnPoligono(0, 0, horario), true);
  assert.equal(puntoEnPoligono(3, 3, horario), false);
});

test('puntoEnPoligono: poligono concavo (una L)', () => {
  // Una L: el cuadrante superior derecho esta recortado.
  const ele: Vertice[] = [
    { lat: 0, lng: 0 },
    { lat: 0, lng: 4 },
    { lat: 2, lng: 4 },
    { lat: 2, lng: 2 },
    { lat: 4, lng: 2 },
    { lat: 4, lng: 0 },
  ];
  assert.equal(puntoEnPoligono(1, 1, ele), true); // tronco
  assert.equal(puntoEnPoligono(1, 3, ele), true); // brazo
  assert.equal(puntoEnPoligono(3, 3, ele), false); // el hueco de la L
});

test('puntoEnPoligono: menos de tres vertices no encierra nada', () => {
  assert.equal(puntoEnPoligono(0, 0, []), false);
  assert.equal(puntoEnPoligono(0, 0, [{ lat: 0, lng: 0 }]), false);
  assert.equal(
    puntoEnPoligono(0, 0, [
      { lat: -1, lng: 0 },
      { lat: 1, lng: 0 },
    ]),
    false,
  );
});

test('puntoEnPoligono: un vertice sobre la horizontal no se cuenta dos veces', () => {
  // El rayo pasa justo por el vertice de arriba del triangulo.
  const triangulo: Vertice[] = [
    { lat: 0, lng: 0 },
    { lat: 0, lng: 2 },
    { lat: 1, lng: 1 },
  ];
  assert.equal(puntoEnPoligono(1, 0, triangulo), false); // a la izquierda del pico
  assert.equal(puntoEnPoligono(0.5, 1, triangulo), true); // adentro
});

test('calcularBoundingBox: envuelve a todos los vertices', () => {
  const bbox = calcularBoundingBox(CUADRADO);
  assert.deepEqual(bbox, { bboxMinLat: -1, bboxMaxLat: 1, bboxMinLng: -1, bboxMaxLng: 1 });
});

test('puntoEnBoundingBox: descarta lo que esta claramente lejos', () => {
  const bbox = calcularBoundingBox(CUADRADO);
  assert.equal(puntoEnBoundingBox(0, 0, bbox), true);
  assert.equal(puntoEnBoundingBox(1, 1, bbox), true); // el borde cuenta
  assert.equal(puntoEnBoundingBox(5, 0, bbox), false);
});

test('bbox y poligono: el bbox puede decir que si y el poligono que no', () => {
  // Un triangulo: la esquina superior izquierda del bbox queda afuera.
  const triangulo: Vertice[] = [
    { lat: 0, lng: 0 },
    { lat: 0, lng: 4 },
    { lat: 4, lng: 4 },
  ];
  const bbox = calcularBoundingBox(triangulo);
  assert.equal(puntoEnBoundingBox(3.5, 0.5, bbox), true);
  assert.equal(puntoEnPoligono(3.5, 0.5, triangulo), false);
});

test('parsearPoligono: acepta la forma esperada y rechaza cualquier otra', () => {
  assert.deepEqual(parsearPoligono([{ lat: 1, lng: 2 }]), [{ lat: 1, lng: 2 }]);
  assert.deepEqual(parsearPoligono(null), []);
  assert.deepEqual(parsearPoligono('[]'), []);
  assert.deepEqual(parsearPoligono([{ lat: 1 }]), []);
  assert.deepEqual(parsearPoligono([{ lat: '1', lng: 2 }]), []);
  assert.deepEqual(parsearPoligono([{ lat: Number.NaN, lng: 2 }]), []);
});
