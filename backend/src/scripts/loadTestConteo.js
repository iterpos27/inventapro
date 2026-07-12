import bcrypt from 'bcryptjs';
import { performance } from 'node:perf_hooks';
import { app } from '../app.js';
import { pool } from '../db/pool.js';

const USER_COUNT = Number(process.env.LOADTEST_USERS || 25);
const ITEM_COUNT = Number(process.env.LOADTEST_ITEMS || 600);
const PASSWORD = process.env.LOADTEST_PASSWORD || 'LoadTest123';
const prefix = `LT${Date.now()}`;

function nowIso() {
  return new Date().toISOString();
}

function timeLabel(value) {
  return `${value.toFixed(1)} ms`;
}

async function requestJson(baseUrl, path, options = {}) {
  const started = performance.now();
  const response = await fetch(`${baseUrl}${path}`, options);
  const duration = performance.now() - started;
  const data = await response.json().catch(() => ({ ok: false, message: 'Respuesta invalida' }));
  if (!response.ok || data.ok === false) {
    const error = new Error(data.message || `HTTP ${response.status}`);
    error.status = response.status;
    error.duration = duration;
    throw error;
  }
  return { data, duration };
}

async function cleanupScenario() {
  await pool.query(
    `DELETE FROM conteo_detalle
     WHERE conteo_id IN (
       SELECT c.id
       FROM conteos c
       INNER JOIN tomas_fisicas t ON t.id = c.toma_id
       WHERE t.numero_toma LIKE $1
     )`,
    [`${prefix}%`]
  );
  await pool.query('DELETE FROM conteos WHERE toma_id IN (SELECT id FROM tomas_fisicas WHERE numero_toma LIKE $1)', [`${prefix}%`]);
  await pool.query('DELETE FROM toma_usuarios WHERE toma_id IN (SELECT id FROM tomas_fisicas WHERE numero_toma LIKE $1)', [`${prefix}%`]);
  await pool.query('DELETE FROM tomas_fisicas WHERE numero_toma LIKE $1', [`${prefix}%`]);
  await pool.query('DELETE FROM usuarios WHERE usuario LIKE $1', [`${prefix.toLowerCase()}_%`]);
  await pool.query('DELETE FROM productos WHERE codigo LIKE $1', [`${prefix}-%`]);
}

async function prepareScenario() {
  await cleanupScenario();
  const admin = await pool.query("SELECT id FROM usuarios WHERE rol = 'admin' AND estado = TRUE ORDER BY id LIMIT 1");
  if (!admin.rows[0]) {
    throw new Error('No existe un usuario admin activo para preparar la simulacion.');
  }
  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const userRows = [];
  for (let index = 1; index <= USER_COUNT; index += 1) {
    userRows.push({
      nombre: `Load User ${index}`,
      usuario: `${prefix.toLowerCase()}_${String(index).padStart(2, '0')}`,
      ip: `10.50.0.${index}`
    });
  }
  const userNames = userRows.map((item) => item.nombre);
  const userLogins = userRows.map((item) => item.usuario);
  const userPasswords = userRows.map(() => passwordHash);
  await pool.query(
    `INSERT INTO usuarios (nombre, usuario, password, rol, estado)
     SELECT *
     FROM UNNEST($1::text[], $2::text[], $3::text[], $4::user_role[], $5::boolean[])`,
    [userNames, userLogins, userPasswords, userRows.map(() => 'usuario'), userRows.map(() => true)]
  );
  const users = await pool.query(
    'SELECT id, nombre, usuario FROM usuarios WHERE usuario = ANY($1::text[]) ORDER BY usuario',
    [userLogins]
  );

  const productCodes = [];
  const productBrands = [];
  const productDescriptions = [];
  for (let index = 1; index <= ITEM_COUNT; index += 1) {
    productCodes.push(`${prefix}-${String(index).padStart(4, '0')}`);
    productBrands.push(`MARCA ${String((index % 25) + 1).padStart(2, '0')}`);
    productDescriptions.push(`PRODUCTO DE PRUEBA ${index}`);
  }
  await pool.query(
    `INSERT INTO productos (codigo, marca, descripcion, estado)
     SELECT codigo, marca, descripcion, TRUE
     FROM UNNEST($1::text[], $2::text[], $3::text[]) AS incoming(codigo, marca, descripcion)`,
    [productCodes, productBrands, productDescriptions]
  );
  const products = await pool.query(
    'SELECT id, codigo, marca, descripcion FROM productos WHERE codigo = ANY($1::text[]) ORDER BY codigo',
    [productCodes]
  );

  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  const date = `${yyyy}-${mm}-${dd}`;
  const closeDate = `${yyyy}-${mm}-${dd}`;
  const numeroToma = `${prefix}-001`;
  const toma = await pool.query(
    `INSERT INTO tomas_fisicas (
      numero_toma, agencia, fecha_toma, fecha_habilitacion, fecha_cierre, hora_inicio, hora_fin, nombre_toma, estado, creado_por
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'abierta',$9)
    RETURNING id, numero_toma`,
    [
      numeroToma,
      'PRUEBA CARGA',
      date,
      date,
      closeDate,
      '00:00',
      '23:59',
      `TOMA FISICA # ${numeroToma}\nAGENCIA: PRUEBA CARGA\nHABILITACION: ${date} 00:00\nFINALIZACION: ${closeDate} 23:59`,
      admin.rows[0].id
    ]
  );
  await pool.query(
    `INSERT INTO toma_usuarios (toma_id, usuario_id)
     SELECT $1, id FROM usuarios WHERE usuario = ANY($2::text[])`,
    [toma.rows[0].id, userLogins]
  );

  return {
    tomaId: Number(toma.rows[0].id),
    users: users.rows.map((row, index) => ({ id: Number(row.id), nombre: row.nombre, usuario: row.usuario, ip: userRows[index].ip })),
    products: products.rows.map((row) => ({
      id: Number(row.id),
      codigo: row.codigo,
      marca: row.marca || '',
      descripcion: row.descripcion
    }))
  };
}

