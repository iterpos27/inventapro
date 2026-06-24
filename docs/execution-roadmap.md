# Roadmap de ejecucion InventaPro

Plan priorizado para cerrar los faltantes funcionales del proyecto y llevarlo a una operacion mas completa.

## Fase 1. Migracion de datos

Objetivo: cargar datos reales del sistema PHP/MySQL hacia PostgreSQL con un proceso repetible.

- Crear utilitario de migracion `backend/src/db/migrate-from-mysql.*` con mapeo explicito por tabla.
- Validar compatibilidad de usuarios, agencias, productos, tomas, asignaciones, conteos y detalle.
- Documentar prevalidaciones, orden de carga y verificaciones posteriores.
- Generar reporte final de filas importadas, omitidas y con error.

Criterio de salida:

- El proyecto puede cargarse desde un respaldo/exportacion MySQL sin pasos manuales sobre la base.
- Existe una guia reproducible para repetir la migracion en pruebas y produccion.

## Fase 2. Escaneo movil

Objetivo: acelerar el conteo con captura por camara o lector de codigo de barras.

- Integrar escaneo en la APK Flutter.
- Permitir buscar y agregar producto por codigo detectado.
- Resolver casos de producto no encontrado, duplicado y multiples coincidencias.
- Mantener el flujo manual actual como respaldo.

Criterio de salida:

- Un operador puede abrir una toma, escanear un codigo y agregar el producto sin escribirlo manualmente.

## Fase 3. Offline y sincronizacion

Objetivo: permitir trabajo estable con conectividad intermitente.

- Reemplazar el borrador local aislado por una cola de operaciones pendiente de sincronizar.
- Guardar altas, cambios y eliminaciones de lineas con versionado local.
- Reintentar sincronizacion al recuperar conexion.
- Mostrar estado claro: sincronizado, pendiente, con conflicto o con error.

Criterio de salida:

- El operador puede seguir contando sin red y el sistema sincroniza despues sin perder cambios.

## Fase 4. Auditoria operativa

Objetivo: dar visibilidad administrativa a lo que hoy solo vive en logs y base.

- Crear vista web para eventos de sistema.
- Mostrar cierres automaticos, errores de importacion, errores de consolidado, intentos fallidos y acciones sensibles.
- Agregar filtros por fecha, tipo de evento y entidad.
- Incluir consulta basica de sesiones activas o ultimos accesos.

Criterio de salida:

- Un administrador puede revisar eventos operativos sin entrar al servidor o a PostgreSQL.

## Fase 5. Reportes avanzados

Objetivo: ampliar los reportes desde control operativo a control gerencial.

- Diferencias por producto, agencia y toma.
- Avance por usuario y agencia.
- Pendientes, cerradas por fecha y productividad por operador.
- Exportaciones mas ricas para seguimiento y auditoria.

Criterio de salida:

- Los supervisores pueden responder avance, pendientes, productividad y diferencias sin construir reportes externos.

## Fase 6. Pulido UX y branding

Objetivo: cerrar coherencia visual y ergonomia de operacion.

- Completar branding global: logo, favicon, colores y consistencia entre login, panel y movil.
- Reducir pasos repetitivos en conteo.
- Mejorar feedback visual en guardado, finalizacion, reconexion y errores.
- Revisar densidad de texto, etiquetas y disposicion responsive.

Criterio de salida:

- El sistema se siente consistente, claro y rapido tanto en escritorio como en telefono.

## Fase 7. Tests y observabilidad

Objetivo: reducir regresiones y mejorar soporte en produccion.

- Agregar pruebas de integracion con PostgreSQL temporal para flujos criticos.
- Cubrir login, tomas, cierre automatico, guardado, finalizacion, historial y reportes.
- Incorporar pruebas E2E prioritarias para web y APK donde sea viable.
- Exponer metricas y chequeos operativos utiles para soporte.

Criterio de salida:

- Los flujos principales quedan protegidos por pruebas y el sistema ofrece senales claras ante fallos.

## Orden recomendado

1. Migracion de datos.
2. Escaneo movil.
3. Offline y sincronizacion.
4. Auditoria operativa.
5. Reportes avanzados.
6. Pulido UX y branding.
7. Tests y observabilidad.

## Areas del codigo que se tocaran

- `backend/src/routes`
- `backend/src/services`
- `backend/src/db`
- `frontend/src/views`
- `frontend/src/components`
- `mobile/lib`
- `docs`

## Nota de alcance

Este roadmap traduce los faltantes actuales del repo a fases de ejecucion. No implica que todas las fases deban entrar en un solo despliegue; conviene cerrar cada una con validacion funcional y subida independiente.
