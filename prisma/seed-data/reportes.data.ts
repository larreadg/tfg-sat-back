/**
 * Dataset declarativo de 30 reportes ciudadanos sinteticos sobre posible
 * contaminacion del agua en el area del Acuifero Patino (Paraguay).
 *
 * IMPORTANTE: son datos de demostracion para desarrollo. No representan
 * denuncias reales ni diagnosticos oficiales de contaminacion o potabilidad.
 *
 * Ubicaciones: localidades reales dentro del Acuifero Patino (fuente:
 * Wikipedia, ver docs/seed-reportes-imagenes.md), algunas usadas mas de una
 * vez con una variacion de coordenada pequena y fija (nunca aleatoria) para
 * simular reportes cercanos entre si dentro del mismo barrio/compania, sin
 * pretender precision de calle exacta.
 *
 * Preguntas y opciones: deben coincidir exactamente con
 * prisma/seed-encuesta-agua.ts (fuente de verdad: preguntas_encuesta.txt).
 *
 * Imagenes: cada `archivo` referenciado aqui debe existir en
 * prisma/seed-data/imagenes.manifest.ts (fuente, licencia, autor) y en
 * docs/seed-reportes-imagenes.md (trazabilidad).
 *
 * Escala de riesgo: 0 a 5, igual que src/services/evaluacionIa.prompt.ts
 * (NO 0-100: ese es el rango real que usa y valida evaluacionIa.service.ts).
 *   - RIESGO_ALTO: 4-5
 *   - RIESGO_MEDIO: 3
 *   - RIESGO_BAJO (con indicio aislado): 1-2
 *   - SIN_INDICIOS: 0
 */

const P1 = '¿Qué tipo de fuente o lugar estás reportando?';
const P2 = '¿Qué color o aspecto tiene el agua?';
const P3 = '¿El agua tiene algún olor distinto al habitual?';
const P4 = '¿Notaste que el sabor del agua sea distinto al habitual?';
const P5 = '¿Alguien tuvo malestar después del contacto o consumo?';
const P6 = '¿Desde cuándo observa el problema?';

function telefonoSeed(indice) {
  return `+595981${(900000 + indice).toString()}`;
}

function codigoValidacionSeed(indice) {
  return `SEED${indice.toString().padStart(2, '0')}`;
}

