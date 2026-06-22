# Paridad funcional PHP -> PERN

Estado de migracion funcional frente al PHP activo de `centro_ruliman_inventario`.

## Ya portado

- Autenticacion web con roles.
- Dashboard administrativo con metricas reales.
- Productos: listar, buscar, crear, editar, desactivar, importar Excel/CSV.
- Agencias: listar, crear, editar, desactivar.
- Usuarios: listar, crear, editar, desactivar.
- Tomas fisicas: listar, crear con numeracion anual, editar, eliminar si no tiene detalle, cerrar, reabrir, asignar usuarios, reutilizar toma, ver detalle.
- Conteo web/web-movil: tomas asignadas, iniciar conteo, buscar productos, guardar borrador, finalizar.
- Reportes Excel: detalle de conteo y consolidado por toma.
- Frontend de tomas: crear, editar, eliminar, ver detalle, asignar usuarios, cerrar/reabrir, reutilizar, consolidado y habilitar conteo de usuario.
- Frontend de administracion: editar/desactivar/reactivar productos, agencias y usuarios.
- Historial de conteos del operador en web y APK.
- Reportes con filtros por rango y estado, detalle y descarga de consolidado.
- Cambio de contrasena, validacion de sesion y cierre de todas las sesiones.

## Falta conectar o pulir en frontend

- Configuracion del sistema para logo/branding.

## Pendiente tecnico

- Migrador de datos MySQL -> PostgreSQL para cargar datos reales.
- Ampliar las pruebas de integracion contra una base PostgreSQL temporal.