function buildFullItems(products) {
  return products.map((product, index) => ({
    producto_id: product.id,
    cantidad: (index % 9) + 1
  }));
}

function buildDiffPayload(products) {
  const upsert = [];
  const remove = [];
  for (let index = 0; index < products.length; index += 1) {
    const product = products[index];
    if (index < 60) {
      upsert.push({ producto_id: product.id, cantidad: ((index + 3) % 9) + 1 });
    } else if (index >= 60 && index < 90) {
      remove.push({ producto_id: product.id });
    }
  }
  return { upsert, remove };
}

function computeStats(durations) {
  const sorted = [...durations].sort((a, b) => a - b);
  const total = sorted.reduce((sum, item) => sum + item, 0);
  return {
    count: sorted.length,
    avg: total / Math.max(sorted.length, 1),
    min: sorted[0] || 0,
    p95: sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)] || 0,
    max: sorted[sorted.length - 1] || 0
  };
}

async function runPhase(label, workers) {
  const phaseStarted = performance.now();
  const settled = await Promise.allSettled(workers);
  const elapsed = performance.now() - phaseStarted;
  const durations = [];
  const errors = [];
  for (const result of settled) {
    if (result.status === 'fulfilled') {
      durations.push(result.value.duration);
    } else {
      const reason = result.reason;
      errors.push(reason?.message || String(reason));
      if (typeof reason?.duration === 'number') durations.push(reason.duration);
    }
  }
  return {
    label,
    elapsed,
    stats: computeStats(durations),
    success: settled.filter((item) => item.status === 'fulfilled').length,
    failed: errors.length,
    errors
  };
}

function assertPhasePassed(phase) {
  if (phase.failed > 0 || phase.success === 0) {
    throw new Error(`${phase.label} fallo: ${phase.success}/${USER_COUNT} exitos, ${phase.failed} fallos. ${phase.errors.slice(0, 3).join(' | ')}`);
  }
}

