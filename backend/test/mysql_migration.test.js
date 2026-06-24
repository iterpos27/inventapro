import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRow } from '../src/db/migrate-from-mysql.js';

test('normalizeRow convierte booleanos compatibles con PostgreSQL', () => {
  const usuario = normalizeRow('usuarios', { estado: 1, nombre: 'Operador' });
  const token = normalizeRow('api_tokens', { revocado: '0' });

  assert.equal(usuario.estado, true);
  assert.equal(token.revocado, false);
});