const REPORTES = [
  {
    n: 1,
    codigo: 'RPT-01',
    ubicacion: { localidad: 'Villeta (zona portuaria/industrial)', municipio: 'Villeta', latitud: -25.51, longitud: -57.56 },
    canal: 'WEB',
    fecha: '2026-05-06T09:20:00-04:00',
    clasificacionEsperada: 'RIESGO_ALTO',
    riesgoScore: 5,
    respuestas: {
      [P1]: 'Otro',
      [P2]: 'Oscura, negra o gris (manganeso o sulfuros)',
      [P3]: 'A combustible o químico',
      [P4]: 'Sí, sabor raro',
      [P5]: 'Sí',
      [P6]: 'Recién lo noté hoy',
    },
    imagenes: [
      { archivo: 'reporte-01-01.webp', descripcion: 'Película aceitosa con colores iridiscentes sobre la superficie de un estanque, compatible con presencia de hidrocarburos.', riesgoFoto: 5 },
      { archivo: 'reporte-01-02.webp', descripcion: 'Lodo aceitoso flotando sobre el agua en una dársena, con manchas oscuras extendidas en la superficie.', riesgoFoto: 4 },
    ],
    evaluacion: {
      resumen: 'Evaluación preliminar: indicios compatibles con posible contaminación por hidrocarburos en zona industrial/portuaria de Villeta; requiere verificación técnica prioritaria.',
      justificacion: 'Se reporta agua de color oscuro, olor a combustible o químico, sabor raro y malestar tras contacto reciente. Las fotografías muestran una película y un lodo de aspecto aceitoso, coherentes con el relato. La combinación de señales de olfato, gusto y salud, sumada a la cercanía declarada de actividad industrial, sostiene un puntaje alto. No constituye diagnóstico oficial ni identifica una fuente contaminante específica.',
      recomendacion: 'Enviar equipo de inspección de forma urgente y priorizar la toma de muestras en el punto reportado.',
    },
  },
  {
    n: 2,
    codigo: 'RPT-02',
    ubicacion: { localidad: 'Villeta (acceso zona industrial)', municipio: 'Villeta', latitud: -25.513, longitud: -57.555 },
    canal: 'WHATSAPP',
    fecha: '2026-05-08T14:10:00-04:00',
    clasificacionEsperada: 'RIESGO_ALTO',
    riesgoScore: 5,
    respuestas: {
      [P1]: 'Tanque o reservorio',
      [P2]: 'Oscura, negra o gris (manganeso o sulfuros)',
      [P3]: 'A combustible o químico',
      [P4]: 'Sí, sabor raro',
      [P5]: 'No sé',
      [P6]: 'Ya me había pasado antes / es recurrente',
    },
    imagenes: [
      { archivo: 'reporte-02-01.webp', descripcion: 'Estanque de agua oscura y aceitosa junto a un depósito de chatarra de automóviles, entorno con posible foco de contaminación industrial.', riesgoFoto: 4 },
      { archivo: 'reporte-02-02.webp', descripcion: 'Descarga de efluente líquido de una planta industrial hacia un curso de agua.', riesgoFoto: 5 },
    ],
    evaluacion: {
      resumen: 'Evaluación preliminar: indicios recurrentes compatibles con posible contaminación química en un tanque comunitario de Villeta; requiere verificación técnica.',
      justificacion: 'El reporte describe un problema recurrente en un tanque de reservorio, con color oscuro, olor a combustible/químico y sabor raro. No se confirma malestar de salud, pero la recurrencia y la cercanía a instalaciones industriales elevan el nivel de atención. Las fotografías, tomadas en el entorno cercano, muestran agua de aspecto oscuro y aceitoso y una descarga industrial hacia un curso de agua. No constituye diagnóstico oficial.',
      recomendacion: 'Programar inspección técnica en las próximas 48 horas y evaluar el estado del tanque comunitario.',
    },
  },
  {
    n: 3,
    codigo: 'RPT-03',
    ubicacion: { localidad: 'Ricardo Brugada (Bañado Sur)', municipio: 'Asunción', latitud: -25.279, longitud: -57.6338 },
    canal: 'WEB',
    fecha: '2026-05-12T08:05:00-04:00',
    clasificacionEsperada: 'RIESGO_ALTO',
    riesgoScore: 5,
    respuestas: {
      [P1]: 'Otro',
      [P2]: 'Oscura, negra o gris (manganeso o sulfuros)',
      [P3]: 'A cloaca o desagüe',
      [P4]: 'No lo probé',
      [P5]: 'Sí',
      [P6]: 'Recién lo noté hoy',
    },
    imagenes: [
      { archivo: 'reporte-03-01.webp', descripcion: 'Basura y desechos acumulados en la orilla de un curso de agua urbano.', riesgoFoto: 4 },
      { archivo: 'reporte-03-02.webp', descripcion: 'Escorrentía de agua residual/cloacal contaminando el entorno cercano.', riesgoFoto: 5 },
    ],
    evaluacion: {
      resumen: 'Evaluación preliminar: indicios compatibles con posible contaminación fecal/cloacal en Bañado Sur, Asunción; requiere verificación técnica prioritaria.',
      justificacion: 'El reporte indica agua oscura con olor a cloaca o desagüe y malestar de salud reportado tras contacto reciente, en una zona baja e inundable. Las fotografías muestran acumulación de residuos en la orilla y una escorrentía de aspecto cloacal, consistentes con el relato. La combinación de olor a desagüe y malestar sostiene un puntaje alto. No constituye diagnóstico oficial.',
      recomendacion: 'Enviar equipo de inspección de forma urgente por posible riesgo sanitario para la población cercana.',
    },
  },
  {
    n: 4,
    codigo: 'RPT-04',
    ubicacion: { localidad: 'Ricardo Brugada (Bañado Sur, sector norte)', municipio: 'Asunción', latitud: -25.2775, longitud: -57.6325 },
    canal: 'WHATSAPP',
    fecha: '2026-05-13T17:40:00-04:00',
    clasificacionEsperada: 'RIESGO_ALTO',
    riesgoScore: 4,
    respuestas: {
      [P1]: 'Pozo',
      [P2]: 'Amarilla o marrón (hierro o sedimento)',
      [P3]: 'A cloaca o desagüe',
      [P4]: 'Sí, sabor raro',
      [P5]: 'No sé',
      [P6]: 'Hace unos días',
    },
    imagenes: [
      { archivo: 'reporte-04-01.webp', descripcion: 'Río de color marrón y aspecto turbio, con signos visibles de contaminación.', riesgoFoto: 4 },
      { archivo: 'reporte-04-02.webp', descripcion: 'Canal de drenaje urbano con acumulación de basura y agua de aspecto sucio.', riesgoFoto: 4 },
    ],
    evaluacion: {
      resumen: 'Evaluación preliminar: indicios compatibles con posible infiltración de agua servida en un pozo de Bañado Sur; requiere verificación técnica.',
      justificacion: 'Se reporta agua amarronada con sedimento, olor a cloaca/desagüe y sabor raro en un pozo próximo a un canal de aspecto contaminado, tal como se observa en las fotografías del entorno. No se confirma malestar de salud, pero la combinación de olor y sabor anómalos, junto a la ubicación en zona baja, sostiene un puntaje alto. No constituye diagnóstico oficial.',
      recomendacion: 'Programar inspección técnica en las próximas 48 horas, con foco en la posible infiltración hacia el pozo.',
    },
  },
  {
    n: 5,
    codigo: 'RPT-05',
    ubicacion: { localidad: 'Sajonia', municipio: 'Asunción', latitud: -25.3, longitud: -57.6667 },
    canal: 'WEB',
    fecha: '2026-05-15T10:30:00-04:00',
    clasificacionEsperada: 'RIESGO_ALTO',
    riesgoScore: 4,
    respuestas: {
      [P1]: 'Canilla / grifo',
      [P2]: 'Oscura, negra o gris (manganeso o sulfuros)',
      [P3]: 'A huevo podrido / azufre',
      [P4]: 'No lo probé',
      [P5]: 'Sí',
      [P6]: 'Hace una semana o más',
    },
    imagenes: [
      { archivo: 'reporte-05-01.webp', descripcion: 'Agua sucia con residuos flotando y coloración oscura visible.', riesgoFoto: 4 },
      { archivo: 'reporte-05-02.webp', descripcion: 'Proa de una embarcación en un puerto con agua visiblemente contaminada, entorno ribereño con actividad industrial.', riesgoFoto: 4 },
    ],
    evaluacion: {
      resumen: 'Evaluación preliminar: indicios compatibles con posible presencia de sulfuros en el suministro por canilla en Sajonia; requiere verificación técnica.',
      justificacion: 'El reporte describe agua oscura con olor a huevo podrido/azufre sostenido durante una semana, con malestar de salud reportado, en una zona ribereña con actividad industrial cercana. La combinación de un olor característico de sulfuro de hidrógeno junto con malestar sostiene un puntaje alto, aunque no se cuenta con datos de sabor. No constituye diagnóstico oficial.',
      recomendacion: 'Programar inspección técnica en las próximas 48 horas y verificar la red de suministro en el sector.',
    },
  },
  {
    n: 6,
    codigo: 'RPT-06',
    ubicacion: { localidad: 'Tacumbú', municipio: 'Asunción', latitud: -25.3048, longitud: -57.6564 },
    canal: 'WHATSAPP',
    fecha: '2026-05-16T19:00:00-04:00',
    clasificacionEsperada: 'RIESGO_ALTO',
    riesgoScore: 5,
    respuestas: {
      [P1]: 'Otro',
      [P2]: 'Oscura, negra o gris (manganeso o sulfuros)',
      [P3]: 'A combustible o químico',
      [P4]: 'No lo probé',
      [P5]: 'No sé',
      [P6]: 'Recién lo noté hoy',
    },
    imagenes: [
      { archivo: 'reporte-06-01.webp', descripcion: 'Embarcaciones pesqueras flotando sobre una mancha de hidrocarburo en el agua.', riesgoFoto: 5 },
      { archivo: 'reporte-06-02.webp', descripcion: 'Recipiente semihundido en agua estancada de aspecto deteriorado, cerca de la orilla.', riesgoFoto: 3 },
    ],
    evaluacion: {
      resumen: 'Evaluación preliminar: indicios compatibles con posible contaminación química en curso de agua de Tacumbú; requiere verificación técnica prioritaria.',
      justificacion: 'Se reporta agua oscura con olor a combustible/químico, observada recién ese mismo día, junto a una posible mancha de hidrocarburo y residuos visibles en las fotografías del entorno. Aunque no hay datos de sabor ni malestar confirmados, la señal de olor químico junto con la evidencia visual sostiene un puntaje alto. No constituye diagnóstico oficial.',
      recomendacion: 'Enviar equipo de inspección de forma urgente para descartar un vertido reciente.',
    },
  },
  {
    n: 7,
    codigo: 'RPT-07',
    ubicacion: { localidad: 'San Lorenzo (centro)', municipio: 'San Lorenzo', latitud: -25.34, longitud: -57.52 },
    canal: 'WEB',
    fecha: '2026-05-20T11:15:00-04:00',
    clasificacionEsperada: 'RIESGO_ALTO',
    riesgoScore: 4,
    respuestas: {
      [P1]: 'Canilla / grifo',
      [P2]: 'Amarilla o marrón (hierro o sedimento)',
      [P3]: 'A huevo podrido / azufre',
      [P4]: 'Sí, sabor raro',
      [P5]: 'Sí',
      [P6]: 'Hace una semana o más',
    },
    imagenes: [
      { archivo: 'reporte-07-01.webp', descripcion: 'Curso de agua con color marrón cargado de sedimento en suspensión.', riesgoFoto: 4 },
      { archivo: 'reporte-07-02.webp', descripcion: 'Orilla de un río completamente turbio y de color marrón.', riesgoFoto: 3 },
    ],
    evaluacion: {
      resumen: 'Evaluación preliminar: indicios compatibles con posible contaminación del suministro por canilla en San Lorenzo; requiere verificación técnica.',
      justificacion: 'El reporte combina color amarronado con sedimento, olor a azufre, sabor raro y malestar de salud sostenidos durante más de una semana. La concurrencia de varias señales sensoriales junto con malestar reportado sostiene un puntaje alto. No constituye diagnóstico oficial.',
      recomendacion: 'Programar inspección técnica en las próximas 48 horas sobre la red de distribución del sector.',
    },
  },
  {
    n: 8,
    codigo: 'RPT-08',
    ubicacion: { localidad: 'Ricardo Brugada (Bañado Sur, sector sur)', municipio: 'Asunción', latitud: -25.2805, longitud: -57.635 },
    canal: 'WHATSAPP',
    fecha: '2026-05-27T09:50:00-04:00',
    clasificacionEsperada: 'RIESGO_MEDIO',
    riesgoScore: 3,
    respuestas: {
      [P1]: 'Otro',
      [P2]: 'Amarilla o marrón (hierro o sedimento)',
      [P3]: 'A tierra o moho',
      [P4]: 'No, igual que siempre',
      [P5]: 'No',
      [P6]: 'Ya me había pasado antes / es recurrente',
    },
    imagenes: [
      { archivo: 'reporte-08-01.webp', descripcion: 'Residuos plásticos obstruyendo un pequeño curso de agua.', riesgoFoto: 3 },
      { archivo: 'reporte-08-02.webp', descripcion: 'Agua estancada de entorno residencial, con signos de deterioro.', riesgoFoto: 2 },
    ],
    evaluacion: {
      resumen: 'Evaluación preliminar: indicios moderados y recurrentes en un canal de Bañado Sur; se sugiere verificación técnica no urgente.',
      justificacion: 'Se reporta un problema recurrente de color amarronado y olor a tierra/moho, sin cambios en el sabor ni malestar de salud. La recurrencia y la combinación de dos señales leves, junto con residuos y estancamiento visibles en el entorno, sostienen un puntaje moderado, sin elementos que indiquen severidad. No constituye diagnóstico oficial.',
      recomendacion: 'Monitorear en el corto plazo y programar una verificación técnica de rutina.',
    },
  },
  {
    n: 9,
    codigo: 'RPT-09',
    ubicacion: { localidad: 'San Lorenzo (zona norte)', municipio: 'San Lorenzo', latitud: -25.343, longitud: -57.5175 },
    canal: 'WEB',
    fecha: '2026-05-21T16:20:00-04:00',
    clasificacionEsperada: 'RIESGO_MEDIO',
    riesgoScore: 3,
    respuestas: {
      [P1]: 'Canilla / grifo',
      [P2]: 'Verde (algas)',
      [P3]: 'No, sin olor raro',
      [P4]: 'No lo probé',
      [P5]: 'No sé',
      [P6]: 'Hace unos días',
    },
    imagenes: [
      { archivo: 'reporte-09-01.webp', descripcion: 'Superficie de agua cubierta con una floración de algas y hojarasca.', riesgoFoto: 3 },
      { archivo: 'reporte-09-02.webp', descripcion: 'Pequeño curso de agua cubierto casi en su totalidad por una capa verde de algas.', riesgoFoto: 3 },
    ],
    evaluacion: {
      resumen: 'Evaluación preliminar: indicios moderados compatibles con presencia de algas en el suministro de San Lorenzo; se sugiere verificación técnica.',
      justificacion: 'El color verde reportado es compatible con proliferación de algas, tal como se observa en las fotografías del entorno, sin olor asociado ni malestar confirmado. Al no acompañarse de otras señales de alerta, se mantiene en un nivel moderado en lugar de alto. No constituye diagnóstico oficial.',
      recomendacion: 'Monitorear en el corto plazo y programar verificación técnica de la fuente.',
    },
  },
  {
    n: 10,
    codigo: 'RPT-10',
    ubicacion: { localidad: 'Villa Elisa', municipio: 'Villa Elisa', latitud: -25.5075, longitud: -57.5725 },
    canal: 'WHATSAPP',
    fecha: '2026-06-02T08:40:00-04:00',
    clasificacionEsperada: 'RIESGO_MEDIO',
    riesgoScore: 3,
    respuestas: {
      [P1]: 'Pozo',
      [P2]: 'Verde (algas)',
      [P3]: 'A tierra o moho',
      [P4]: 'Sí, sabor raro',
      [P5]: 'No',
      [P6]: 'Hace una semana o más',
    },
    imagenes: [
      { archivo: 'reporte-10-01.webp', descripcion: 'Estanque rural con una floración de algas de color verde intenso.', riesgoFoto: 3 },
      { archivo: 'reporte-10-02.webp', descripcion: 'Lago con una floración de cianobacterias de tono verde azulado en la superficie.', riesgoFoto: 3 },
    ],
    evaluacion: {
      resumen: 'Evaluación preliminar: indicios moderados compatibles con posible presencia de algas y materia orgánica en un pozo de Villa Elisa; se sugiere verificación técnica.',
      justificacion: 'Se combinan color verde, olor a tierra/moho y sabor raro sostenidos por más de una semana, sin malestar de salud reportado. La concurrencia de tres señales leves-moderadas, junto con la evidencia fotográfica de proliferación algal en el entorno, sostiene un puntaje moderado. No constituye diagnóstico oficial.',
      recomendacion: 'Monitorear en el corto plazo y programar verificación técnica del pozo.',
    },
  },
  {
    n: 11,
    codigo: 'RPT-11',
    ubicacion: { localidad: 'Ñemby', municipio: 'Ñemby', latitud: -25.3935, longitud: -57.5443 },
    canal: 'WEB',
    fecha: '2026-06-03T13:25:00-04:00',
    clasificacionEsperada: 'RIESGO_MEDIO',
    riesgoScore: 3,
    respuestas: {
      [P1]: 'Tanque o reservorio',
      [P2]: 'Amarilla o marrón (hierro o sedimento)',
      [P3]: 'A cloro fuerte',
      [P4]: 'No lo probé',
      [P5]: 'No sé',
      [P6]: 'Ya me había pasado antes / es recurrente',
    },
    imagenes: [
      { archivo: 'reporte-11-01.webp', descripcion: 'Zanja de drenaje cubierta de maleza y agua estancada, cerca del sector reportado.', riesgoFoto: 3 },
      { archivo: 'reporte-11-02.webp', descripcion: 'Canal de drenaje bloqueado por acumulación de residuos, con agua de color oscuro.', riesgoFoto: 2 },
    ],
    evaluacion: {
      resumen: 'Evaluación preliminar: indicios moderados y recurrentes en un tanque de reservorio de Ñemby; se sugiere verificación técnica.',
      justificacion: 'Se reporta sedimento amarronado recurrente junto con olor a cloro fuerte, lo que sugiere posible sobre-cloración combinada con acumulación de sedimento en el tanque. Las fotografías, tomadas en canales cercanos al sector, muestran agua estancada y de aspecto turbio. No se confirma malestar. La recurrencia sostiene un puntaje moderado. No constituye diagnóstico oficial.',
      recomendacion: 'Monitorear en el corto plazo y programar limpieza/verificación técnica del tanque.',
    },
  },
  {
    n: 12,
    codigo: 'RPT-12',
    ubicacion: { localidad: 'San Antonio', municipio: 'San Antonio', latitud: -25.3797, longitud: -57.6097 },
    canal: 'WHATSAPP',
    fecha: '2026-06-05T10:00:00-04:00',
    clasificacionEsperada: 'RIESGO_MEDIO',
    riesgoScore: 3,
    respuestas: {
      [P1]: 'Otro',
      [P2]: 'Blanquecina o lechosa (turbidez o aire)',
      [P3]: 'A tierra o moho',
      [P4]: 'No, igual que siempre',
      [P5]: 'No',
      [P6]: 'Hace unos días',
    },
    imagenes: [
      { archivo: 'reporte-12-01.webp', descripcion: 'Escorrentía superficial en una ladera con agua cargada de sedimento tras saturación del suelo.', riesgoFoto: 2 },
      { archivo: 'reporte-12-02.webp', descripcion: 'Drenaje pluvial bloqueado con residuos sólidos y agua de aspecto turbio.', riesgoFoto: 2 },
    ],
    evaluacion: {
      resumen: 'Evaluación preliminar: indicios moderados por turbidez y olor a tierra/moho en un arroyo de San Antonio; se sugiere verificación técnica.',
      justificacion: 'La turbidez blanquecina por sí sola suele asociarse a aire o sedimento leve, pero al combinarse con olor a tierra/moho sostenido por varios días, y con evidencia fotográfica de escorrentía y drenaje con sedimento en el entorno, se eleva a un nivel moderado. No se reporta malestar. No constituye diagnóstico oficial.',
      recomendacion: 'Monitorear en el corto plazo y programar verificación técnica del arroyo.',
    },
  },
  {
    n: 13,
    codigo: 'RPT-13',
    ubicacion: { localidad: 'Itauguá (centro)', municipio: 'Itauguá', latitud: -25.383, longitud: -57.333 },
    canal: 'WEB',
    fecha: '2026-06-10T09:15:00-04:00',
    clasificacionEsperada: 'RIESGO_MEDIO',
    riesgoScore: 3,
    respuestas: {
      [P1]: 'Pozo',
      [P2]: 'Verde (algas)',
      [P3]: 'A tierra o moho',
      [P4]: 'No lo probé',
      [P5]: 'No sé',
      [P6]: 'Hace una semana o más',
    },
    imagenes: [
      { archivo: 'reporte-13-01.webp', descripcion: 'Espejo de agua con coloración verde por proliferación de algas.', riesgoFoto: 3 },
      { archivo: 'reporte-13-02.webp', descripcion: 'Río con una extensa floración algal que cubre gran parte de la superficie de color verde.', riesgoFoto: 3 },
    ],
    evaluacion: {
      resumen: 'Evaluación preliminar: indicios moderados compatibles con posible escorrentía agrícola hacia un pozo de Itauguá; se sugiere verificación técnica.',
      justificacion: 'El color verde sostenido por más de una semana, en una zona con actividad agrícola cercana declarada, es compatible con aporte de nutrientes o algas, como se observa en las fotografías de referencia del entorno. No hay malestar confirmado. La persistencia del problema sostiene un puntaje moderado. No constituye diagnóstico oficial.',
      recomendacion: 'Monitorear en el corto plazo y programar verificación técnica del pozo y su entorno agrícola.',
    },
  },
  {
    n: 14,
    codigo: 'RPT-14',
    ubicacion: { localidad: 'Itauguá (compañía cercana)', municipio: 'Itauguá', latitud: -25.386, longitud: -57.33 },
    canal: 'WHATSAPP',
    fecha: '2026-06-11T15:45:00-04:00',
    clasificacionEsperada: 'RIESGO_MEDIO',
    riesgoScore: 3,
    respuestas: {
      [P1]: 'Canilla / grifo',
      [P2]: 'Amarilla o marrón (hierro o sedimento)',
      [P3]: 'A cloro fuerte',
      [P4]: 'No, igual que siempre',
      [P5]: 'No',
      [P6]: 'Recién lo noté hoy',
    },
    imagenes: [
      { archivo: 'reporte-14-01.webp', descripcion: 'Sistema de drenaje con agua de coloración anaranjada y aspecto turbio, cerca del sector reportado.', riesgoFoto: 3 },
      { archivo: 'reporte-14-02.webp', descripcion: 'Canal de drenaje urbano con agua de aspecto turbio.', riesgoFoto: 2 },
    ],
    evaluacion: {
      resumen: 'Evaluación preliminar: indicio moderado y reciente de sedimento en el suministro por canilla en una compañía de Itauguá; se sugiere verificación técnica.',
      justificacion: 'El sedimento amarronado detectado recién ese día, junto con olor a cloro fuerte, sugiere una posible perturbación puntual en la red (por ejemplo, mantenimiento o rotura cercana) más que un problema estructural. No hay malestar reportado. No constituye diagnóstico oficial.',
      recomendacion: 'Monitorear en el corto plazo; si persiste, programar verificación técnica de la red.',
    },
  },
  {
    n: 15,
    codigo: 'RPT-15',
    ubicacion: { localidad: 'Luque', municipio: 'Luque', latitud: -25.27, longitud: -57.4872 },
    canal: 'WEB',
    fecha: '2026-06-14T18:30:00-04:00',
    clasificacionEsperada: 'RIESGO_MEDIO',
    riesgoScore: 3,
    respuestas: {
      [P1]: 'Canilla / grifo',
      [P2]: 'Amarilla o marrón (hierro o sedimento)',
      [P3]: 'A tierra o moho',
      [P4]: 'No lo probé',
      [P5]: 'No sé',
      [P6]: 'Ya me había pasado antes / es recurrente',
    },
    imagenes: [
      { archivo: 'reporte-15-01.webp', descripcion: 'Desagüe obstruido y de aspecto deteriorado, en una zona con drenaje deficiente.', riesgoFoto: 3 },
      { archivo: 'reporte-15-02.webp', descripcion: 'Tramo de un río urbano degradado que atraviesa un asentamiento, agua de aspecto deteriorado.', riesgoFoto: 2 },
    ],
    evaluacion: {
      resumen: 'Evaluación preliminar: indicios moderados y recurrentes de sedimento en el suministro por canilla en Luque; se sugiere verificación técnica.',
      justificacion: 'El problema de color amarronado con olor a tierra/moho es recurrente según el reporte, aunque no se confirma malestar de salud. La recurrencia, junto con evidencia fotográfica de drenaje deficiente en el entorno, sostiene un puntaje moderado en lugar de bajo. No constituye diagnóstico oficial.',
      recomendacion: 'Monitorear en el corto plazo y programar verificación técnica de la red en el sector.',
    },
  },
  {
    n: 16,
    codigo: 'RPT-16',
    ubicacion: { localidad: 'Fernando de la Mora', municipio: 'Fernando de la Mora', latitud: -25.32, longitud: -57.54 },
    canal: 'WEB',
    fecha: '2026-06-18T09:00:00-04:00',
    clasificacionEsperada: 'RIESGO_BAJO',
    riesgoScore: 2,
    respuestas: {
      [P1]: 'Tanque o reservorio',
      [P2]: 'Blanquecina o lechosa (turbidez o aire)',
      [P3]: 'No, sin olor raro',
      [P4]: 'No, igual que siempre',
      [P5]: 'No',
      [P6]: 'Recién lo noté hoy',
    },
    imagenes: [
      { archivo: 'reporte-16-01.webp', descripcion: 'Espuma de tono blanquecino sobre la superficie del agua (fotografía histórica de referencia, residuo industrial de pulpa de papel).', riesgoFoto: 2 },
      { archivo: 'reporte-16-02.webp', descripcion: 'Espuma blanquecina acumulada junto a rocas en la orilla de un curso de agua.', riesgoFoto: 1 },
    ],
    evaluacion: {
      resumen: 'Evaluación preliminar: indicio aislado y leve de turbidez en un tanque de Fernando de la Mora; sin otros signos concurrentes.',
      justificacion: 'El único indicio reportado es un aspecto blanquecino/lechoso, típicamente asociado a aire disuelto o turbidez leve, sin olor, sabor ni malestar. Las fotografías de referencia ilustran el tipo de aspecto blanquecino descrito, sin que se haya fotografiado directamente el tanque. Al no acompañarse de otras señales, se mantiene en un nivel bajo. Requiere verificación técnica antes de descartar el caso; no constituye diagnóstico oficial.',
      recomendacion: 'Monitorear la evolución; verificación técnica no urgente si el aspecto persiste.',
    },
  },
  {
    n: 17,
    codigo: 'RPT-17',
    ubicacion: { localidad: 'Capiatá', municipio: 'Capiatá', latitud: -25.35, longitud: -57.42 },
    canal: 'WHATSAPP',
    fecha: '2026-06-20T12:10:00-04:00',
    clasificacionEsperada: 'RIESGO_BAJO',
    riesgoScore: 1,
    respuestas: {
      [P1]: 'Pozo',
      [P2]: 'Normal / sin cambios',
      [P3]: 'A tierra o moho',
      [P4]: 'No, igual que siempre',
      [P5]: 'No',
      [P6]: 'Hace unos días',
    },
    imagenes: [
      { archivo: 'reporte-17-01.webp', descripcion: 'Agua clara fluyendo con reflejos desde una tubería, en un entorno natural sin turbidez visible.', riesgoFoto: 0 },
      { archivo: 'reporte-17-02.webp', descripcion: 'Salpicadura de agua clara sobre fondo neutro.', riesgoFoto: 1 },
    ],
    evaluacion: {
      resumen: 'Evaluación preliminar: indicio aislado de olor a tierra/moho en un pozo de Capiatá, sin cambios visuales; sin indicios visuales relevantes en la evidencia disponible.',
      justificacion: 'El color del agua se reporta normal y no hay cambios de sabor ni malestar; el único indicio es un olor a tierra o moho detectado hace pocos días. Las fotografías muestran agua de aspecto claro, sin signos relevantes de deterioro. Se mantiene en el nivel más bajo dentro de la categoría con indicio. No constituye diagnóstico oficial.',
      recomendacion: 'Monitorear la evolución; verificación técnica no urgente.',
    },
  },
  {
    n: 18,
    codigo: 'RPT-18',
    ubicacion: { localidad: 'Mariano Roque Alonso', municipio: 'Mariano Roque Alonso', latitud: -25.2122, longitud: -57.5331 },
    canal: 'WEB',
    fecha: '2026-06-22T07:50:00-04:00',
    clasificacionEsperada: 'RIESGO_BAJO',
    riesgoScore: 2,
    respuestas: {
      [P1]: 'Canilla / grifo',
      [P2]: 'Amarilla o marrón (hierro o sedimento)',
      [P3]: 'No, sin olor raro',
      [P4]: 'No, igual que siempre',
      [P5]: 'No',
      [P6]: 'Recién lo noté hoy',
    },
    imagenes: [
      { archivo: 'reporte-18-01.webp', descripcion: 'Carrito de supermercado abandonado dentro del agua de un canal cercano, con leve turbidez alrededor.', riesgoFoto: 1 },
      { archivo: 'reporte-18-02.webp', descripcion: 'Orilla de un curso de agua con algunos residuos dispersos y agua de tono ligeramente turbio.', riesgoFoto: 2 },
    ],
    evaluacion: {
      resumen: 'Evaluación preliminar: indicio aislado y reciente de sedimento en el suministro por canilla en Mariano Roque Alonso; sin otros signos concurrentes.',
      justificacion: 'Se observa color amarronado leve detectado recién ese día, sin olor, sabor alterado ni malestar. Es compatible con una perturbación puntual de la red. Las fotografías del entorno cercano muestran una turbidez leve, consistente con el relato. Requiere verificación técnica antes de descartar el caso; no constituye diagnóstico oficial.',
      recomendacion: 'Monitorear la evolución en las próximas horas; verificación técnica no urgente si no se repite.',
    },
  },
  {
    n: 19,
    codigo: 'RPT-19',
    ubicacion: { localidad: 'J. Augusto Saldívar', municipio: 'J. Augusto Saldívar', latitud: -25.45, longitud: -57.4 },
    canal: 'WHATSAPP',
    fecha: '2026-06-25T16:05:00-04:00',
    clasificacionEsperada: 'RIESGO_BAJO',
    riesgoScore: 1,
    respuestas: {
      [P1]: 'Pozo',
      [P2]: 'Normal / sin cambios',
      [P3]: 'No, sin olor raro',
      [P4]: 'Sí, sabor raro',
      [P5]: 'No',
      [P6]: 'Recién lo noté hoy',
    },
    imagenes: [
      { archivo: 'reporte-19-01.webp', descripcion: 'Tubería descargando agua de aspecto relativamente claro hacia un curso de agua.', riesgoFoto: 0 },
      { archivo: 'reporte-19-02.webp', descripcion: 'Tubería de descarga hacia una playa, sin coloración ni residuos evidentes en la imagen.', riesgoFoto: 1 },
    ],
    evaluacion: {
      resumen: 'Evaluación preliminar: indicio aislado de sabor en un pozo de J. Augusto Saldívar, sin cambios visuales; sin indicios visuales relevantes en la evidencia disponible.',
      justificacion: 'El único indicio reportado es un sabor raro detectado ese mismo día, sin cambios de color, olor ni malestar. Las fotografías no muestran signos relevantes de deterioro. Se mantiene en el nivel más bajo dentro de la categoría con indicio. No constituye diagnóstico oficial.',
      recomendacion: 'Monitorear la evolución; verificación técnica no urgente.',
    },
  },
  {
    n: 20,
    codigo: 'RPT-20',
    ubicacion: { localidad: 'Ypané', municipio: 'Ypané', latitud: -25.45, longitud: -57.53 },
    canal: 'WEB',
    fecha: '2026-06-27T11:40:00-04:00',
    clasificacionEsperada: 'RIESGO_BAJO',
    riesgoScore: 2,
    respuestas: {
      [P1]: 'Otro',
      [P2]: 'Blanquecina o lechosa (turbidez o aire)',
      [P3]: 'No, sin olor raro',
      [P4]: 'No lo probé',
      [P5]: 'No sé',
      [P6]: 'Hace unos días',
    },
    imagenes: [
      { archivo: 'reporte-20-01.webp', descripcion: 'Desagüe urbano con agua de aspecto turbio, en las cercanías de una naciente de agua.', riesgoFoto: 2 },
      { archivo: 'reporte-20-02.webp', descripcion: 'Canal con agua estancada de aspecto calmo y vegetación en los bordes.', riesgoFoto: 1 },
    ],
    evaluacion: {
      resumen: 'Evaluación preliminar: indicio aislado de turbidez leve en una naciente de Ypané; sin otros signos concurrentes.',
      justificacion: 'El aspecto blanquecino/lechoso reportado es habitualmente asociado a aire disuelto o turbidez leve. No hay olor, malestar ni datos de sabor que refuercen la señal. Las fotografías del entorno cercano muestran una turbidez moderada en un desagüe próximo. Requiere verificación técnica antes de descartar el caso; no constituye diagnóstico oficial.',
      recomendacion: 'Monitorear la evolución; verificación técnica no urgente.',
    },
  },
  {
    n: 21,
    codigo: 'RPT-21',
    ubicacion: { localidad: 'Asunción (centro)', municipio: 'Asunción', latitud: -25.28, longitud: -57.6344 },
    canal: 'WEB',
    fecha: '2026-07-01T09:00:00-04:00',
    clasificacionEsperada: 'SIN_INDICIOS',
    riesgoScore: 0,
    respuestas: {
      [P1]: 'Canilla / grifo',
      [P2]: 'Normal / sin cambios',
      [P3]: 'No, sin olor raro',
      [P4]: 'No, igual que siempre',
      [P5]: 'No',
      [P6]: 'No sé',
    },
    imagenes: [
      { archivo: 'reporte-21-01.webp', descripcion: 'Vaso con agua mineral fría, transparente, servido hasta la mitad.', riesgoFoto: 0 },
      { archivo: 'reporte-21-02.webp', descripcion: 'Vaso lleno de agua potable de aspecto transparente.', riesgoFoto: 0 },
    ],
    evaluacion: {
      resumen: 'Evaluación preliminar: sin indicios visuales relevantes en la evidencia disponible para el suministro por canilla en Asunción (centro).',
      justificacion: 'El reporte no describe cambios de color, olor ni sabor, y no hay malestar asociado. Las fotografías muestran agua transparente sin partículas visibles. No se observan indicios relevantes de contaminación en la información disponible. No constituye diagnóstico oficial ni garantía de potabilidad.',
      recomendacion: 'Sin acción prioritaria; mantener monitoreo rutinario del sector.',
    },
  },
  {
    n: 22,
    codigo: 'RPT-22',
    ubicacion: { localidad: 'San Pablo', municipio: 'Asunción', latitud: -25.3285, longitud: -57.5772 },
    canal: 'WEB',
    fecha: '2026-07-02T10:30:00-04:00',
    clasificacionEsperada: 'SIN_INDICIOS',
    riesgoScore: 0,
    respuestas: {
      [P1]: 'Canilla / grifo',
      [P2]: 'Normal / sin cambios',
      [P3]: 'No, sin olor raro',
      [P4]: 'No lo probé',
      [P5]: 'No',
      [P6]: 'No sé',
    },
    imagenes: [
      { archivo: 'reporte-22-01.webp', descripcion: 'Vaso parcialmente lleno de agua clara y transparente.', riesgoFoto: 0 },
      { archivo: 'reporte-22-02.webp', descripcion: 'Vaso con líquido transparente e incoloro.', riesgoFoto: 0 },
    ],
    evaluacion: {
      resumen: 'Evaluación preliminar: sin indicios visuales relevantes en la evidencia disponible para el barrio San Pablo, Asunción.',
      justificacion: 'No se reportan cambios de color ni olor, y no se probó el sabor. No hay malestar asociado. Las fotografías muestran agua clara. No se observan indicios relevantes de contaminación en la información disponible. No constituye diagnóstico oficial ni garantía de potabilidad.',
      recomendacion: 'Sin acción prioritaria; mantener monitoreo rutinario del sector.',
    },
  },
  {
    n: 23,
    codigo: 'RPT-23',
    ubicacion: { localidad: 'Zeballos Cué', municipio: 'Asunción', latitud: -25.2325, longitud: -57.5682 },
    canal: 'WHATSAPP',
    fecha: '2026-07-03T14:20:00-04:00',
    clasificacionEsperada: 'SIN_INDICIOS',
    riesgoScore: 0,
    respuestas: {
      [P1]: 'Pozo',
      [P2]: 'Normal / sin cambios',
      [P3]: 'No, sin olor raro',
      [P4]: 'No lo probé',
      [P5]: 'No',
      [P6]: 'No sé',
    },
    imagenes: [
      { archivo: 'reporte-23-01.webp', descripcion: 'Pozo residencial en una propiedad privada, con entorno cuidado.', riesgoFoto: 0 },
      { archivo: 'reporte-23-02.webp', descripcion: 'Extracción de agua de un pozo poco profundo cavado a mano.', riesgoFoto: 0 },
    ],
    evaluacion: {
      resumen: 'Evaluación preliminar: sin indicios visuales relevantes en la evidencia disponible para un pozo de Zeballos Cué, Asunción.',
      justificacion: 'El reporte no describe cambios de color u olor, no se probó el sabor y no hay malestar asociado. Las fotografías muestran un pozo con entorno limpio. No se observan indicios relevantes de contaminación en la información disponible. No constituye diagnóstico oficial ni garantía de potabilidad.',
      recomendacion: 'Sin acción prioritaria; mantener monitoreo rutinario del sector.',
    },
  },
  {
    n: 24,
    codigo: 'RPT-24',
    ubicacion: { localidad: 'Lambaré', municipio: 'Lambaré', latitud: -25.33, longitud: -57.64 },
    canal: 'WEB',
    fecha: '2026-07-06T08:15:00-04:00',
    clasificacionEsperada: 'SIN_INDICIOS',
    riesgoScore: 0,
    respuestas: {
      [P1]: 'Tanque o reservorio',
      [P2]: 'Normal / sin cambios',
      [P3]: 'No, sin olor raro',
      [P4]: 'No, igual que siempre',
      [P5]: 'No',
      [P6]: 'No sé',
    },
    imagenes: [
      { archivo: 'reporte-24-01.webp', descripcion: 'Detalle de vasos con agua clara.', riesgoFoto: 0 },
      { archivo: 'reporte-24-02.webp', descripcion: 'Vaso transparente con agua, enfoque selectivo.', riesgoFoto: 0 },
    ],
    evaluacion: {
      resumen: 'Evaluación preliminar: sin indicios visuales relevantes en la evidencia disponible para un tanque de reservorio en Lambaré.',
      justificacion: 'No se reportan cambios de color, olor ni sabor, y no hay malestar asociado. Las fotografías muestran agua transparente. No se observan indicios relevantes de contaminación en la información disponible. No constituye diagnóstico oficial ni garantía de potabilidad.',
      recomendacion: 'Sin acción prioritaria; mantener monitoreo rutinario del sector.',
    },
  },
  {
    n: 25,
    codigo: 'RPT-25',
    ubicacion: { localidad: 'Limpio', municipio: 'Limpio', latitud: -25.1683, longitud: -57.4942 },
    canal: 'WEB',
    fecha: '2026-07-08T09:45:00-04:00',
    clasificacionEsperada: 'SIN_INDICIOS',
    riesgoScore: 0,
    respuestas: {
      [P1]: 'Pozo',
      [P2]: 'Normal / sin cambios',
      [P3]: 'No, sin olor raro',
      [P4]: 'No, igual que siempre',
      [P5]: 'No',
      [P6]: 'No sé',
    },
    imagenes: [
      { archivo: 'reporte-25-01.webp', descripcion: 'Agua fluyendo de un manantial natural.', riesgoFoto: 0 },
      { archivo: 'reporte-25-02.webp', descripcion: 'Fuente de agua clara en movimiento, fotografía de larga exposición.', riesgoFoto: 0 },
    ],
    evaluacion: {
      resumen: 'Evaluación preliminar: sin indicios visuales relevantes en la evidencia disponible para un pozo de Limpio.',
      justificacion: 'No se reportan cambios de color, olor ni sabor, y no hay malestar asociado. Las fotografías muestran agua clara en movimiento. No se observan indicios relevantes de contaminación en la información disponible. No constituye diagnóstico oficial ni garantía de potabilidad.',
      recomendacion: 'Sin acción prioritaria; mantener monitoreo rutinario del sector.',
    },
  },
  {
    n: 26,
    codigo: 'RPT-26',
    ubicacion: { localidad: 'Areguá (costa del lago Ypacaraí)', municipio: 'Areguá', latitud: -25.3023, longitud: -57.4118 },
    canal: 'WHATSAPP',
    fecha: '2026-07-10T17:00:00-04:00',
    clasificacionEsperada: 'SIN_INDICIOS',
    riesgoScore: 0,
    respuestas: {
      [P1]: 'Otro',
      [P2]: 'Normal / sin cambios',
      [P3]: 'No, sin olor raro',
      [P4]: 'No, igual que siempre',
      [P5]: 'No',
      [P6]: 'No sé',
    },
    imagenes: [
      { archivo: 'reporte-26-01.webp', descripcion: 'Pequeño río de aspecto brillante y limpio.', riesgoFoto: 0 },
      { archivo: 'reporte-26-02.webp', descripcion: 'Arroyo de aguas claras y rápidas.', riesgoFoto: 0 },
    ],
    evaluacion: {
      resumen: 'Evaluación preliminar: sin indicios visuales relevantes en la evidencia disponible para la costa reportada en Areguá.',
      justificacion: 'No se reportan cambios de color, olor ni sabor, y no hay malestar asociado. Las fotografías muestran cursos de agua sin espuma ni residuos visibles. No se observan indicios relevantes de contaminación en la información disponible. No constituye diagnóstico oficial ni garantía de potabilidad.',
      recomendacion: 'Sin acción prioritaria; mantener monitoreo rutinario del sector.',
    },
  },
  {
    n: 27,
    codigo: 'RPT-27',
    ubicacion: { localidad: 'Ypacaraí (costa del lago)', municipio: 'Ypacaraí', latitud: -25.408, longitud: -57.2875 },
    canal: 'WEB',
    fecha: '2026-07-12T11:10:00-04:00',
    clasificacionEsperada: 'SIN_INDICIOS',
    riesgoScore: 0,
    respuestas: {
      [P1]: 'Otro',
      [P2]: 'Normal / sin cambios',
      [P3]: 'No, sin olor raro',
      [P4]: 'No lo probé',
      [P5]: 'No',
      [P6]: 'No sé',
    },
    imagenes: [
      { archivo: 'reporte-27-01.webp', descripcion: 'Arroyo rodeado de vegetación, de aspecto limpio.', riesgoFoto: 0 },
      { archivo: 'reporte-27-02.webp', descripcion: 'Río de aspecto claro atravesando un bosque denso.', riesgoFoto: 0 },
    ],
    evaluacion: {
      resumen: 'Evaluación preliminar: sin indicios visuales relevantes en la evidencia disponible para la costa reportada en Ypacaraí.',
      justificacion: 'No se reportan cambios de color ni olor, no se probó el sabor y no hay malestar asociado. Las fotografías muestran un cauce sin basura ni descargas visibles. No se observan indicios relevantes de contaminación en la información disponible. No constituye diagnóstico oficial ni garantía de potabilidad.',
      recomendacion: 'Sin acción prioritaria; mantener monitoreo rutinario del sector.',
    },
  },
  {
    n: 28,
    codigo: 'RPT-28',
    ubicacion: { localidad: 'Itá', municipio: 'Itá', latitud: -25.5005, longitud: -57.3672 },
    canal: 'WEB',
    fecha: '2026-07-14T13:50:00-04:00',
    clasificacionEsperada: 'SIN_INDICIOS',
    riesgoScore: 0,
    respuestas: {
      [P1]: 'Pozo',
      [P2]: 'Normal / sin cambios',
      [P3]: 'No, sin olor raro',
      [P4]: 'No, igual que siempre',
      [P5]: 'No',
      [P6]: 'No sé',
    },
    imagenes: [
      { archivo: 'reporte-28-01.webp', descripcion: 'Arroyo de aspecto limpio junto a un entorno natural cuidado.', riesgoFoto: 0 },
      { archivo: 'reporte-28-02.webp', descripcion: 'Arroyo que riega tierras de cultivo, de aspecto limpio.', riesgoFoto: 0 },
    ],
    evaluacion: {
      resumen: 'Evaluación preliminar: sin indicios visuales relevantes en la evidencia disponible para un pozo de Itá.',
      justificacion: 'No se reportan cambios de color, olor ni sabor, y no hay malestar asociado. Las fotografías muestran cursos de agua de aspecto limpio en el entorno rural. No se observan indicios relevantes de contaminación en la información disponible. No constituye diagnóstico oficial ni garantía de potabilidad.',
      recomendacion: 'Sin acción prioritaria; mantener monitoreo rutinario del sector.',
    },
  },
  {
    n: 29,
    codigo: 'RPT-29',
    ubicacion: { localidad: 'Yaguarón', municipio: 'Yaguarón', latitud: -25.5622, longitud: -57.2866 },
    canal: 'WHATSAPP',
    fecha: '2026-07-16T09:30:00-04:00',
    clasificacionEsperada: 'SIN_INDICIOS',
    riesgoScore: 0,
    respuestas: {
      [P1]: 'Canilla / grifo',
      [P2]: 'Normal / sin cambios',
      [P3]: 'No, sin olor raro',
      [P4]: 'No, igual que siempre',
      [P5]: 'No',
      [P6]: 'No sé',
    },
    imagenes: [
      { archivo: 'reporte-29-01.webp', descripcion: 'Arroyo de agua clara con flores en la orilla.', riesgoFoto: 0 },
      { archivo: 'reporte-29-02.webp', descripcion: 'Delta de un río glacial de aspecto limpio.', riesgoFoto: 0 },
    ],
    evaluacion: {
      resumen: 'Evaluación preliminar: sin indicios visuales relevantes en la evidencia disponible para el suministro por canilla en Yaguarón.',
      justificacion: 'No se reportan cambios de color, olor ni sabor, y no hay malestar asociado. Las fotografías muestran cursos de agua de aspecto limpio. No se observan indicios relevantes de contaminación en la información disponible. No constituye diagnóstico oficial ni garantía de potabilidad.',
      recomendacion: 'Sin acción prioritaria; mantener monitoreo rutinario del sector.',
    },
  },
  {
    n: 30,
    codigo: 'RPT-30',
    ubicacion: { localidad: 'Pirayú', municipio: 'Pirayú', latitud: -25.48, longitud: -57.2375 },
    canal: 'WEB',
    fecha: '2026-07-18T15:15:00-04:00',
    clasificacionEsperada: 'SIN_INDICIOS',
    riesgoScore: 0,
    respuestas: {
      [P1]: 'Tanque o reservorio',
      [P2]: 'Normal / sin cambios',
      [P3]: 'No, sin olor raro',
      [P4]: 'No, igual que siempre',
      [P5]: 'No',
      [P6]: 'No sé',
    },
    imagenes: [
      { archivo: 'reporte-30-01.webp', descripcion: 'Canal de agua abierto y de aspecto limpio.', riesgoFoto: 0 },
      { archivo: 'reporte-30-02.webp', descripcion: 'Tramo cubierto del mismo sistema de canal, de aspecto limpio.', riesgoFoto: 0 },
    ],
    evaluacion: {
      resumen: 'Evaluación preliminar: sin indicios visuales relevantes en la evidencia disponible para un tanque de reservorio en Pirayú.',
      justificacion: 'No se reportan cambios de color, olor ni sabor, y no hay malestar asociado. Las fotografías muestran un canal sin basura, espuma ni descargas visibles. No se observan indicios relevantes de contaminación en la información disponible. No constituye diagnóstico oficial ni garantía de potabilidad.',
      recomendacion: 'Sin acción prioritaria; mantener monitoreo rutinario del sector.',
    },
  },
].map((r) => ({
  ...r,
  telefono: telefonoSeed(r.n),
  codigoValidacion: codigoValidacionSeed(r.n),
}));

module.exports = { REPORTES };
