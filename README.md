# InventaPro PERN

Migracion de `centro_ruliman_inventario` desde PHP/MySQL a PERN:

- PostgreSQL para datos.
- Express para API y autenticacion.
- React + Vite para panel web responsive inspirado en TailAdmin.
- Compatibilidad con la APK en `/api/v1/*`.

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

## Rutas compatibles con APK

Las rutas moviles del PHP se conservan bajo `/api/v1`:

- `POST /api/v1/login`
- `POST /api/v1/logout`
- `GET /api/v1/tomas`
- `POST /api/v1/iniciar_conteo`
- `GET /api/v1/detalle_conteo?conteo_id=1`
- `GET /api/v1/productos?q=texto`
- `POST /api/v1/guardar_borrador`
- `POST /api/v1/guardar_cambios`
- `POST /api/v1/finalizar_conteo`

Tambien se montan en `/api/*` para compatibilidad web.

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

