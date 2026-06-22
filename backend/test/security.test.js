import test from 'node:test';
import assert from 'node:assert/strict';
import { roleCan } from '../src/utils/roles.js';
import { sessionVersionMatches } from '../src/utils/session.js';

test('la matriz de roles no concede administracion a reportes ni operadores', () => {
  assert.equal(roleCan('admin', 'admin'), true);
  assert.equal(roleCan('reportes', 'reports'), true);
  assert.equal(roleCan('reportes', 'admin'), false);
  assert.equal(roleCan('usuario', 'count'), true);
  assert.equal(roleCan('usuario', 'reports'), false);
  assert.equal(roleCan('operador', 'api_count'), true);
});

test('la version de autenticacion invalida sesiones anteriores', () => {
  assert.equal(sessionVersionMatches(undefined, 0), true);
  assert.equal(sessionVersionMatches(2, 2), true);
  assert.equal(sessionVersionMatches(1, 2), false);
});
