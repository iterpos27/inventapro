# Respaldo y restauracion de PostgreSQL

El workflow `PostgreSQL Backup` genera cada dia un `pg_dump` cifrado y permite ejecucion manual desde GitHub Actions.
Si los secretos no estan configurados, el workflow ahora se omite de forma segura y no debe fallar.

## Configuracion inicial

Agrega estos secretos en GitHub, en `Settings > Secrets and variables > Actions`:

- `DATABASE_PUBLIC_URL`: URL publica de PostgreSQL entregada por Railway.
- `BACKUP_ENCRYPTION_PASSWORD`: clave larga y exclusiva para cifrar los respaldos.

Conserva la clave de cifrado fuera de GitHub. Los artefactos se retienen 14 dias y no contienen una copia sin cifrar.

## Comportamiento sin configuracion

Si todavia no agregas los secretos:

- no se sube ningun respaldo al repositorio;
- no se genera ningun artefacto;
- el workflow termina en modo omitido, sin intentar conectarse a Railway.

## Restauracion

Descarga el artefacto requerido y ejecuta:

```powershell
openssl enc -d -aes-256-cbc -pbkdf2 -in inventapro-YYYYMMDDTHHMMSSZ.dump.enc -out inventapro.dump
pg_restore --clean --if-exists --no-owner --no-acl --dbname="DATABASE_URL_DESTINO" inventapro.dump
```

Restaura primero sobre una base de datos de prueba. Verifica usuarios, productos, tomas, conteos y detalle antes de reemplazar produccion.
