# Analisis de escalabilidad inicial

Escenario revisado:

- 20 a 25 usuarios concurrentes entrando a Inventapro.
- 1 toma con hasta 500 productos por conteo.
- Guardado periodico de borradores y finalizacion de conteos desde web y web movil.

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

## Validacion local web/web movil

Ultima corrida local:

- comando: `npm run loadtest:web`;
- usuarios concurrentes: 25;
- productos por usuario: 600;
- lineas finales registradas: 14250 de 14250 esperadas;
- conteos finalizados: 25 de 25;
- fallos: 0.

Tiempos observados:

- login: p95 6004.5 ms;
- iniciar conteo: p95 384.3 ms;
- guardado inicial de 600 lineas: p95 1148.3 ms;
- guardado diferencial de 90 cambios: p95 351.0 ms;
- finalizacion de 570 lineas: p95 1740.7 ms.

La prueba usa los endpoints reales de `/api/admin`, crea datos temporales y los limpia al terminar.

## Comportamiento esperado con 20-25 usuarios y 500 productos

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

- la finalizacion sigue enviando el estado completo del conteo;
- si 25 usuarios finalizan casi al mismo tiempo, la carga pasa de ser "muchas consultas pequenas" a "menos consultas, pero con payloads grandes".

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
4. Login simultaneo: bcrypt puede llevar el p95 cerca de 6 segundos si los 25 usuarios entran al mismo tiempo exacto.

## Mejoras ya aplicadas que ayudan a este escenario

- guardado masivo en `conteo_detalle`;
- mejor priorizacion de busqueda para web y APK;
- mejoras de UX para evitar operaciones innecesarias;
- guardado diferencial en web/web movil;
- proteccion contra cambios hechos mientras un autoguardado esta en curso;
- autoagregado en coincidencias exactas para reducir pasos.

## Recomendaciones siguientes si se quiere subir mas la capacidad

1. Medir tiempos reales con una prueba de carga sobre Railway/PostgreSQL.
2. Pedir que los usuarios inicien sesion unos minutos antes del conteo si se usara un equipo modesto.
3. Agregar metricas de tiempo por ruta:
   - login
   - busqueda de productos
   - guardar borrador
   - finalizar conteo
4. Evaluar paginacion o virtualizacion adicional si en web se muestran mas de 500 lineas visibles.
5. Ajustar `JSON_LIMIT` y revisar tamano real del payload de 500 productos.

## Conclusion

Para el escenario planteado, Inventapro queda en una posicion apta para una prueba real controlada con 20-25 usuarios en web/web movil. La corrida local ya valido el flujo completo con 25 usuarios y 600 productos por usuario. La validacion definitiva debe repetirse sobre el entorno y la red donde se ejecutara el inventario.
