import test from 'node:test';
import assert from 'node:assert/strict';
import { closeExpiredTomas, listUserCountHistory, upsertDetalle } from '../src/services/conteoService.js';
import { createRateLimiter } from '../src/middleware/rateLimit.js';

test('closeExpiredTomas intenta adquirir el lock advisory y maneja la base correctamente', async () => {
  let beginCalled = false;
  let commitCalled = false;
  let rollbackCalled = false;
  let advisoryLockChecked = false;
  let queryCount = 0;

  const mockPool = {
    connect: async () => mockClient,
  };
  const mockClient = {
    release: () => {},
    query: async (sql) => {
      queryCount += 1;
      if (sql === 'BEGIN') {
        beginCalled = true;
        return { rowCount: 0, rows: [] };
      }
      if (sql === 'COMMIT') {
        commitCalled = true;
        return { rowCount: 0, rows: [] };
      }
      if (sql === 'ROLLBACK') {
        rollbackCalled = true;
        return { rowCount: 0, rows: [] };
      }
      if (sql.includes('pg_try_advisory_xact_lock')) {
        advisoryLockChecked = true;
        return { rowCount: 1, rows: [{ pg_try_advisory_xact_lock: true }] };
      }
      if (sql.includes('SELECT id FROM tomas_fisicas')) {
        return { rowCount: 0, rows: [] };
      }
      return { rowCount: 0, rows: [] };
    }
  };

  await closeExpiredTomas(mockPool);

  assert.equal(beginCalled, true);
  assert.equal(commitCalled, true);
  assert.equal(advisoryLockChecked, true);
  assert.equal(rollbackCalled, false);
});

test('closeExpiredTomas retorna inmediatamente si el advisory lock es denegado', async () => {
  let beginCalled = false;
  let rollbackCalled = false;
  let queryCount = 0;

  const mockPool = {
    connect: async () => mockClient,
  };
  const mockClient = {
    release: () => {},
    query: async (sql) => {
      queryCount += 1;
      if (sql === 'BEGIN') {
        beginCalled = true;
      }
      if (sql === 'ROLLBACK') {
        rollbackCalled = true;
      }
      if (sql.includes('pg_try_advisory_xact_lock')) {
        return { rowCount: 1, rows: [{ pg_try_advisory_xact_lock: false }] };
      }
      return { rowCount: 0, rows: [] };
    }
  };

  await closeExpiredTomas(mockPool);

  assert.equal(beginCalled, true);
  assert.equal(rollbackCalled, true);
  assert.equal(queryCount, 3);
});

test('closeExpiredTomas no intenta abrir otra transaccion cuando recibe un cliente activo', async () => {
  let beginCalled = false;
  let releaseCalled = false;
  let advisoryLockChecked = false;

  const activeClient = {
    release: () => {
      releaseCalled = true;
    },
    query: async (sql) => {
      if (sql === 'BEGIN') {
        beginCalled = true;
      }
      if (sql.includes('pg_try_advisory_xact_lock')) {
        advisoryLockChecked = true;
        return { rowCount: 1, rows: [{ pg_try_advisory_xact_lock: true }] };
      }
      if (sql.includes('SELECT id FROM tomas_fisicas')) {
        return { rowCount: 0, rows: [] };
      }
      return { rowCount: 0, rows: [] };
    }
  };

  await closeExpiredTomas(activeClient, 1);

  assert.equal(beginCalled, false);
  assert.equal(releaseCalled, false);
  assert.equal(advisoryLockChecked, true);
});

test('listUserCountHistory incluye asignaciones cerradas aunque no tengan conteo', async () => {
  let capturedSql = '';
  let capturedParams = [];
  const mockDb = {
    query: async (sql, params) => {
      capturedSql = sql;
      capturedParams = params;
      return {
        rows: [{
          id: -7,
          conteo_id: null,
          estado: 'pendiente',
          numero_toma: '2026-001',
          lineas: 0,
          unidades: '0'
        }]
      };
    }
  };

  const rows = await listUserCountHistory(mockDb, 23, 30);

  assert.equal(capturedParams[0], 23);
  assert.equal(capturedParams[1], 30);
  assert.match(capturedSql, /FROM toma_usuarios tu/);
  assert.match(capturedSql, /OR t\.estado = 'finalizada'/);
  assert.equal(rows[0].estado, 'pendiente');
  assert.equal(rows[0].conteo_id, null);
});

test('rateLimiter en memoria restringe peticiones excedidas', async () => {
  const limiter = createRateLimiter({ windowMs: 1000, max: 2, keyPrefix: 'test-ip' });
  let nextCalledTimes = 0;
  let resHeaders = {};
  let lastError = null;

  const req = { ip: '127.0.0.1' };
  const res = {
    setHeader: (name, val) => {
      resHeaders[name] = val;
    }
  };
  const next = (err) => {
    if (err) lastError = err;
    nextCalledTimes += 1;
  };

  await limiter(req, res, next);
  await limiter(req, res, next);
  await limiter(req, res, next);

  assert.equal(nextCalledTimes, 3);
  assert.notEqual(lastError, null);
  assert.equal(lastError.status, 429);
  assert.equal(resHeaders['Retry-After'], '1');
});

test('upsertDetalle agrupa productos y guarda en bloque para cargas grandes', async () => {
  const queries = [];
  const mockDb = {
    query: async (sql, params = []) => {
      queries.push({ sql, params });
      if (sql.includes('SELECT id, codigo, descripcion FROM productos')) {
        return {
          rows: [
            { id: 10, codigo: 'P-10', descripcion: 'Producto 10' },
            { id: 11, codigo: 'P-11', descripcion: 'Producto 11' }
          ]
        };
      }
      return { rows: [], rowCount: 0 };
    }
  };

  const lineas = await upsertDetalle(
    mockDb,
    77,
    [
      { producto_id: 10, cantidad: 5 },
      { producto_id: 11, cantidad: 3 },
      { producto_id: 10, cantidad: 7 },
      { producto_id: 0, cantidad: 9 },
      { producto_id: 12, cantidad: 0 }
    ],
    [{ producto_id: 99 }, { producto_id: 99 }, { producto_id: 100 }]
  );

  assert.equal(lineas, 2);
  assert.equal(queries.length, 3);
  assert.match(queries[0].sql, /DELETE FROM conteo_detalle/);
  assert.deepEqual(queries[0].params[1], [99, 100]);
  assert.match(queries[1].sql, /SELECT id, codigo, descripcion FROM productos/);
  assert.deepEqual(queries[1].params[0], [10, 11]);
  assert.match(queries[2].sql, /INSERT INTO conteo_detalle/);
  assert.deepEqual(queries[2].params[1], [10, 11]);
  assert.deepEqual(queries[2].params[4], [7, 3]);
});
