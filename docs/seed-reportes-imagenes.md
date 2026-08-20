# Seed de reportes ciudadanos — Acuífero Patiño

Este documento describe el seed sintético de 30 reportes ciudadanos sobre
posible contaminación del agua en el área de influencia del **Acuífero
Patiño** (Paraguay), usado para desarrollo y demostración.

> **Importante:** todos los datos generados por este seed son **sintéticos**.
> No representan denuncias reales ni diagnósticos oficiales de contaminación
> o potabilidad del agua. Los teléfonos, nombres de escenario, coordenadas y
> evaluaciones fueron creados o compilados específicamente para esta
> demostración.

## Archivos involucrados

- `prisma/seed-data/reportes.data.ts` — dataset declarativo de los 30
  reportes (ubicación, respuestas, imágenes, evaluación).
- `prisma/seed-data/imagenes.manifest.ts` — manifiesto de las 60 imágenes
  reales usadas (URL de origen, licencia, autor).
- `prisma/download-seed-images.ts` — script que descarga/verifica las
  imágenes del manifiesto.
- `prisma/seed-reportes.ts` — script principal que siembra la base de datos.
- `prisma/seed-encuesta-agua.ts` — siembra la encuesta/preguntas/opciones
  (reutilizado tal cual, sin duplicar el cuestionario).

## Cómo ejecutar

```bash
# 1. Descargar (o verificar) las 60 imágenes
npm run seed:reportes:images

# 2. Sembrar los 30 reportes en la base de datos
npm run seed:reportes

# 3. Ambos pasos en un solo comando
npm run seed:reportes:all
```

Requiere que `DATABASE_URL` (y el resto de variables de `.env`) estén
configuradas, igual que para `npm run db:seed`.

## Qué datos genera

- 1 encuesta ("Aguard Encuesta") con las 7 preguntas de
  `preguntas_encuesta.txt`, en el mismo orden y con las mismas opciones
  (fuente de verdad: ese archivo / `prisma/seed-encuesta-agua.ts`).
- 30 `UsuarioCiudadano` sintéticos, uno por reporte.
- 30 `ValidacionSms` ya verificadas (una por reporte, agrupa todas sus
  respuestas — ver "Modelo de datos" abajo).
- 210 `Respuesta` (7 por reporte: 6 preguntas de opción + 1 pregunta de
  fotos).
- 60 `RespuestaArchivo` (2 fotos por reporte).
- 30 `EvaluacionIa` en estado `COMPLETADO`, con `modelo = 'seed-evaluation-v1'`
  para poder distinguirlas de evaluaciones reales generadas por
  `src/services/evaluacionIa.service.ts`.
- 60 `EvaluacionIaFoto` (una por foto).

### Distribución de los 30 escenarios

| Categoría | Cantidad | riesgoScore (escala 0-5) |
|---|---|---|
| Riesgo alto | 7 | 4-5 |
| Riesgo medio | 8 | 3 |
| Riesgo bajo, con indicio aislado | 5 | 1-2 |
| Sin indicios relevantes | 10 | 0 |

**Nota sobre la escala de riesgo:** el sistema real (`evaluacionIa.service.ts`
y el prompt de IA en `evaluacionIa.prompt.ts`) usa y valida una escala de
**0 a 5**, no de 0 a 100. Este seed usa esa misma escala 0-5 para que los
datos sintéticos sean coherentes con el resto de la aplicación.

- Canal: 18 reportes `WEB`, 12 `WHATSAPP` (distribución fija, escrita
  explícitamente en el dataset).
- Fechas: fijas, entre el 2026-05-06 y el 2026-07-18 (orden cronológico
  razonable, con algunos grupos de reportes cercanos en fecha y ubicación
  para simular acumulación geográfica/temporal — p. ej. Villeta, Bañado Sur,
  San Lorenzo, Itauguá).

Ningún reporte se clasifica como "agua potable", "agua segura" ni
"contaminación confirmada". Los textos usan expresiones como "evaluación
preliminar", "indicios compatibles con posible contaminación", "requiere
verificación técnica" y "no constituye diagnóstico oficial".

