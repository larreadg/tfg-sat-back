import test from 'node:test';
import assert from 'node:assert/strict';
import { aplicarPlantilla, htmlATextoPlano, validarPlantillaJson } from './webhooks.plantillas.ts';

/**
 * Lo que estos tests protegen: el escape depende del contexto donde cae el valor, y
 * hacerlo mal NO da un error visible. Da un correo con etiquetas rotas o un POST con
 * JSON invalido que el receptor rechaza con un 400 que no dice por que.
 *
 * El caso que lo motiva es real: `observacion` es texto libre que escribe un
 * analista, asi que puede traer comillas, `<`, `&` o saltos de linea.
 */
const VARIABLES = {
  nivel: '3',
  motivo: 'Agua con olor a "cloro" & sabor raro',
  observacion: 'Derivada a <ESSAP>\nurgente',
  ubicacion: 'Barrio San Jorge',
};

test('contexto texto: no escapa nada (el asunto se manda tal cual)', () => {
  assert.equal(aplicarPlantilla('{{motivo}}', VARIABLES, 'texto'), 'Agua con olor a "cloro" & sabor raro');
});

test('contexto html: escapa comillas y ampersand', () => {
  assert.equal(
    aplicarPlantilla('<p>{{motivo}}</p>', VARIABLES, 'html'),
    '<p>Agua con olor a &quot;cloro&quot; &amp; sabor raro</p>',
  );
});

test('contexto html: un valor no puede cerrar ni abrir una etiqueta', () => {
  const html = aplicarPlantilla('<p>{{observacion}}</p>', VARIABLES, 'html');
  assert.equal(html, '<p>Derivada a &lt;ESSAP&gt;\nurgente</p>');
  // La comprobacion que importa: no quedo ningun `<` crudo del valor.
  assert.equal(html.includes('<ESSAP>'), false);
});

test('contexto json: el cuerpo sigue siendo JSON valido con comillas y saltos en los valores', () => {
  const cuerpo = aplicarPlantilla(
    '{"m":"{{motivo}}","o":"{{observacion}}","n":{{nivel}}}',
    VARIABLES,
    'json',
  );
  const parseado = JSON.parse(cuerpo) as { m: string; o: string; n: number };

  assert.equal(parseado.m, 'Agua con olor a "cloro" & sabor raro');
  assert.equal(parseado.o, 'Derivada a <ESSAP>\nurgente');
});

test('contexto json: un placeholder sin comillas alrededor queda como numero', () => {
  // Es lo que permite escribir `"nivel": {{nivel}}` y que el receptor reciba 3 y no "3".
  const cuerpo = aplicarPlantilla('{"n":{{nivel}}}', VARIABLES, 'json');
  assert.equal(typeof (JSON.parse(cuerpo) as { n: unknown }).n, 'number');
});

test('un placeholder que no existe queda a la vista, no se borra', () => {
  // Un hueco vacio o un "undefined" seria mas dificil de diagnosticar.
  assert.equal(aplicarPlantilla('a {{noExiste}} b', VARIABLES, 'texto'), 'a {{noExiste}} b');
});

test('htmlATextoPlano cubre lo que genera el editor del panel', () => {
  assert.equal(
    htmlATextoPlano('<p>Hola <strong>mundo</strong></p><ul><li>uno</li><li>dos</li></ul>'),
    'Hola mundo\n\n• uno\n• dos',
  );
});

test('validarPlantillaJson acepta una plantilla valida y el vacio', () => {
  assert.equal(validarPlantillaJson('{"t":"{{motivo}}"}', VARIABLES), null);
  // Vacio = se manda el payload completo de AGUARD.
  assert.equal(validarPlantillaJson('', VARIABLES), null);
});

test('validarPlantillaJson rechaza JSON mal formado', () => {
  assert.equal(typeof validarPlantillaJson('{"a":1 "b":2}', VARIABLES), 'string');
});

test('validarPlantillaJson no se confunde por una comilla DENTRO de un valor', () => {
  // El falso positivo que hay que evitar: la plantilla esta bien, el valor trae una
  // comilla, y el escape ya se encargo. Si esto fallara, el panel rechazaria
  // plantillas correctas.
  assert.equal(validarPlantillaJson('{"t":"{{motivo}}"}', { motivo: 'dijo "hola"' }), null);
});

test('validarPlantillaJson exige un objeto o arreglo, no un escalar', () => {
  assert.equal(typeof validarPlantillaJson('"solo un string"', VARIABLES), 'string');
  assert.equal(typeof validarPlantillaJson('42', VARIABLES), 'string');
});
