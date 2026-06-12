import React from 'react';

export function roleLabel(role) {
  const labels = {
    admin: 'Administrador',
    supervisor: 'Supervisor',
    reportes: 'Reportes',
    usuario: 'Usuario',
    operador: 'Usuario'
  };
  return labels[role] || 'Administrador';
}

export function truncateText(value, maxLength = 110) {
  const text = String(value || '');
  return text.length > maxLength ? `${text.slice(0, maxLength).trimEnd()}...` : text;
}

export function formatValue(value) {
  if (React.isValidElement(value)) return value;
  if (typeof value === 'boolean') return value ? 'Activo' : 'Inactivo';
  if (value == null) return '-';
  return String(value);
}

export function formatDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('sv-SE').replace('T', ' ').slice(0, 19);
}

export function composeDateTime(date, time) {
  if (!date && !time) return '';
  return `${date || ''}T${time || ''}`;
}

export function previewTomaNumber(date) {
  const year = String(date || new Date().getFullYear()).slice(0, 4);
  return `${year}-000`;
}

export function formatPeriodDate(date, time) {
  if (!date && !time) return '';
  const dateOnly = String(date || '1970-01-01').slice(0, 10);
  const timeOnly = String(time || '00:00').slice(0, 5);
  const parsed = new Date(`${dateOnly}T${timeOnly}`);
  if (Number.isNaN(parsed.getTime())) return `${dateOnly || ''} ${timeOnly || ''}`.trim();
  const days = ['DOMINGO', 'LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO'];
  const dayName = days[parsed.getDay()];
  const dd = String(parsed.getDate()).padStart(2, '0');
  const mm = String(parsed.getMonth() + 1).padStart(2, '0');
  const yyyy = parsed.getFullYear();
  return `${dayName} ${dd}/${mm}/${yyyy} ${timeOnly || ''}`.trim();
}

export function formatShortPeriod(toma) {
  const start = `${String(toma.fecha_habilitacion || '').slice(0, 10)} ${String(toma.hora_inicio || '').slice(0, 5)}`.trim();
  const end = `${String(toma.fecha_cierre || '').slice(0, 10)} ${String(toma.hora_fin || '').slice(0, 5)}`.trim();
  return `${start} / ${end}`;
}

export function defaultReportRange() {
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
  return {
    from: firstDay.toISOString().slice(0, 10),
    to: today.toISOString().slice(0, 10)
  };
}

export function isWithinRange(value, from, to) {
  if (!value) return false;
  const day = String(value).slice(0, 10);
  return (!from || day >= from) && (!to || day <= to);
}

export function buildDailyReport(items) {
  const days = new Map();
  for (const item of items) {
    const day = String(item.fecha_inicio || item.fecha_finalizacion || '').slice(0, 10);
    if (!day) continue;
    const current = days.get(day) || { day, total: 0, drafts: 0, finished: 0 };
    current.total += 1;
    if (item.estado === 'finalizado') current.finished += 1;
    else current.drafts += 1;
    days.set(day, current);
  }
  return [...days.values()].sort((a, b) => a.day.localeCompare(b.day));
}

export function parseAgencyFromTomaName(value) {
  const match = String(value || '').match(/AGENCIA:\s*([^\n\r]*)/i);
  return match?.[1]?.trim() || '';
}

export function buildTomaReport(items) {
  const groups = new Map();
  for (const item of items) {
    const key = item.toma_id || item.numero_toma || item.id;
    const current = groups.get(key) || {
      id: key,
      numero_toma: item.numero_toma,
      nombre_toma: item.nombre_toma || '',
      agencia: parseAgencyFromTomaName(item.nombre_toma),
      total: 0,
      finished: 0,
      status: 'open',
      statusLabel: 'abierta',
      excelId: null,
      finishedAt: null
    };
    current.total += 1;
    if (item.estado === 'finalizado') {
      current.finished += 1;
      current.excelId = current.excelId || item.id;
      current.finishedAt = item.fecha_finalizacion || current.finishedAt;
    }
    groups.set(key, current);
  }
  return [...groups.values()].map((group) => ({
    ...group,
    status: group.finished > 0 && group.finished === group.total ? 'done' : 'open',
    statusLabel: group.finished > 0 && group.finished === group.total ? 'finalizada' : 'abierta'
  }));
}

export function formatDateOnly(value) {
  if (!value) return '-';
  const [year, month, day] = String(value).slice(0, 10).split('-');
  if (!year || !month || !day) return String(value);
  return `${day}/${month}/${year}`;
}
