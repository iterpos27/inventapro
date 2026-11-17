# Railway con base de datos en Supabase

Railway seguira alojando la aplicacion y Supabase alojara PostgreSQL. El backend se conecta directamente con `pg`; no necesita `@supabase/supabase-js`, la URL publica ni las claves `anon` o `service_role`.

## 1. Revisar capacidad

Antes de migrar, consulta el tamano actual en PostgreSQL de Railway:

```sql
SELECT pg_size_pretty(pg_database_size(current_database())) AS database_size;
```

El plan gratuito de Supabase admite hasta 500 MB de base de datos y pasa a modo de solo lectura al superar esa cuota. Para una base mayor o de produccion, usa un plan con capacidad suficiente.

## 2. Crear la conexion

1. Crea el proyecto en Supabase, preferiblemente en una region cercana a Railway.
2. En **Connect**, copia la URI de **Session pooler** (puerto `5432`). Es la opcion adecuada para este proceso Node persistente y funciona sobre IPv4.
3. No uses la URI de Transaction pooler del puerto `6543` para este despliegue.
4. Conserva la clave de la base solo en variables protegidas. Si la escribes manualmente dentro de una URI, codifica caracteres especiales; es mas seguro copiar la URI que entrega Supabase.

Variables del servicio de Railway:

```env
DATABASE_URL=postgresql://postgres.PROJECT_REF:CLAVE@aws-REGION.pooler.supabase.com:5432/postgres
DATABASE_SSL=true
DATABASE_SSL_REJECT_UNAUTHORIZED=true
DATABASE_POOL_MAX=10
DATABASE_POOL_CONNECTION_TIMEOUT_MS=15000
```

No elimines todavia el PostgreSQL de Railway.

## 3. Migrar los datos existentes

Haz primero un respaldo. Desde una maquina que tenga `pg_dump` y `pg_restore`, usa la URL publica de Railway como origen y la URI **Session pooler** de Supabase como destino:

```powershell
pg_dump --format=custom --no-owner --no-acl --dbname="URL_PUBLICA_RAILWAY" --file="inventapro-railway.dump"
pg_restore --clean --if-exists --no-owner --no-acl --dbname="URL_SESSION_POOLER_SUPABASE" "inventapro-railway.dump"
```

`--clean` reemplaza objetos del esquema de destino. Ejecuta esta restauracion solo sobre el proyecto nuevo de Supabase, no sobre una base que contenga otros datos importantes.

Para evitar que se pierdan escrituras durante el cambio:

1. Programa una ventana breve de mantenimiento y deten temporalmente el servicio de la aplicacion en Railway.
2. Genera el `pg_dump` final y restauralo en Supabase.
3. Cambia `DATABASE_URL` y las variables SSL/pool en Railway.
4. Vuelve a desplegar o reinicia la aplicacion.

Al arrancar, InventaPro ejecuta solamente las migraciones SQL que falten.

## 4. Verificar antes de retirar Railway PostgreSQL

Comprueba `https://TU-DOMINIO.up.railway.app/health`. Debe responder correctamente y validar PostgreSQL. Luego revisa en la aplicacion:

- inicio de sesion;
- cantidades de usuarios, productos, agencias, tomas y conteos;
- creacion y guardado de un conteo de prueba;
- importacion y exportacion de Excel.

En Supabase puedes comparar conteos con:

```sql
SELECT 'usuarios' AS tabla, COUNT(*) FROM usuarios
UNION ALL SELECT 'productos', COUNT(*) FROM productos
UNION ALL SELECT 'agencias', COUNT(*) FROM agencias
UNION ALL SELECT 'tomas_fisicas', COUNT(*) FROM tomas_fisicas
UNION ALL SELECT 'conteos', COUNT(*) FROM conteos
UNION ALL SELECT 'conteo_detalle', COUNT(*) FROM conteo_detalle;
```

Manten la base anterior sin escrituras durante varios dias. Si aparece un problema, restaura en Railway el valor anterior de `DATABASE_URL` y reinicia el servicio. Elimina la base de Railway solo despues de validar y conservar un respaldo recuperable.

## 5. Respaldos

Para el workflow `PostgreSQL Backup`, cambia el secreto `DATABASE_PUBLIC_URL` de GitHub por una URI de Supabase apta para `pg_dump`. Supabase recomienda la conexion directa para tareas administrativas; si el entorno no tiene IPv6, la URI Session pooler tambien es compatible con `pg_dump`.
