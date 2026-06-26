# Analisis de escalabilidad inicial

Escenario revisado:

- 50 usuarios concurrentes entrando a Inventapro.
- 1 toma con hasta 500 productos por conteo.
- Guardado periodico de borradores y finalizacion de conteos desde web y APK.

## Base del analisis

Este analisis se apoya en la revision del flujo real del repo y en mejoras aplicadas sobre el backend. No sustituye una prueba de carga con base y red de produccion, pero si identifica el comportamiento esperado y los cuellos de botella mas probables.

## Hallazgo principal corregido

Antes, el guardado de detalle hacia `conteo_detalle` hacia:

- 1 eliminacion inicial;
- 1 `SELECT` por producto;
- 1 `INSERT ... ON CONFLICT` por producto.

Con 500 productos, un solo guardado podia disparar mas de 1000 consultas SQL. Bajo 50 usuarios concurrentes, ese patron elevaba mucho el tiempo de respuesta y el uso de CPU/IO en PostgreSQL.

Ahora el backend guarda en bloque:

- borrado por lote usando `ANY(...)`;
- lectura de productos validos en una sola consulta;
- insercion/actualizacion masiva con `UNNEST(...)`.

Esto reduce drasticamente la cantidad de round-trips a base de datos por guardado.

## Comportamiento esperado con 50 usuarios y 500 productos

### 1. Inicio de sesion y carga de tomas

Comportamiento esperado: estable.

Motivo:

- consultas simples;
- indices ya presentes sobre usuarios, conteos y asignaciones;
- poca carga por usuario en este punto.

Riesgo principal:

- picos simultaneos de login con latencia de red o DB lenta.

### 2. Busqueda de productos

Comportamiento esperado: bueno si el catalogo no es excesivamente grande.

Motivo:

- existe limitador por ruta;
- el frontend y la APK reducen llamadas innecesarias;
- hay indices trigram para `codigo` y `descripcion`.

Riesgo principal:

- catalogos muy grandes con muchas busquedas parciales concurrentes.

### 3. Guardado de borrador con 500 productos

Comportamiento esperado despues de la optimizacion: razonable y mucho mejor que antes.

Motivo:

- el backend ahora opera por lotes;
- el frontend ya limita renders visibles;
- la APK usa persistencia local y sincronizacion.

Riesgo principal:

- el flujo de web y APK sigue enviando el estado completo del conteo cuando se usa reemplazo total del detalle;
- si 50 usuarios guardan casi al mismo tiempo, la carga pasa de ser "muchas consultas pequenas" a "menos consultas, pero con payloads grandes".

### 4. Finalizacion de conteo

Comportamiento esperado: correcto.

Motivo:

- usa transaccion;
- actualiza estado, version y resumen.

Riesgo principal:

- varias finalizaciones simultaneas sobre la misma toma pueden concentrar trabajo en `refreshTomaSummary`.

## Cuellos de botella que aun pueden aparecer

1. Reemplazo total del detalle en cada guardado masivo.
2. Recalculo completo de `toma_resumen` al finalizar.
3. Multiples clientes enviando payloads grandes al mismo tiempo.
4. Dependencia de una sola base PostgreSQL sin cache distribuido real para sesiones o busquedas.

## Mejoras ya aplicadas que ayudan a este escenario

- guardado masivo en `conteo_detalle`;
- mejor priorizacion de busqueda para web y APK;
- mejoras de UX para evitar operaciones innecesarias;
- resumen visual de sincronizacion en movil;
- autoagregado en coincidencias exactas para reducir pasos.

## Recomendaciones siguientes si se quiere subir mas la capacidad

1. Pasar de "reemplazo total" a sincronizacion diferencial tambien en web.
2. Medir tiempos reales con una prueba de carga sobre Railway/PostgreSQL.
3. Agregar metricas de tiempo por ruta:
   - login
   - busqueda de productos
   - guardar borrador
   - finalizar conteo
4. Evaluar paginacion o virtualizacion adicional si en web se muestran mas de 500 lineas visibles.
5. Ajustar `JSON_LIMIT` y revisar tamano real del payload de 500 productos.

## Conclusion

Para el escenario planteado, Inventapro queda en una posicion mucho mejor que antes del ajuste de guardado por lotes. El sistema deberia soportar mucho mejor una toma de 500 productos por usuario, pero la validacion definitiva debe hacerse con prueba de carga real sobre el entorno desplegado.
