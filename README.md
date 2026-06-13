# InventaPro PERN

Migracion de `centro_ruliman_inventario` desde PHP/MySQL a PERN:

- PostgreSQL para datos.
- Express para API y autenticacion.
- React + Vite para panel web responsive inspirado en TailAdmin.
- API web responsive. La API movil heredada queda desactivada por defecto.
- Importacion y exportacion Excel con `exceljs`, sin depender de `xlsx`.

## Requisitos

- Node.js 20 o superior.
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
ENABLE_MOBILE_API=false
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

## API movil heredada

El proyecto actual se usa como web y web movil. Por seguridad, las rutas moviles heredadas no se montan a menos que se configure:

```env
ENABLE_MOBILE_API=true
```

Si se habilitan, las rutas moviles se exponen bajo `/api/v1`:

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
