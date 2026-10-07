import test from 'node:test';
import assert from 'node:assert/strict';
import {
  detectarOoxml,
  esPdf,
  esZip,
  familiaDeclarada,
  formatoImagenCoincide,
  MIME_EXTENSIONES,
} from './alertas.adjuntos.magic.ts';

/** ZIP minimo de juguete: firma + los nombres de entrada en claro. */
function zipFalso(...entradas: string[]): Buffer {
  return Buffer.concat([
    Buffer.from([0x50, 0x4b, 0x03, 0x04]),
    Buffer.from(entradas.join('\u0000'), 'latin1'),
  ]);
}

test('esPdf reconoce la firma %PDF- y nada mas', () => {
  assert.ok(esPdf(Buffer.from('%PDF-1.7\nalgo', 'latin1')));
  assert.ok(!esPdf(Buffer.from('<html><script>alert(1)</script>', 'latin1')));
  assert.ok(!esPdf(Buffer.from('MZ\u0090\u0000', 'latin1')), 'un .exe no es un PDF');
  assert.ok(!esPdf(Buffer.alloc(0)), 'un buffer vacio no es un PDF');
  // La firma tiene que estar en el offset 0, no en cualquier lado.
  assert.ok(!esPdf(Buffer.from('xx%PDF-1.4', 'latin1')));
});

test('esZip reconoce el local file header', () => {
  assert.ok(esZip(zipFalso('[Content_Types].xml')));
  assert.ok(!esZip(Buffer.from('%PDF-1.7', 'latin1')));
  assert.ok(!esZip(Buffer.alloc(2)));
});

test('detectarOoxml distingue docx de xlsx', () => {
  assert.equal(detectarOoxml(zipFalso('[Content_Types].xml', 'word/document.xml')), 'docx');
  assert.equal(detectarOoxml(zipFalso('[Content_Types].xml', 'xl/workbook.xml')), 'xlsx');
});

test('detectarOoxml rechaza lo que no es un paquete OOXML', () => {
  // Un ZIP comun (o un .jar) tiene la firma pero no el manifiesto de OOXML.
  assert.equal(detectarOoxml(zipFalso('fotos/playa.jpg')), null);
  // Con el manifiesto pero sin partes conocidas tampoco alcanza (p.ej. pptx).
  assert.equal(detectarOoxml(zipFalso('[Content_Types].xml', 'ppt/presentation.xml')), null);
  // Y algo que no es ZIP nunca es OOXML.
  assert.equal(detectarOoxml(Buffer.from('%PDF-1.7', 'latin1')), null);
  assert.equal(detectarOoxml(Buffer.alloc(0)), null);
});

test('familiaDeclarada mapea los MIME aceptados y rechaza el resto', () => {
  assert.equal(familiaDeclarada('image/png'), 'imagen');
  assert.equal(familiaDeclarada('application/pdf'), 'pdf');
  assert.equal(
    familiaDeclarada('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),
    'xlsx',
  );
  assert.equal(familiaDeclarada('text/html'), null);
  assert.equal(familiaDeclarada('application/x-msdownload'), null);
  // SVG queda afuera a proposito: es XML ejecutable.
  assert.equal(familiaDeclarada('image/svg+xml'), null);
});

test('formatoImagenCoincide exige que lo declarado sea lo decodificado', () => {
  assert.ok(formatoImagenCoincide('image/jpeg', 'jpeg'));
  assert.ok(formatoImagenCoincide('image/webp', 'webp'));
  // Un PNG declarado que en realidad es un JPEG se rechaza: el desacuerdo
  // declarado/real es la señal de que alguien esta probando algo.
  assert.ok(!formatoImagenCoincide('image/png', 'jpeg'));
  assert.ok(!formatoImagenCoincide('image/png', 'gif'));
  assert.ok(!formatoImagenCoincide('image/png', undefined), 'sharp no pudo decodificar');
});

test('cada MIME aceptado tiene una extension server-side', () => {
  for (const mime of Object.keys(MIME_EXTENSIONES)) {
    assert.ok(familiaDeclarada(mime), `${mime} sin familia`);
    assert.match(MIME_EXTENSIONES[mime]!, /^\.[a-z]+$/);
  }
  assert.equal(Object.keys(MIME_EXTENSIONES).length, 6);
});