async function main() {
  const scenario = await prepareScenario();
  const server = app.listen(0, '127.0.0.1');
  try {
    await new Promise((resolve) => server.once('listening', resolve));
    const address = server.address();
    const baseUrl = `http://127.0.0.1:${address.port}/api/admin`;
    const fullItems = buildFullItems(scenario.products);
    const diffPayload = buildDiffPayload(scenario.products);

    const loginPhase = await runPhase(
      'login',
      scenario.users.map(async (user) => {
        const { data, duration } = await requestJson(baseUrl, '/auth/login', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Forwarded-For': user.ip
          },
          body: JSON.stringify({ usuario: user.usuario, password: PASSWORD })
        });
        user.token = data.token;
        return { duration };
      })
    );
    assertPhasePassed(loginPhase);

    const startPhase = await runPhase(
      'start',
      scenario.users.map(async (user) => {
        const { data, duration } = await requestJson(baseUrl, `/mi/tomas/${scenario.tomaId}/iniciar`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${user.token}`,
            'X-Forwarded-For': user.ip
          },
          body: JSON.stringify({})
        });
        user.conteoId = Number(data.conteo_id);
        return { duration };
      })
    );
    assertPhasePassed(startPhase);

    const bulkSavePhase = await runPhase(
      'bulk_draft_save_600',
      scenario.users.map(async (user) => requestJson(baseUrl, `/mi/conteos/${user.conteoId}/guardar_cambios`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${user.token}`,
          'X-Forwarded-For': user.ip
        },
        body: JSON.stringify({
          conteo_version: 0,
          upsert: fullItems,
          remove: []
        })
      }))
    );
    assertPhasePassed(bulkSavePhase);

    const secondSavePhase = await runPhase(
      'differential_save_90_changes',
      scenario.users.map(async (user) => requestJson(baseUrl, `/mi/conteos/${user.conteoId}/guardar_cambios`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${user.token}`,
          'X-Forwarded-For': user.ip
        },
        body: JSON.stringify({
          conteo_version: 1,
          upsert: diffPayload.upsert,
          remove: diffPayload.remove
        })
      }))
    );
    assertPhasePassed(secondSavePhase);

    const finalItems = fullItems
      .filter((item, index) => index < 60 || index >= 90)
      .map((item, index) => ({ ...item, cantidad: index < 60 ? ((index + 3) % 9) + 1 : item.cantidad }));

    const finishPhase = await runPhase(
      'finalize_570_items',
      scenario.users.map(async (user) => requestJson(baseUrl, `/mi/conteos/${user.conteoId}/finalizar`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${user.token}`,
          'X-Forwarded-For': user.ip
        },
        body: JSON.stringify({
          conteo_version: 2,
          items: finalItems
        })
      }))
    );
    assertPhasePassed(finishPhase);

    const lineCount = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM conteo_detalle d
       INNER JOIN conteos c ON c.id = d.conteo_id
       WHERE c.toma_id = $1`,
      [scenario.tomaId]
    );
    const finishedCount = await pool.query(
      "SELECT COUNT(*)::int AS total FROM conteos WHERE toma_id = $1 AND estado = 'finalizado'",
      [scenario.tomaId]
    );

    const phases = [loginPhase, startPhase, bulkSavePhase, secondSavePhase, finishPhase];
    console.log(`\nSimulacion completada ${nowIso()}`);
    console.log(`Usuarios: ${USER_COUNT}`);
    console.log(`Items por usuario: ${ITEM_COUNT}`);
    console.log(`Lineas finales esperadas aproximadas: ${USER_COUNT * finalItems.length}`);
    console.log(`Lineas finales registradas: ${lineCount.rows[0].total}`);
    console.log(`Conteos finalizados: ${finishedCount.rows[0].total}/${USER_COUNT}\n`);
    for (const phase of phases) {
      console.log(`${phase.label}`);
      console.log(`  exito: ${phase.success}/${USER_COUNT} | fallos: ${phase.failed}`);
      console.log(`  total fase: ${timeLabel(phase.elapsed)}`);
      console.log(`  avg: ${timeLabel(phase.stats.avg)} | min: ${timeLabel(phase.stats.min)} | p95: ${timeLabel(phase.stats.p95)} | max: ${timeLabel(phase.stats.max)}`);
      if (phase.errors.length) {
        console.log(`  errores: ${phase.errors.slice(0, 5).join(' | ')}`);
      }
    }
  } finally {
    await cleanupScenario().catch(() => {});
    await new Promise((resolve) => server.close(resolve));
    await pool.end();
  }
}

main().catch((error) => {
  console.error('Simulacion fallida:', error);
  pool.end().catch(() => {});
  process.exit(1);
});