## Modelo de datos: qué es "un reporte completo"

El esquema no tiene una tabla `Reporte` única. Un envío ciudadano genera:

- Una `ValidacionSms` (agrupa la sesión/envío; `verificado = true`).
- Varias filas `Respuesta`, una por cada `Pregunta` de la encuesta, todas
  compartiendo el mismo `validacionSmsId`. La pregunta de tipo `FOTO` genera
  su propia `Respuesta`, a la que se asocian los `RespuestaArchivo`.
- Una `EvaluacionIa` asociada 1:1 a la `ValidacionSms`.

Este seed respeta ese modelo: cada uno de los 30 "reportes" es, en la base de
datos, 1 `UsuarioCiudadano` + 1 `ValidacionSms` + 7 `Respuesta` + 2
`RespuestaArchivo` + 1 `EvaluacionIa` + 2 `EvaluacionIaFoto`.

## Idempotencia

Ejecutar `npm run seed:reportes` varias veces **no duplica datos**:

1. Al inicio de cada corrida, se identifican los 30 registros
   `UsuarioCiudadano` cuyo `telefono` está en la lista reservada de este seed
   (`+595981900001` a `+595981900030`).
2. Se eliminan, dentro de una transacción, únicamente los registros
   dependientes de esos 30 usuarios (`EvaluacionIaFoto`, `EvaluacionIa`,
   `RespuestaOpcion`, `RespuestaArchivo`, `Respuesta`, `ValidacionSms`,
   `UsuarioCiudadano`).
3. Se vuelven a crear desde cero con el dataset actual.
4. La `Encuesta`/`Pregunta`/`PreguntaOpcion` se reutilizan mediante `upsert`
   (nunca se borran).

El `deleteMany` **nunca** corre sin filtro: siempre está acotado a los 30
teléfonos reservados de este seed. No se toca ningún otro `UsuarioCiudadano`,
`Respuesta` o `Encuesta` del sistema.

Para eliminar únicamente los datos de este seed sin volver a crearlos,
ejecutar el mismo bloque de limpieza manualmente contra la base (o vaciar la
tabla `UsuarioCiudadano` filtrando por esos teléfonos, dejando que las
cascadas de Prisma completen el resto tras borrar en el orden indicado
arriba).

## Teléfonos e identificadores reservados

- Teléfonos: `+595981900001` a `+595981900030` (30 números ficticios,
  reservados exclusivamente para este seed; no corresponden a personas
  reales).
- Código de `ValidacionSms.codigo`: `SEED01` a `SEED30` (marca legible del
  origen sintético del registro).
- `EvaluacionIa.modelo`: `seed-evaluation-v1` (para distinguir estas
  evaluaciones de las generadas por el servicio real de IA).

## Localidades y coordenadas

Las 30 ubicaciones están dentro del área del Acuífero Patiño (acuífero libre
de 1.173 km², límites aproximados 25°05'–25°38' S y 57°08'–57°41' W, vértices
Asunción–Limpio–Paraguarí), en los departamentos Central y Asunción.

Fuentes consultadas para confirmar la extensión del acuífero y sus
municipios:

