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

## Falta conectar o pulir en frontend

- Formularios completos para crear/editar/eliminar tomas desde el panel.
- Pantalla de detalle de toma con participantes, asignacion, cierre/reapertura, reutilizacion y habilitar conteo por usuario.
- Edicion/desactivacion visual de productos, agencias y usuarios.
- Pantalla de reportes con filtros por rango/estado y descarga de consolidado.
- Configuracion del sistema para logo/branding.
- Historial de conteos para usuarios no administradores.

## Pendiente tecnico

- Migrador de datos MySQL -> PostgreSQL para cargar datos reales.
- Pruebas automatizadas de flujos criticos.
- Revision final de permisos por rol en cada pantalla.
