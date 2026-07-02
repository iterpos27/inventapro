# InventaPro PERN

Migracion de `centro_ruliman_inventario` desde PHP/MySQL a PERN:

- PostgreSQL para datos.
- Express para API y autenticacion.
- React + Vite para panel web responsive inspirado en TailAdmin.
- App web responsive y app movil Flutter de operacion para usuarios.
- Importacion y exportacion Excel con `exceljs`, sin depender de `xlsx`.

## Requisitos

- Node.js 22.
- PostgreSQL 14 o superior.

## Instalacion local

```powershell
npm run install:all
Copy-Item backend\.env.example backend\.env
```

Edita `backend\.env`:

```env
DATABASE_URL=postgres://postgres:postgres@localhost:5432/inventapro
JWT_SECRET=cambia_este_valor
JWT_EXPIRES_IN=8h
FRONTEND_URL=http://localhost:5173
TRUST_PROXY=false
ENABLE_MOBILE_API=true
JSON_LIMIT=2mb
APP_SEED_ADMIN_USER=admin
APP_SEED_ADMIN_PASSWORD=Administrador123!
```

Crea la base:

```sql
CREATE DATABASE inventapro;
```

Ejecuta migracion y semilla:

```powershell
npm run migrate
npm run seed
```

Levanta backend y frontend:

```powershell
npm run dev
npm run dev:frontend
```

Backend: `http://localhost:4000`

Frontend: `http://localhost:5173`

## App movil Flutter

La carpeta `mobile` contiene la app de operacion para usuarios de conteo. No incluye administracion, productos, agencias ni reportes.

Para usarla, habilita las rutas moviles en el backend:

```env
ENABLE_MOBILE_API=true
```

Las rutas moviles se exponen bajo `/api/v1`:

- `POST /api/v1/login`
- `POST /api/v1/logout`
- `GET /api/v1/tomas`
- `POST /api/v1/iniciar_conteo`
- `GET /api/v1/detalle_conteo?conteo_id=1`
- `GET /api/v1/productos?q=texto`
- `POST /api/v1/guardar_borrador`
- `POST /api/v1/guardar_cambios`
- `POST /api/v1/finalizar_conteo`

Tambien se montan en `/api/*` solo cuando `ENABLE_MOBILE_API=true`.

Ejecutar en Android emulador:

```powershell
cd mobile
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:4000/api/v1
```

Ejecutar en telefono fisico Android o iPhone en la misma red:

```powershell
cd mobile
flutter run --dart-define=API_BASE_URL=http://IP_DE_TU_PC:4000/api/v1
```

Para produccion se recomienda exponer el backend por HTTPS y compilar con esa URL:

```powershell
flutter build apk --release --dart-define=API_BASE_URL=https://tu-dominio.com/api/v1
```

La compilacion `release` ya no usa la clave de depuracion. Antes de generarla:

1. Crea y respalda `mobile/android/inventapro-release.jks` con `keytool`.
2. Copia `mobile/android/key.properties.example` como `mobile/android/key.properties` y completa sus credenciales.
3. Conserva ambos archivos fuera de Git; sin esa clave no se pueden publicar actualizaciones sobre la misma instalacion.

## Flujos Excel portados

El backend incluye endpoints protegidos con JWT para reemplazar los flujos PHP de PhpSpreadsheet:

- `POST /api/admin/productos/import`: importa `.xlsx` o `.csv` con columnas `codigo` y `descripcion`.
- `GET /api/admin/conteos/:id/excel`: descarga detalle de conteo finalizado con columnas `Codigo`, `Descripcion`, `Cantidad`, `Usuario`.
- `POST /api/admin/tomas/:id/consolidado`: genera consolidado de toma por usuario.
- `GET /api/admin/tomas/:id/consolidado`: descarga el consolidado.

Los archivos temporales y exportados se guardan en `backend/storage`, carpeta ignorada por git.

## Migracion de datos desde MySQL

El esquema PostgreSQL esta en `backend/src/db/migrations/001_init.sql`.
Para migrar datos reales desde el PHP actual, exporta las tablas MySQL y cargalas respetando nombres equivalentes:

- `usuarios`
- `productos`
- `agencias`
- `tomas_fisicas`
- `toma_usuarios`
- `conteos`
- `conteo_detalle`
- `api_tokens`
- `login_attempts`

Los hashes de password PHP generados por `password_hash` se validan con `bcrypt`, por lo que se pueden conservar.

Tambien existe un importador desde exportaciones JSON por tabla:

```powershell
npm run migrate:mysql --prefix backend -- --dry-run
```

La estructura esperada y sus opciones estan en `docs/mysql-json-migration.md`.

## Despliegue en Railway

El repositorio esta preparado para desplegarse como un unico servicio: Express sirve la API y tambien el frontend compilado. El arranque ejecuta las migraciones pendientes y crea el administrador inicial solo si todavia no existe.

1. Sube el repositorio a GitHub y crea un proyecto en Railway desde ese repositorio.
2. Agrega un servicio PostgreSQL al mismo proyecto.
3. En el servicio de InventaPro configura estas variables:

```env
NODE_ENV=production
DATABASE_URL=${{Postgres.DATABASE_URL}}
JWT_SECRET=un_secreto_aleatorio_de_al_menos_32_caracteres
JWT_EXPIRES_IN=8h
TRUST_PROXY=true
ENABLE_MOBILE_API=true
JSON_LIMIT=2mb
APP_TIMEZONE=America/Guayaquil
TOMA_CLOSE_INTERVAL_MS=60000
APP_SEED_ADMIN_USER=admin
APP_SEED_ADMIN_PASSWORD=una_clave_segura_de_al_menos_12_caracteres
```

Railway proporciona `PORT` y `RAILWAY_PUBLIC_DOMAIN`; no hace falta definirlos. `railway.json` contiene el build, el comando de inicio, el health check `/health` y la politica de reinicio.

`/health` valida tambien la conexion con PostgreSQL y devuelve `503` si la base no esta disponible. `/live` permite comprobar solamente que el proceso Node continua activo.

Despues del primer despliegue, genera un dominio publico en **Settings > Networking**. El panel queda en la raiz del dominio y la app movil debe compilarse apuntando a:

```powershell
flutter build apk --release --dart-define=API_BASE_URL=https://TU-DOMINIO.up.railway.app/api/v1
```

Los archivos Excel de `backend/storage` son temporales. Railway puede eliminarlos al reiniciar el contenedor; los datos de inventario permanecen en PostgreSQL.

## Respaldo automatizado

El workflow de GitHub `PostgreSQL Backup` puede crear diariamente un respaldo cifrado con retencion de 14 dias. Solo se activa cuando existe el secreto `ENABLE_DATABASE_BACKUP=true` y tambien estan configurados `DATABASE_PUBLIC_URL` y `BACKUP_ENCRYPTION_PASSWORD`. Si falta alguno, el workflow se omite sin fallar. La configuracion y restauracion estan documentadas en `docs/backup-and-restore.md`.

## Roadmap

El plan priorizado para completar los faltantes funcionales del proyecto esta documentado en `docs/execution-roadmap.md`.