- [Estudio del Acuífero Patiño — Área de Estudio (FIUNA)](http://www.estudiopatino.pol.una.py/blog/?page_id=62)
- [SEAM/MADES — Informe de monitoreos del Acuífero Patiño](http://mades.gov.py/content/seam-presenta-informe-de-los-monitoreos-realizados-en-el-acu%C3%ADfero-pati%C3%B1o)
- [Última Hora — Cómo están los acuíferos Patiño y Guaraní](https://www.ultimahora.com/dia-mundial-del-agua-como-estan-los-acuiferos-patino-y-guarani-n3054177)

Coordenadas de cada localidad verificadas contra Wikipedia (infobox con
coordenadas geográficas):

| Localidad/Barrio | Municipio | Lat | Lon | Fuente |
|---|---|---|---|---|
| Asunción (centro) | Asunción | -25.2800 | -57.6344 | [Wikipedia](https://es.wikipedia.org/wiki/Asunci%C3%B3n) |
| Sajonia | Asunción | -25.3000 | -57.6667 | [Wikipedia](https://es.wikipedia.org/wiki/Sajonia_(Asunci%C3%B3n)) |
| Tacumbú | Asunción | -25.3048 | -57.6564 | [Wikipedia](https://en.wikipedia.org/wiki/Tacumb%C3%BA) |
| Ricardo Brugada (Bañado Sur) | Asunción | -25.2790 | -57.6338 | [Wikipedia](https://es.wikipedia.org/wiki/Ricardo_Brugada_(Asunci%C3%B3n)) |
| San Pablo | Asunción | -25.3285 | -57.5772 | [Wikipedia](https://en.wikipedia.org/wiki/San_Pablo_(Asunci%C3%B3n)) |
| Zeballos Cué | Asunción | -25.2325 | -57.5682 | [Wikipedia](https://en.wikipedia.org/wiki/Zeballos_Cu%C3%A9) |
| San Lorenzo | San Lorenzo | -25.3400 | -57.5200 | [Wikipedia](https://en.wikipedia.org/wiki/San_Lorenzo,_Paraguay) |
| Luque | Luque | -25.2700 | -57.4872 | [Wikipedia](https://en.wikipedia.org/wiki/Luque) |
| Fernando de la Mora | Fernando de la Mora | -25.3200 | -57.5400 | [Wikipedia](https://es.wikipedia.org/wiki/Fernando_de_la_Mora_(Paraguay)) |
| Lambaré | Lambaré | -25.3300 | -57.6400 | [Wikipedia](https://en.wikipedia.org/wiki/Lambar%C3%A9) |
| Ñemby | Ñemby | -25.3935 | -57.5443 | [Wikipedia](https://en.wikipedia.org/wiki/%C3%91emby) |
| Villa Elisa | Villa Elisa | -25.5075 | -57.5725 | [Wikipedia](https://es.wikipedia.org/wiki/Villa_Elisa_(Paraguay)) |
| Capiatá | Capiatá | -25.3500 | -57.4200 | [Wikipedia](https://en.wikipedia.org/wiki/Capiat%C3%A1) |
| Mariano Roque Alonso | Mariano Roque Alonso | -25.2122 | -57.5331 | [Wikipedia](https://es.wikipedia.org/wiki/Mariano_Roque_Alonso_(Paraguay)) |
| Limpio | Limpio | -25.1683 | -57.4942 | [Wikipedia](https://es.wikipedia.org/wiki/Limpio_(Paraguay)) |
| Areguá | Areguá | -25.3023 | -57.4118 | [Wikipedia](https://en.wikipedia.org/wiki/Aregu%C3%A1) |
| Itauguá | Itauguá | -25.3830 | -57.3330 | [Wikipedia](https://en.wikipedia.org/wiki/Itaugu%C3%A1) |
| San Antonio | San Antonio | -25.3797 | -57.6097 | [Wikipedia](https://es.wikipedia.org/wiki/San_Antonio_(Paraguay)) |
| J. Augusto Saldívar | J. Augusto Saldívar | -25.4500 | -57.4000 | [Wikipedia](https://en.wikipedia.org/wiki/Juli%C3%A1n_Augusto_Sald%C3%ADvar) |
| Villeta | Villeta | -25.5100 | -57.5600 | [Wikipedia](https://en.wikipedia.org/wiki/Villeta,_Paraguay) |
| Ypacaraí | Ypacaraí | -25.4080 | -57.2875 | [Wikipedia](https://en.wikipedia.org/wiki/Ypacara%C3%AD) |
| Ypané | Ypané | -25.4500 | -57.5300 | [Wikipedia](https://en.wikipedia.org/wiki/Ypan%C3%A9) |
| Itá | Itá | -25.5005 | -57.3672 | [Wikipedia](https://en.wikipedia.org/wiki/It%C3%A1,_Paraguay) |
| Yaguarón | Yaguarón (Paraguarí) | -25.5622 | -57.2866 | [Wikipedia](https://es.wikipedia.org/wiki/Yaguar%C3%B3n_(Paraguay)) |
| Pirayú | Pirayú (Paraguarí) | -25.4800 | -57.2375 | [Wikipedia](https://es.wikipedia.org/wiki/Piray%C3%BA_(Paraguay)) |

Algunas de estas localidades se usaron más de una vez (Villeta, Ricardo
Brugada/Bañado Sur, San Lorenzo, Itauguá) aplicando una variación fija y
pequeña (≤ 0.003° lat/lon) sobre la coordenada verificada, para simular
reportes cercanos entre sí dentro del mismo barrio/compañía sin pretender
precisión de calle exacta. El resto de las localidades se usó una sola vez,
como puntos aislados.

## Imágenes: origen y licencias

Cada uno de los 30 reportes tiene exactamente 2 fotografías (60 en total),
descargadas físicamente al proyecto en `uploads/seed-reportes/` con nombres
deterministas (`reporte-01-01.webp`, `reporte-01-02.webp`, ...,
`reporte-30-02.webp`). El detalle completo (URL de origen, autor, licencia,
sitio, descripción y justificación) está en
`prisma/seed-data/imagenes.manifest.ts`; el resumen por reporte es el
siguiente.

Fecha de consulta de todas las imágenes: **2026-07-28**.

Sitios usados: **Wikimedia Commons** (mayoría, incluye fotografías de
dominio público de la serie histórica EPA/Documerica vía NARA), **Unsplash**
y **Pexels** (licencias libres de uso). Ninguna imagen proviene de una
búsqueda de Google Images sin verificar la fuente original.

| Reporte | Archivo | Descripción | Autor | Licencia | Fuente |
|---|---|---|---|---|---|
| RPT-01 | reporte-01-01.webp | Película aceitosa iridiscente sobre un estanque | Jomegat | CC BY-SA 3.0 | [Wikimedia](https://commons.wikimedia.org/wiki/File:Oil_sheen_on_pond.jpg) |
| RPT-01 | reporte-01-02.webp | Lodo aceitoso flotando en una dársena (1973) | Doug Wilson (EPA/Documerica) | Dominio público | [Wikimedia](https://commons.wikimedia.org/wiki/File:OIL_SLUDGE_FLOATS_ON_WATER_AT_YACHT_BASIN_-_NARA_-_552270.jpg) |
| RPT-02 | reporte-02-01.webp | Estanque de agua sucia y aceitosa junto a chatarra de autos (1973) | Dan McCoy (EPA/Documerica) | Dominio público | [Wikimedia](https://commons.wikimedia.org/wiki/File:DIRTY,_OILY_WATER_OF_POND_BESIDE_AUTOMOBILE_SCRAP_YARD_-_NARA_-_554347.jpg) |
| RPT-02 | reporte-02-02.webp | Descarga de residuo de planta de pulpa de papel (1973) | Doug Wilson (EPA/Documerica) | Dominio público | [Wikimedia](https://commons.wikimedia.org/wiki/File:SCOTT_SULPHITE_PULP_MILL_DISCHARGES_WATER_WASTE_-_NARA_-_552152.jpg) |
| RPT-03 | reporte-03-01.webp | Basura acumulada en la orilla del río Chattahoochee (1972) | Chuck Rogers (EPA/Documerica) | Dominio público | [Wikimedia](https://commons.wikimedia.org/wiki/File:GARBAGE_AND_TRASH_ALONG_BANK_OF_CHATTAHOOCHEE_RIVER_-_NARA_-_545945.jpg) |
| RPT-03 | reporte-03-02.webp | Escorrentía de agua residual/cloacal | Finn Terman Frederiksen | CC BY 2.0 | [Wikimedia](https://commons.wikimedia.org/wiki/File:POLLUTED_WATER.jpg) |
| RPT-04 | reporte-04-01.webp | Río turbio y contaminado, Mantena (Brasil) | Josue200818 | CC BY-SA 3.0 | [Wikimedia](https://commons.wikimedia.org/wiki/File:Rio_poluído_de_Mantena.jpg) |
| RPT-04 | reporte-04-02.webp | Canal de drenaje con basura, Cochabamba (Bolivia) | Nachof08 | CC BY-SA 4.0 | [Wikimedia](https://commons.wikimedia.org/wiki/File:Basura_en_Cochabamba_02.jpg) |
| RPT-05 | reporte-05-01.webp | Agua sucia con residuos, coloración oscura | FatYellowFish | CC BY-SA 4.0 | [Wikimedia](https://commons.wikimedia.org/wiki/File:Water-pollution.jpg) |
| RPT-05 | reporte-05-02.webp | Embarcación en puerto con agua contaminada (1972) | Gene Daniels (EPA/Documerica) | Dominio público | [Wikimedia](https://commons.wikimedia.org/wiki/File:BOW_OF_FISHING_BOAT_IN_POLLUTED_HARBOR_-_NARA_-_545270.jpg) |
| RPT-06 | reporte-06-01.webp | Embarcaciones sobre mancha de hidrocarburo (1972) | Tomas Sennett (EPA/Documerica) | Dominio público | [Wikimedia](https://commons.wikimedia.org/wiki/File:THESE_FISHING_BOATS_HAVE_PRODUCED_THE_OIL_SLICK_ON_WHICH_THEY_RIDE_-_NARA_-_542980.jpg) |
| RPT-06 | reporte-06-02.webp | Balde semihundido en agua estancada | Saral Shots | CC BY-SA 4.0 | [Wikimedia](https://commons.wikimedia.org/wiki/File:Half_sunk_bucket.jpg) |
| RPT-07 | reporte-07-01.webp | Río con sedimento marrón en suspensión | USGS | Dominio público | [Wikimedia](https://commons.wikimedia.org/wiki/File:Muddy_USGS.jpg) |
| RPT-07 | reporte-07-02.webp | Orilla de río turbio y marrón | Leo_Visions | Unsplash License | [Unsplash](https://unsplash.com/photos/a-boat-on-a-muddy-river-9eoWFr-0Mo0) |
| RPT-08 | reporte-08-01.webp | Residuos plásticos obstruyendo un arroyo | Global Water Forum | CC BY 2.0 | [Wikimedia](https://commons.wikimedia.org/wiki/File:Creek_Water_Pollution.jpg) |
| RPT-08 | reporte-08-02.webp | Agua estancada de entorno residencial | Tsopbeng vannelle | CC0 1.0 | [Wikimedia](https://commons.wikimedia.org/wiki/File:Eau_stagnante_a_Foto.jpg) |
| RPT-09 | reporte-09-01.webp | Floración de algas y hojarasca en superficie | Koyaanis Qatsi | Dominio público | [Wikimedia](https://commons.wikimedia.org/wiki/File:Algalbloom.jpg) |
| RPT-09 | reporte-09-02.webp | Arroyo cubierto de algas verdes, Ontario | Derek Hatfield | CC BY 2.0 | [Wikimedia](https://commons.wikimedia.org/wiki/File:171a_365_-_Green_Pond_(4985235160).jpg) |
| RPT-10 | reporte-10-01.webp | Estanque de granja con algas verdes intensas | Eric Vance (USEPA) | Dominio público | [Wikimedia](https://commons.wikimedia.org/wiki/File:Algae_bloom_on_farm_pond._North_western_West_Virginia._2012_USEPA_photo_by_Eric_Vance_(13765604433).jpg) |
| RPT-10 | reporte-10-02.webp | Floración de cianobacterias verde-azuladas, Filipinas | Joyce Cory | CC BY 2.0 | [Wikimedia](https://commons.wikimedia.org/wiki/File:Laguna_Lake_Blue-Green_Algae_Bloom_(48701932783).jpg) |
| RPT-11 | reporte-11-01.webp | Zanja de drenaje con maleza y agua estancada, Nigeria | Macdanpets | CC BY-SA 4.0 | [Wikimedia](https://commons.wikimedia.org/wiki/File:Blocked_drainage_in_Morogbo_Badagry,_Lagos_State,_Nigeria.jpg) |
| RPT-11 | reporte-11-02.webp | Canal bloqueado por residuos, Nigeria | Bibiire1 | CC BY-SA 4.0 | [Wikimedia](https://commons.wikimedia.org/wiki/File:A_blocked_drainage_at_Morogbo.jpg) |
| RPT-12 | reporte-12-01.webp | Escorrentía de sedimento en ladera | Anlace | Dominio público | [Wikimedia](https://commons.wikimedia.org/wiki/File:Runoffrazorback.jpg) |
| RPT-12 | reporte-12-02.webp | Drenaje pluvial bloqueado, Harare | SuSanA Secretariat | CC BY 2.0 | [Wikimedia](https://commons.wikimedia.org/wiki/File:Blocked_drainage_in_Mbare,_Harare_(6915329193).jpg) |
| RPT-13 | reporte-13-01.webp | Espejo de agua verde por eutrofización, Washington DC | Eric Vance (USEPA) | Dominio público | [Wikimedia](https://commons.wikimedia.org/wiki/File:Algae_bloom_in_Reflecting_Pool,_Washington,_DC._2007_Potomac_River,_Chesapeake_Bay_watershed._USEPA_photo_by_Eric_Vance_(13765962984).jpg) |
| RPT-13 | reporte-13-02.webp | Río con floración algal verde extensa | Mihály Köles | Unsplash License | [Unsplash](https://unsplash.com/photos/green-color-water-gR_AgAcP7jI) |
| RPT-14 | reporte-14-01.webp | Drenaje con agua anaranjada/turbia, Nairobi | Queen Asali | CC BY-SA 4.0 | [Wikimedia](https://commons.wikimedia.org/wiki/File:Water_pollution_in_Nairobi.jpg) |
| RPT-14 | reporte-14-02.webp | Canal de drenaje urbano, Lagos | Macdanpets | CC BY-SA 4.0 | [Wikimedia](https://commons.wikimedia.org/wiki/File:A_drainage_at_Ibereko,_Badagry,_Lagos_State,_Nigeria.jpg) |
| RPT-15 | reporte-15-01.webp | Desagüe obstruido y deteriorado, Nigeria | Macdanpets | CC BY-SA 4.0 | [Wikimedia](https://commons.wikimedia.org/wiki/File:Stuffy_and_blocked_drainage_at_Agbara,_Badagry_Expressway.jpg) |
| RPT-15 | reporte-15-02.webp | Río Mathare degradado en asentamiento informal, Nairobi | Queen Asali | CC BY-SA 4.0 | [Wikimedia](https://commons.wikimedia.org/wiki/File:Mathare_River-_Nairobi.jpg) |
| RPT-16 | reporte-16-01.webp | Espuma blanquecina de residuo industrial (1973) | Doug Wilson (EPA/Documerica) | Dominio público | [Wikimedia](https://commons.wikimedia.org/wiki/File:FOAMY_PULPING_WASTE_-_NARA_-_552192.jpg) |
| RPT-16 | reporte-16-02.webp | Espuma junto a rocas, Punta del Este | Mercedes Rompani | CC BY-SA 3.0 | [Wikimedia](https://commons.wikimedia.org/wiki/File:Foam.jpg) |
| RPT-17 | reporte-17-01.webp | Agua clara fluyendo desde una tubería | Eberhard Grossgasteiger | Pexels License | [Pexels](https://www.pexels.com/photo/clear-water-flowing-from-pipe-4406602/) |
| RPT-17 | reporte-17-02.webp | Salpicadura de agua clara | Neil Martin | Pexels License | [Pexels](https://www.pexels.com/photo/clear-water-2249233/) |
| RPT-18 | reporte-18-01.webp | Carrito de supermercado abandonado en el agua, Noruega | gcardinal (Dmitry Valberg) | CC BY 2.0 | [Wikimedia](https://commons.wikimedia.org/wiki/File:Shopping_vogn.jpg) |
| RPT-18 | reporte-18-02.webp | Residuos varios en la orilla de un río | Collab Media | Pexels License | [Pexels](https://www.pexels.com/photo/waste-on-a-riverbank-15060366/) |
| RPT-19 | reporte-19-01.webp | Tubería descargando agua hacia un curso de agua | USDA | Dominio público | [Wikimedia](https://commons.wikimedia.org/wiki/File:Discharge_pipe.jpg) |
| RPT-19 | reporte-19-02.webp | Tubería de descarga hacia una playa (1972) | Dick Rowan (EPA/Documerica) | Dominio público | [Wikimedia](https://commons.wikimedia.org/wiki/File:DISCHARGE_PIPE_ON_MONTEREY_BAY_BEACH_-_NARA_-_543161.jpg) |
| RPT-20 | reporte-20-01.webp | Desagüe urbano deficiente, Nigeria | Macdanpets | CC BY-SA 4.0 | [Wikimedia](https://commons.wikimedia.org/wiki/File:Bad_drainage.jpg) |
| RPT-20 | reporte-20-02.webp | Drenaje bloqueado por residuos, Harare | SuSanA Secretariat | CC BY 2.0 | [Wikimedia](https://commons.wikimedia.org/wiki/File:Lack_of_solid_waste_management_leads_to_blockages_of_the_drainage_(6915329521).jpg) |
| RPT-21 | reporte-21-01.webp | Vaso con agua mineral fría transparente | Arria Belli | CC BY-SA 2.0 | [Wikimedia](https://commons.wikimedia.org/wiki/File:Glass_of_cold_mineral_water.jpg) |
| RPT-21 | reporte-21-02.webp | Vaso lleno de agua potable transparente | Adam Smith | CC BY 2.0 | [Wikimedia](https://commons.wikimedia.org/wiki/File:Drinkwater.jpg) |
| RPT-22 | reporte-22-01.webp | Vaso parcialmente lleno de agua clara | Derek Jensen (Tysto) | Dominio público | [Wikimedia](https://commons.wikimedia.org/wiki/File:Glass-of-water.jpg) |
| RPT-22 | reporte-22-02.webp | Vaso con líquido transparente e incoloro | Pakixa | CC BY-SA 4.0 | [Wikimedia](https://commons.wikimedia.org/wiki/File:DicWater.jpg) |
| RPT-23 | reporte-23-01.webp | Pozo residencial en propiedad privada | SAMI AZAROUK | CC BY-SA 4.0 | [Wikimedia](https://commons.wikimedia.org/wiki/File:A_home_well.jpg) |
| RPT-23 | reporte-23-02.webp | Pozo poco profundo cavado a mano, Mongolia | Carrie Wallestad | CC BY-SA 4.0 | [Wikimedia](https://commons.wikimedia.org/wiki/File:Shallow_hand_dug_well.JPG) |
| RPT-24 | reporte-24-01.webp | Detalle de vasos con agua clara | Pohled 111 | CC BY-SA 4.0 | [Wikimedia](https://commons.wikimedia.org/wiki/File:Glasses_of_water.jpg) |
| RPT-24 | reporte-24-02.webp | Vaso transparente con agua | Pratik Gupta | Unsplash License | [Unsplash](https://unsplash.com/photos/wwsekztDsJI) |
| RPT-25 | reporte-25-01.webp | Agua de un manantial natural | Koichi Oda | CC BY-SA 2.0 | [Wikimedia](https://commons.wikimedia.org/wiki/File:A_water_spring_-_Flickr_-_odako1.jpg) |
| RPT-25 | reporte-25-02.webp | Fuente de agua clara en movimiento | Uwe Karl Ullrich | CC BY-SA 4.0 | [Wikimedia](https://commons.wikimedia.org/wiki/File:Gesundheitsbrunnen.jpg) |
| RPT-26 | reporte-26-01.webp | Pequeño río brillante y limpio, Nepal | Nabin845 | CC BY-SA 4.0 | [Wikimedia](https://commons.wikimedia.org/wiki/File:A_small_river_sparkling.jpg) |
| RPT-26 | reporte-26-02.webp | Arroyo de aguas claras y rápidas | Alejandro1000 | CC BY-SA 3.0 | [Wikimedia](https://commons.wikimedia.org/wiki/File:Aguas_blancas.JPG) |
| RPT-27 | reporte-27-01.webp | Arroyo rodeado de vegetación, Nigeria | Juliegwen | CC BY-SA 4.0 | [Wikimedia](https://commons.wikimedia.org/wiki/File:African_stream_jpg.jpg) |
| RPT-27 | reporte-27-02.webp | Río claro atravesando un bosque denso | Marijan Sivric | Unsplash License | [Unsplash](https://unsplash.com/photos/a-clear-river-flows-through-a-lush-green-forest-ZxHbi4w4b38) |
| RPT-28 | reporte-28-01.webp | Arroyo limpio junto a edificio histórico, Escocia | Patjos.scot | CC0 1.0 | [Wikimedia](https://commons.wikimedia.org/wiki/File:Balmblae_Burn_Falkland.jpg) |
| RPT-28 | reporte-28-02.webp | Arroyo que riega tierras de cultivo, Nigeria | AfricanLibrarian | CC BY-SA 4.0 | [Wikimedia](https://commons.wikimedia.org/wiki/File:Akagwo_stream.jpg) |
| RPT-29 | reporte-29-01.webp | Arroyo de agua clara con flores en la orilla | ConstantinRGW | CC BY-SA 4.0 | [Wikimedia](https://commons.wikimedia.org/wiki/File:Bach_mit_Blumen.jpg) |
| RPT-29 | reporte-29-02.webp | Delta de río glacial limpio, Parque Nacional Sarek | Mg-k | CC BY-SA 3.0 | [Wikimedia](https://commons.wikimedia.org/wiki/File:Sarek_Skierffe_Rapadelta.jpg) |
| RPT-30 | reporte-30-01.webp | Canal de agua abierto y limpio, Budapest | Globetrotter19 | CC BY-SA 3.0 | [Wikimedia](https://commons.wikimedia.org/wiki/File:Uncovered_water_canal_in_Irh%C3%A1s-%C3%A1rok._-_Csilleb%C3%A9rc,_Budapest.JPG) |
| RPT-30 | reporte-30-02.webp | Tramo cubierto del mismo canal, Budapest | Globetrotter19 | CC BY-SA 3.0 | [Wikimedia](https://commons.wikimedia.org/wiki/File:Covered_water_canal_in_Irh%C3%A1s-%C3%A1rok._-_Csilleb%C3%A9rc,_Budapest.JPG) |

### Justificación de correspondencia con cada reporte

Las imágenes de los reportes 1-15 (riesgo alto/medio) muestran turbidez,
capas aceitosas, espuma, algas, residuos sólidos o canales/desagües
degradados, en línea con el color/olor reportado (oscuro, amarronado, verde,
con residuos). Las imágenes de los reportes 16 y 20 (riesgo bajo, indicio de
color) muestran espuma o drenajes con turbidez leve, coherente con un
indicio visual aislado y de baja magnitud. Las imágenes de los reportes 17 y
19 (riesgo bajo, indicio de olor/sabor no visible) muestran agua de aspecto
claro, coherente con que el color reportado es "Normal / sin cambios". Las
imágenes de los reportes 21-30 (sin indicios) muestran agua transparente en
recipientes, pozos, manantiales y arroyos de aspecto limpio, sin espuma,
residuos ni descargas visibles.

No se reutiliza ninguna imagen en más de un reporte.

## Validaciones aplicadas antes de persistir

`prisma/seed-reportes.ts` valida, antes de tocar la base de datos:

- Exactamente 30 reportes, con 30 teléfonos únicos.
- Exactamente 7 riesgo alto, 8 riesgo medio, 5 riesgo bajo, 10 sin indicios.
- Cada reporte responde las 6 preguntas no-FOTO con una opción que
  pertenece realmente a esa pregunta (según `seed-encuesta-agua.ts`).
- Cada reporte tiene al menos 2 imágenes; ningún archivo de imagen se repite
  entre reportes; el archivo local existe en disco (si falta, indica que hay
  que correr antes `npm run seed:reportes:images`).
- Coordenadas dentro del rango del Acuífero Patiño.
- `riesgoScore` entero 0-5 y coherente con la categoría del reporte.

Si alguna validación falla, el seed aborta con un mensaje detallado antes de
crear cualquier registro.
