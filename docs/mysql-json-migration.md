# Migracion desde exportacion MySQL JSON

El comando `npm run migrate:mysql --prefix backend` permite importar datos reales desde una carpeta con archivos JSON exportados desde el sistema MySQL anterior.

## Carpeta esperada

La ruta por defecto es `migration/mysql-export`. Tambien puede definirse con:

```powershell
$env:MYSQL_EXPORT_DIR="C:\ruta\de\exportacion"
npm run migrate:mysql --prefix backend
```

Archivos soportados:

- `usuarios.json`
- `productos.json`
- `agencias.json`
- `tomas_fisicas.json`
- `toma_usuarios.json`
- `conteos.json`
- `conteo_detalle.json`
- `api_tokens.json`
- `login_attempts.json`

Cada archivo debe contener un arreglo JSON de filas.

## Opciones

```powershell
npm run migrate:mysql --prefix backend -- --dry-run
npm run migrate:mysql --prefix backend -- --truncate
npm run migrate:mysql --prefix backend -- --source=C:\ruta\de\exportacion
```

- `--dry-run`: valida lectura y prepara el reporte sin escribir en PostgreSQL.
- `--truncate`: vacia las tablas soportadas antes de importar.
- `--source=...`: usa una carpeta distinta a la predeterminada.

## Resultado

El comando devuelve un reporte JSON con:

- tabla
- insertados
- omitidos
- errores
- tablas omitidas por falta de archivo

Si alguna insercion falla, la transaccion se revierte.
