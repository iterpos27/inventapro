import test from 'node:test';
import assert from 'node:assert/strict';
import { closeExpiredTomas, listUserCountHistory } from '../src/services/conteoService.js';
import { createRateLimiter } from '../src/middleware/rateLimit.js';

test('closeExpiredTomas intenta adquirir el lock advisory y maneja la base correctamente', async () => {
  let beginCalled = false;
  let commitCalled = false;
  let rollbackCalled = false;
  let advisoryLockChecked = false;
  let queryCount = 0;

  const mockDbClient = {
    connect: () => mockDbClient,
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

  await closeExpiredTomas(mockDbClient);

  assert.equal(beginCalled, true);
  assert.equal(commitCalled, true);
  assert.equal(advisoryLockChecked, true);
  assert.equal(rollbackCalled, false);
});

test('closeExpiredTomas retorna inmediatamente si el advisory lock es denegado', async () => {
  let beginCalled = false;
  let rollbackCalled = false;
  let queryCount = 0;

  const mockDbClient = {
    connect: () => mockDbClient,
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

  await closeExpiredTomas(mockDbClient);

  assert.equal(beginCalled, true);
  assert.equal(rollbackCalled, true);
  assert.equal(queryCount, 3);
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
